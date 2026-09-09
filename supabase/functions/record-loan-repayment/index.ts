// recordLoanRepayment (ticket 13/17). No overpayment (ticket 17, Q4) --
// capped at the outstanding balance. Otherwise flexible/partial, no
// schedule enforcement (ticket 10, Q6).
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  loan_id: string;
  amount: number;
  reference: string;
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

    const { loan_id, amount, reference } = body;
    if (!loan_id || !amount || !reference || !reference.trim()) {
      return Response.json(
        { error: 'loan_id, amount, and reference are required' },
        { status: 400 }
      );
    }

    const { data: loan, error } = await supabaseAdmin.rpc('record_loan_repayment', {
      p_loan_id: loan_id,
      p_member_id: userClaims!.id,
      p_amount: amount,
      p_reference: reference.trim(),
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ loan });
  }),
};
