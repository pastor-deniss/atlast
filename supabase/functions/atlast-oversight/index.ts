// atlast-oversight: Atlast's control of a group's key rules. Rules live in
// SQL (.scratch/atlast-mvp-spec/atlast-oversight.sql); this checks shape and
// passes the signed-in user as the actor.
//
//   set_rules  Atlast admin enters the rules (only while unlocked), optionally locking them
//   propose    Group Admin proposes a change to locked rules, with a reason
//   cancel     Group Admin withdraws a proposal before the vote opens
//   open_vote  Atlast admin opens the member vote (days, default 7)
//   vote       any active member votes approve / decline (secret ballot)
//   decide     Atlast admin approves (needs a third of members voting yes) or rejects
import { withSupabase } from 'jsr:@supabase/server@^1';

type Payload = {
  action?: string;
  group_id?: string;
  change_id?: string;
  rules?: Record<string, unknown>;
  lock?: boolean;
  reason?: string;
  days?: number;
  choice?: string;
  decision?: string;
  note?: string | null;
};

const RULE_KEYS = [
  'contribution_amount',
  'contribution_frequency',
  'share_value',
  'loan_interest_rate',
  'late_penalty_weekly_rate',
  'jamii_contribution_amount',
];

const bad = (error: string) => Response.json({ error }, { status: 400 });

function cleanRules(rules: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {};
  for (const k of RULE_KEYS) if (rules && rules[k] !== undefined && rules[k] !== null && rules[k] !== '') out[k] = rules[k];
  return out;
}

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

    let fn: string;
    let args: Record<string, unknown>;
    switch (p.action) {
      case 'set_rules':
        if (!p.group_id) return bad('group_id is required');
        fn = 'atlast_set_group_rules';
        args = { p_group_id: p.group_id, p_actor_id: me, p_rules: cleanRules(p.rules), p_lock: p.lock === true };
        break;
      case 'propose': {
        if (!p.group_id) return bad('group_id is required');
        const rules = cleanRules(p.rules);
        if (Object.keys(rules).length === 0) return bad('Change at least one rule.');
        fn = 'propose_group_rule_change';
        args = { p_group_id: p.group_id, p_admin_id: me, p_rules: rules, p_reason: p.reason ?? '' };
        break;
      }
      case 'cancel':
        if (!p.change_id) return bad('change_id is required');
        fn = 'cancel_group_rule_change';
        args = { p_change_id: p.change_id, p_admin_id: me };
        break;
      case 'open_vote':
        if (!p.change_id) return bad('change_id is required');
        fn = 'open_group_rule_vote';
        args = { p_change_id: p.change_id, p_actor_id: me, p_days: Number(p.days ?? 7) };
        break;
      case 'vote':
        if (!p.change_id) return bad('change_id is required');
        if (p.choice !== 'approve' && p.choice !== 'decline') return bad('Invalid vote.');
        fn = 'cast_group_rule_vote';
        args = { p_change_id: p.change_id, p_member_id: me, p_choice: p.choice };
        break;
      case 'decide':
        if (!p.change_id) return bad('change_id is required');
        if (p.decision !== 'approve' && p.decision !== 'reject') return bad('Invalid decision.');
        fn = 'decide_group_rule_change';
        args = { p_change_id: p.change_id, p_actor_id: me, p_decision: p.decision, p_note: p.note ?? null };
        break;
      default:
        return bad('Unknown action.');
    }

    const { data, error } = await supabaseAdmin.rpc(fn, args);
    if (error) return bad(error.message);
    return Response.json({ result: data });
  }),
};
