// treasury: the Treasurer role and the year-end profit share-out. Rules live
// in SQL (.scratch/atlast-mvp-spec/treasurer-and-shareout.sql); this checks
// shape and passes the signed-in user as the actor.
//
//   set_role  Group Admin appoints ('treasurer') or removes ('member') the Treasurer
//   prepare   Treasurer prepares the share-out for a year
//   decide    Group Admin approves or rejects it
//   pay       Treasurer or Admin records one member's cash payout
import { withSupabase } from 'jsr:@supabase/server@^1';

const PAYMENT_METHODS = ['mpesa', 'airtel_money', 'tigo_pesa', 'cash'];

type Payload = {
  action?: string;
  group_id?: string;
  member_id?: string;
  role?: string;
  year?: number;
  shareout_id?: string;
  decision?: string;
  note?: string | null;
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
      case 'set_role':
        if (!p.group_id || !p.member_id) return bad('group_id and member_id are required');
        if (p.role !== 'treasurer' && p.role !== 'member') return bad('Unknown role.');
        call = { fn: 'set_member_role', args: { p_group_id: p.group_id, p_admin_id: me, p_member_id: p.member_id, p_role: p.role } };
        break;
      case 'prepare': {
        const year = Number(p.year);
        if (!p.group_id) return bad('group_id is required');
        if (!Number.isInteger(year)) return bad('Choose a year.');
        call = { fn: 'prepare_profit_shareout', args: { p_group_id: p.group_id, p_treasurer_id: me, p_year: year } };
        break;
      }
      case 'decide':
        if (!p.shareout_id) return bad('shareout_id is required');
        if (p.decision !== 'approve' && p.decision !== 'reject') return bad('Invalid decision.');
        call = {
          fn: 'decide_profit_shareout',
          args: { p_shareout_id: p.shareout_id, p_admin_id: me, p_decision: p.decision, p_note: p.note ?? null },
        };
        break;
      case 'pay': {
        const method = p.payment_method ?? null;
        const reference = (p.reference ?? '').trim();
        if (!p.shareout_id || !p.member_id) return bad('shareout_id and member_id are required');
        if (method === null || !PAYMENT_METHODS.includes(method)) return bad('Choose how you paid.');
        if (method !== 'cash' && !reference) return bad('Enter the mobile money reference.');
        call = {
          fn: 'pay_profit_share',
          args: {
            p_shareout_id: p.shareout_id,
            p_member_id: p.member_id,
            p_officer_id: me,
            p_reference: reference || null,
            p_payment_method: method,
          },
        };
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
