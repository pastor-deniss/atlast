// groupSpending: Jamii (welfare) payouts and miscellaneous group expenses.
// One endpoint, one action per call. Every rule lives in the SQL functions
// (.scratch/atlast-mvp-spec/jamii-and-expenses.sql); this only checks shape
// and passes the signed-in user as the actor.
//
//   create           Group Admin starts a request (3 random approvers, or the
//                    admin's 3 picks when too few qualify)
//   decide           an assigned approver approves or declines
//   pay              Group Admin records the payout of an approved request
//   cancel           Group Admin withdraws an unpaid request
//   set_jamii_amount Group Admin sets the regular Jamii contribution
import { withSupabase } from 'jsr:@supabase/server@^1';

const PAYMENT_METHODS = ['mpesa', 'airtel_money', 'tigo_pesa', 'cash'];

type Payload = {
  action?: string;
  group_id?: string;
  request_id?: string;
  kind?: string;
  beneficiary_id?: string | null;
  amount?: number;
  reason?: string;
  category?: string | null;
  approver_ids?: string[] | null;
  decision?: string;
  comment?: string | null;
  reference?: string | null;
  payment_method?: string | null;
};

const bad = (error: string) => Response.json({ error }, { status: 400 });

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;
    const me = userClaims!.id;

    let p: Payload;
    try {
      p = await req.json();
    } catch {
      return bad('Invalid JSON body');
    }

    let call: { fn: string; args: Record<string, unknown> };
    switch (p.action) {
      case 'create': {
        const amount = Number(p.amount);
        if (!p.group_id) return bad('group_id is required');
        if (p.kind !== 'jamii' && p.kind !== 'expense') return bad('Unknown request type.');
        if (!Number.isFinite(amount) || amount <= 0) return bad('Amount must be positive.');
        if (!p.reason || p.reason.trim().length < 3) return bad('Say what the money is for.');
        if (p.reason.length > 500) return bad('Keep the reason under 500 characters.');
        call = {
          fn: 'create_spend_request',
          args: {
            p_group_id: p.group_id,
            p_admin_id: me,
            p_kind: p.kind,
            p_beneficiary_id: p.kind === 'jamii' ? (p.beneficiary_id ?? null) : null,
            p_amount: amount,
            p_reason: p.reason,
            p_category: p.category ?? null,
            p_picked: Array.isArray(p.approver_ids) && p.approver_ids.length > 0 ? p.approver_ids : null,
          },
        };
        break;
      }
      case 'decide':
        if (!p.request_id) return bad('request_id is required');
        if (p.decision !== 'approve' && p.decision !== 'decline') return bad('Invalid decision.');
        call = {
          fn: 'decide_spend_request',
          args: { p_request_id: p.request_id, p_approver_id: me, p_decision: p.decision, p_comment: p.comment ?? null },
        };
        break;
      case 'pay': {
        const method = p.payment_method ?? null;
        const reference = (p.reference ?? '').trim();
        if (!p.request_id) return bad('request_id is required');
        if (method === null || !PAYMENT_METHODS.includes(method)) return bad('Choose how you paid.');
        if (method !== 'cash' && !reference) return bad('Enter the mobile money reference.');
        call = {
          fn: 'pay_spend_request',
          args: { p_request_id: p.request_id, p_admin_id: me, p_reference: reference || null, p_payment_method: method },
        };
        break;
      }
      case 'cancel':
        if (!p.request_id) return bad('request_id is required');
        call = { fn: 'cancel_spend_request', args: { p_request_id: p.request_id, p_admin_id: me } };
        break;
      case 'set_jamii_amount': {
        const amount = Number(p.amount);
        if (!p.group_id) return bad('group_id is required');
        if (!Number.isFinite(amount) || amount < 0) return bad('Amount must be zero or more.');
        call = { fn: 'set_jamii_amount', args: { p_group_id: p.group_id, p_admin_id: me, p_amount: amount } };
        break;
      }
      default:
        return bad('Unknown action.');
    }

    const { data, error } = await supabaseAdmin.rpc(call.fn, call.args);
    if (error) return bad(error.message);
    return Response.json({ result: data });
  }),
};
