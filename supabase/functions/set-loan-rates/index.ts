// setLoanRates. Group Admin only: the group's flat loan interest % and weekly
// late-penalty %. Applies to loans requested afterwards; existing loans keep
// their rates. set_group_loan_rates() also audits the change and notifies
// every member.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  group_id: string;
  interest_rate: number;
  penalty_weekly_rate: number;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    let payload: Payload;
    try {
      payload = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const interest = Number(payload.interest_rate);
    const penalty = Number(payload.penalty_weekly_rate);
    if (!payload.group_id) return Response.json({ error: 'group_id is required' }, { status: 400 });
    if (!Number.isFinite(interest) || interest < 0 || interest > 100) {
      return Response.json({ error: 'Interest must be between 0% and 100%.' }, { status: 400 });
    }
    if (!Number.isFinite(penalty) || penalty < 0 || penalty > 20) {
      return Response.json({ error: 'The weekly penalty must be between 0% and 20%.' }, { status: 400 });
    }

    const { data: group, error } = await supabaseAdmin.rpc('set_group_loan_rates', {
      p_group_id: payload.group_id,
      p_admin_id: userClaims!.id,
      p_interest_rate: interest,
      p_penalty_weekly_rate: penalty,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ group });
  }),
};
