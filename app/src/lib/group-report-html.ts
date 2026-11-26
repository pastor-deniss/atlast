import { STATUS } from '@/components/charts/status-colors';
import { formatDateTime } from '@/lib/datetime';
import { healthBand, type GroupOverview, type PeriodReport, type PeriodTotals } from '@/lib/group-report';

// The group report as a printable page (shared as a PDF via the same export
// as the account statement). Charts are drawn in plain HTML/SVG so they
// print exactly as they look in the app. Every rule is scoped under
// `.atlast-report` so it can be printed from inside the web app.

type Translate = (text: string, vars?: Record<string, string | number>) => string;

export type ReportMeasure = 'contributions' | 'disbursed' | 'repayments';

const MEASURE_LABEL: Record<ReportMeasure, string> = {
  contributions: 'Contributions',
  disbursed: 'Loans Disbursed',
  repayments: 'Repayments Collected',
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function ring(score: number, color: string) {
  const size = 150;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, score));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#EFE9DC" stroke-width="${stroke}"/>
  ${value > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(value / 100) * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : ''}
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="40" font-weight="700" fill="#13201B">${value}</text>
</svg>`;
}

export function groupReportHtml(
  input: {
    groupName: string;
    currency: string;
    overview: GroupOverview;
    period: PeriodReport;
    trend: PeriodTotals[];
    measure: ReportMeasure;
  },
  t: Translate
): { css: string; body: string } {
  const { overview, period, trend, measure } = input;
  const money = (n: number) => `${escapeHtml(input.currency)} ${Math.round(n).toLocaleString()}`;
  const band = healthBand(overview.health.score);
  const bandColor = STATUS[band.tone];

  const parts = overview.health.parts
    .map(
      (p) => `<div class="bar-item">
  <div class="bar-labels"><span>${escapeHtml(t(p.label))}${p.detail ? ` (${escapeHtml(p.detail)})` : ''}</span><b>${p.value}%</b></div>
  <div class="track"><div class="fill" style="width:${Math.max(p.value > 0 ? 2 : 0, p.value)}%"></div></div>
</div>`
    )
    .join('');

  const max = Math.max(1, ...trend.map((p) => p[measure]));
  const columns = trend
    .map((p, i) => {
      const h = p[measure] > 0 ? Math.max(3, (p[measure] / max) * 120) : 0;
      const last = i === trend.length - 1;
      return `<div class="col">
  <div class="col-value">${last ? money(p[measure]) : ''}</div>
  <div class="col-bar" style="height:${h}px;${last ? '' : 'opacity:0.45;'}"></div>
  <div class="col-label${last ? ' strong' : ''}">${escapeHtml(p.label)}</div>
</div>`;
    })
    .join('');

  const moneyMax = Math.max(1, period.contributions, period.repayments, period.disbursed);
  const moneyBars = [
    ['Contributions', period.contributions],
    ['Repayments Collected', period.repayments],
    ['Loans Disbursed', period.disbursed],
  ]
    .map(
      ([label, v]) => `<div class="bar-item">
  <div class="bar-labels"><span>${escapeHtml(t(label as string))}</span><b>${money(v as number)}</b></div>
  <div class="track"><div class="fill" style="width:${(v as number) > 0 ? Math.max(2, ((v as number) / moneyMax) * 100) : 0}%"></div></div>
</div>`
    )
    .join('');

  const tile = (label: string, value: string) =>
    `<div class="tile"><div class="label">${escapeHtml(label)}</div><div class="value">${value}</div></div>`;

  const css = `
.atlast-report { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #13201B; font-size: 12px; line-height: 1.45; }
.atlast-report * { box-sizing: border-box; }
.atlast-report .band { background: #0F3D2E; color: #F6F3EC; padding: 18px 22px; border-radius: 10px; }
.atlast-report .brand { font-size: 20px; font-weight: 700; }
.atlast-report .brand span { color: #F2B33D; }
.atlast-report h1 { font-size: 18px; margin: 8px 0 2px; }
.atlast-report .band .muted { color: rgba(246,243,236,0.8); }
.atlast-report .muted { color: #5B635F; }
.atlast-report .section { border: 1px solid #E7E1D3; border-radius: 10px; padding: 14px 16px; margin-top: 12px; background: #FBF9F4; page-break-inside: avoid; }
.atlast-report h2 { font-size: 14px; margin: 0 0 8px; }
.atlast-report .health { display: flex; gap: 18px; align-items: center; }
.atlast-report .health .bars { flex: 1; }
.atlast-report .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 700; font-size: 11px; color: #13201B; background: #EFE9DC; }
.atlast-report .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
.atlast-report .bar-item { margin-bottom: 9px; }
.atlast-report .bar-labels { display: flex; justify-content: space-between; gap: 8px; color: #5B635F; }
.atlast-report .bar-labels b { color: #13201B; }
.atlast-report .track { height: 10px; background: #EFE9DC; border-radius: 4px; overflow: hidden; margin-top: 3px; }
.atlast-report .fill { height: 10px; background: #0F3D2E; border-radius: 0 4px 4px 0; }
.atlast-report .tiles { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.atlast-report .tile { flex: 1 1 30%; border: 1px solid #E7E1D3; border-radius: 8px; padding: 9px 11px; background: #FBF9F4; }
.atlast-report .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.6px; color: #5B635F; }
.atlast-report .value { font-size: 15px; font-weight: 700; color: #0F3D2E; }
.atlast-report .cols { display: flex; align-items: flex-end; gap: 6px; height: 160px; border-bottom: 1px solid #C2C2C2; }
.atlast-report .col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
.atlast-report .col-bar { width: 22px; background: #0F3D2E; border-radius: 4px 4px 0 0; }
.atlast-report .col-value { font-size: 10px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; }
.atlast-report .col-labels { display: flex; gap: 6px; }
.atlast-report .col-label { flex: 1; text-align: center; font-size: 10px; color: #5B635F; margin-top: 4px; }
.atlast-report .col-label.strong { color: #13201B; font-weight: 700; }
.atlast-report .foot { margin-top: 14px; font-size: 10px; color: #5B635F; }
`;

  const body = `<div class="atlast-report">
  <div class="band">
    <div class="brand">atlast<span>.</span></div>
    <h1>${escapeHtml(t('Group Report'))}</h1>
    <div class="muted">${escapeHtml(input.groupName)} · ${escapeHtml(t('Generated'))} ${escapeHtml(formatDateTime(new Date()))}</div>
  </div>

  <div class="section">
    <h2>${escapeHtml(t('Financial Health'))} <span class="pill"><span class="dot" style="background:${bandColor}"></span>${escapeHtml(t(band.label))}</span></h2>
    <div class="health">
      <div>${ring(overview.health.score, bandColor)}<div class="muted" style="text-align:center">${escapeHtml(t('out of 100'))}</div></div>
      <div class="bars">${parts}<div class="muted">${escapeHtml(t('The score is the average of the three parts above.'))}</div></div>
    </div>
  </div>

  <div class="tiles">
    ${tile(t('Total Savings'), money(overview.savings))}
    ${tile(t('Active Loans ({count})', { count: overview.activeLoans }), money(overview.activeLoansOwed))}
    ${tile(t('Money held'), money(overview.cash))}
    ${tile(t('Members'), String(overview.members))}
    ${tile(t('All Loans'), String(overview.allLoans))}
    ${tile(t('Repaid'), `${overview.repaidShare}%`)}
  </div>

  <div class="section">
    <h2>${escapeHtml(t('Trends'))}: ${escapeHtml(t(MEASURE_LABEL[measure]))}</h2>
    <div class="cols">${columns}</div>
  </div>

  <div class="section">
    <h2>${escapeHtml(t('{period} Report', { period: period.title }))}</h2>
    ${moneyBars}
    <div class="tiles">
      ${tile(t('New Members'), String(period.newMembers))}
      ${tile(t('Loans Approved'), `${period.loansApproved}/${period.loansApproved + period.loansDeclined}`)}
      ${tile(t('Motions Approved'), `${period.motionsApproved}/${period.motionsApproved + period.motionsDeclined}`)}
    </div>
  </div>

  <div class="foot">${escapeHtml(t('Figures are worked out from the group ledger at the time this report was made. Jamii money is kept apart and not included in savings or money held.'))}</div>
</div>`;

  return { css, body };
}

export function groupReportFileName(groupName: string, periodTitle: string) {
  const safe = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `Atlast-Report-${safe(groupName)}-${safe(periodTitle)}`;
}
