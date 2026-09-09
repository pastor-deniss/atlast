// castLoanReviewDecision (ticket 13/17). Thin wrapper over
// cast_loan_review_decision, which fail-fast-resolves the loan the instant
// 2-of-3 reviewers agree, under a row lock (avoids two concurrent votes both
// missing the threshold).
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

    const { data: loan, error } = await supabaseAdmin.rpc('cast_loan_review_decision', {
      p_loan_id: loan_id,
      p_reviewer_id: userClaims!.id,
      p_decision: decision,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ loan });
  }),
};
