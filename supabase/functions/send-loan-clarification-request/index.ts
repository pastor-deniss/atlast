// sendLoanClarificationRequest (ticket 13/17). Non-blocking (ticket 10): does
// not touch loan_reviewers.decision, so it can't stop the other reviewers
// from reaching the fail-fast threshold. No dedicated Postgres function
// needed -- just a guarded insert, no cascade/atomicity concern.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  loan_id: string;
  message: string;
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

    const { loan_id, message } = body;
    if (!loan_id || !message || !message.trim()) {
      return Response.json({ error: 'loan_id and message are required' }, { status: 400 });
    }

    const { data: reviewerRow } = await supabaseAdmin
      .from('loan_reviewers')
      .select('id')
      .eq('loan_id', loan_id)
      .eq('reviewer_id', userClaims!.id)
      .maybeSingle();

    if (!reviewerRow) {
      return Response.json(
        { error: 'You are not an assigned reviewer for this loan.' },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin.from('loan_clarification_requests').insert({
      loan_id,
      reviewer_id: userClaims!.id,
      message: message.trim(),
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ status: 'sent' });
  }),
};
