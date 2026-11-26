import type { Href } from 'expo-router';

import { supabase } from '@/lib/supabase';

// In-app notifications, created by database triggers
// (.scratch/atlast-mvp-spec/notifications.sql). Only `kind` + `params` are
// stored; the wording lives here so it follows the app's language.

export type AppNotification = {
  id: string;
  group_id: string | null;
  kind: string;
  entity_id: string | null;
  params: Record<string, string | number | null>;
  read_at: string | null;
  created_at: string;
};

type Translate = (text: string, vars?: Record<string, string | number>) => string;

const PAGE_SIZE = 50;

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('id, group_id, kind, entity_id, params, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  return (data ?? []) as AppNotification[];
}

export async function countUnread(): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return count ?? 0;
}

export async function markRead(ids: string[]) {
  if (ids.length === 0) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null);
}

function money(params: AppNotification['params']) {
  const amount = Number(params.amount ?? 0);
  return `${params.currency ?? ''} ${amount.toLocaleString()}`.trim();
}

/** Title and body in the current language. English strings are the translation keys. */
export function describe(n: AppNotification, t: Translate): { title: string; body: string } {
  const p = n.params ?? {};
  const name = String(p.name ?? '');
  const group = String(p.group ?? '');
  const subject = String(p.subject ?? '');
  const amount = money(p);

  switch (n.kind) {
    case 'announcement.posted':
      return { title: t('New announcement'), body: String(p.title ?? '') };
    case 'announcement.important':
      return { title: t('Important announcement'), body: String(p.title ?? '') };
    case 'membership.applied':
      return { title: t('New membership application'), body: t('{name} applied to join {group}.', { name, group }) };
    case 'membership.approved':
      return { title: t('Welcome to {group}!', { group }), body: t('Your application was approved.') };
    case 'membership.declined':
      return { title: t('Application not approved'), body: t("Your application to {group} wasn't approved.", { group }) };
    case 'vote.opened':
      return { title: t('New vote'), body: t("Vote on {name}'s membership application.", { name }) };
    case 'loan.review_requested':
      return { title: t('Loan review requested'), body: t("Review {name}'s loan request of {amount}.", { name, amount }) };
    case 'loan.admin_decision_needed':
      return { title: t('A loan needs your decision'), body: t('{name} requested a loan of {amount}.', { name, amount }) };
    case 'loan.approved':
      return { title: t('Loan approved'), body: t('Your loan of {amount} was approved.', { amount }) };
    case 'loan.declined':
      return { title: t('Loan not approved'), body: t('Your loan request of {amount} was declined.', { amount }) };
    case 'loan.disbursed':
      return { title: t('Loan paid out'), body: t('Your loan of {amount} has been paid out to you.', { amount }) };
    case 'loan.repaid':
      return { title: t('Loan fully repaid'), body: t('You have repaid your loan of {amount}. Well done!', { amount }) };
    case 'loan.defaulted':
      return {
        title: t('Loan marked as defaulted'),
        body: t('Your loan of {amount} was marked as defaulted. Please talk to your Group Admin.', { amount }),
      };
    case 'transaction.reversed':
      return {
        title: t('An entry was reversed'),
        body: p.reason
          ? t('A {amount} entry on your account was reversed: {reason}', { amount, reason: String(p.reason) })
          : t('A {amount} entry on your account was reversed.', { amount }),
      };
    case 'complaint.submitted':
      return { title: t('New member complaint'), body: `${name}: ${subject}` };
    case 'complaint.in_review':
      return { title: t('Your complaint is being reviewed'), body: subject };
    case 'complaint.resolved':
      return { title: t('Your complaint was resolved'), body: subject };
    case 'complaint.rejected':
      return { title: t('Your complaint was not upheld'), body: subject };
    case 'group.loan_rates_changed':
      return {
        title: t('Loan rates changed'),
        body: t('New loans: {interest} interest, {penalty} per week late.', {
          interest: `${Number(p.interest ?? 0)}%`,
          penalty: `${Number(p.penalty ?? 0)}%`,
        }),
      };
    default:
      return { title: t('Notification'), body: '' };
  }
}

/** Where tapping a notification goes. */
export function destination(n: AppNotification): Href | null {
  const id = n.entity_id ?? '';
  const [area] = n.kind.split('.');
  switch (area) {
    case 'announcement':
      return '/(app)/announcements';
    case 'membership':
      return n.kind === 'membership.applied'
        ? { pathname: '/(app)/governance/application/[id]', params: { id } }
        : '/';
    case 'vote':
      return { pathname: '/(app)/governance/[id]', params: { id } };
    case 'loan':
      return { pathname: '/(app)/loan/[id]', params: { id } };
    case 'transaction':
      return '/(app)/statement';
    case 'complaint':
      return { pathname: '/(app)/complaints/[id]', params: { id } };
    case 'group':
      return '/(app)/group-dashboard';
    default:
      return null;
  }
}

/** English icon names per area: SF Symbol, Material Symbol. */
export function iconFor(kind: string): [string, string] {
  const [area] = kind.split('.');
  switch (area) {
    case 'announcement':
      return ['megaphone', 'campaign'];
    case 'membership':
      return ['person.badge.plus', 'person_add'];
    case 'vote':
      return ['checkmark.square', 'how_to_vote'];
    case 'loan':
      return ['building.columns', 'account_balance'];
    case 'transaction':
      return ['arrow.uturn.backward', 'undo'];
    case 'complaint':
      return ['exclamationmark.bubble', 'report'];
    case 'group':
      return ['percent', 'percent'];
    default:
      return ['bell', 'notifications'];
  }
}

export function timeAgo(iso: string, t: Translate) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return t('Just now');
  if (minutes < 60) return t('{count}m ago', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{count}h ago', { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('{count}d ago', { count: days });
  return new Date(iso).toLocaleDateString();
}
