// recordLoanRepayment (ticket 13/17). No overpayment (ticket 17, Q4) --
// capped at the outstanding balance. Otherwise flexible/partial, no
// schedule enforcement (ticket 10, Q6).
import { withSupabase } from 'jsr:@supabase/server@^1';

const PAYMENT_METHODS = ['mpesa', 'airtel_money', 'tigo_pesa', 'cash'];

interface Payload {
  loan_id: string;
  amount: number;
  reference?: string;
  // Missing from older app versions: stored as NULL ("Mobile Money").
  payment_method?: string;
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

    const { loan_id, amount } = body;
    const reference = (body.reference ?? '').trim();
    const paymentMethod = body.payment_method ?? null;
    if (!loan_id || !amount) {
      return Response.json({ error: 'loan_id and amount are required' }, { status: 400 });
    }
    if (paymentMethod !== null && !PAYMENT_METHODS.includes(paymentMethod)) {
      return Response.json({ error: 'Choose how you paid.' }, { status: 400 });
    }
    // Mobile money needs its confirmation code; for cash a receipt number is optional.
    if (paymentMethod !== 'cash' && !reference) {
      return Response.json({ error: 'Enter the mobile money reference.' }, { status: 400 });
    }

    const { data: loan, error } = await supabaseAdmin.rpc('record_loan_repayment', {
      p_loan_id: loan_id,
      p_member_id: userClaims!.id,
      p_amount: amount,
      p_reference: reference,
      p_payment_method: paymentMethod,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ loan });
  }),
};
