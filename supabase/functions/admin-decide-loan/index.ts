// adminDecideLoan (ticket 13/17). Only valid when review_mode='admin_fallback'
// (fewer than 3 eligible reviewers existed at request time, ticket 05/10).
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  loan_id: string;
  decision: 'approve' | 'decline';
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    let body: Payload;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { loan_id, decision } = body;
    if (!loan_id || (decision !== 'approve' && decision !== 'decline')) {
      return Response.json(
        { error: 'loan_id and a decision of approve or decline are required' },
        { status: 400 }
      );
    }

    const { data: loanRow } = await supabaseAdmin
      .from('loans')
      .select('group_id')
      .eq('id', loan_id)
      .maybeSingle();
    if (!loanRow) {
      return Response.json({ error: 'Loan not found.' }, { status: 404 });
    }

    const { data: adminMembership } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userClaims!.id)
      .eq('group_id', loanRow.group_id)
      .eq('role', 'group_admin')
      .eq('status', 'active')
      .maybeSingle();
    if (!adminMembership) {
      return Response.json({ error: 'Only a Group Admin can perform this action.' }, { status: 403 });
    }

    const { data: loan, error } = await supabaseAdmin.rpc('admin_decide_loan', {
      p_loan_id: loan_id,
      p_admin_id: userClaims!.id,
      p_decision: decision,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ loan });
  }),
};
