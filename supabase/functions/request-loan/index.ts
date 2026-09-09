// requestLoan (ticket 13/17). Thin wrapper over the request_loan Postgres
// function, which does the eligibility check, review_mode determination,
// and random reviewer selection atomically (one transaction).
import { withSupabase } from 'jsr:@supabase/server@^1';

interface RequestLoanPayload {
  group_id: string;
  principal: number;
  purpose?: string;
  term_weeks: number;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    let body: RequestLoanPayload;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { group_id, principal, purpose, term_weeks } = body;
    if (!group_id || !principal || !term_weeks) {
      return Response.json(
        { error: 'group_id, principal, and term_weeks are required' },
        { status: 400 }
      );
    }

    const { data: loan, error } = await supabaseAdmin.rpc('request_loan', {
      p_borrower_id: userClaims!.id,
      p_group_id: group_id,
      p_principal: principal,
      p_purpose: purpose ?? null,
      p_term_weeks: term_weeks,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ loan });
  }),
};
