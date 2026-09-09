// reverseTransaction (ticket 13/19). Transactions are never edited/deleted
// (ticket 03/09) -- this is the only way a posted ledger entry is corrected:
// inserts a compensating `reversal` row and writes the audit_events trail.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  transaction_id: string;
  reason?: string;
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

    const { transaction_id, reason } = body;
    if (!transaction_id) {
      return Response.json({ error: 'transaction_id is required' }, { status: 400 });
    }

    const { data: txnRow } = await supabaseAdmin
      .from('transactions')
      .select('group_id')
      .eq('id', transaction_id)
      .maybeSingle();
    if (!txnRow) {
      return Response.json({ error: 'Transaction not found.' }, { status: 404 });
    }

    const { data: adminMembership } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userClaims!.id)
      .eq('group_id', txnRow.group_id)
      .eq('role', 'group_admin')
      .eq('status', 'active')
      .maybeSingle();
    if (!adminMembership) {
      return Response.json({ error: 'Only a Group Admin can perform this action.' }, { status: 403 });
    }

    const { data: reversal, error } = await supabaseAdmin.rpc('reverse_transaction', {
      p_transaction_id: transaction_id,
      p_admin_id: userClaims!.id,
      p_reason: reason ?? null,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ transaction: reversal });
  }),
};
