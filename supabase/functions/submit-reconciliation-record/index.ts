// submitReconciliationRecord (ticket 13/19). V1 has no automated
// provider-statement import (no live gateway, ticket 03) -- this is the
// manual entry of what the provider's statement says; matches immediately
// or opens a reconciliation_cases row for investigation.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  transaction_id: string;
  provider: string;
  provider_reference?: string;
  provider_amount: number;
  provider_timestamp?: string;
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

    const { transaction_id, provider, provider_reference, provider_amount, provider_timestamp } = body;
    if (!transaction_id || !provider || !provider.trim()) {
      return Response.json(
        { error: 'transaction_id and provider are required' },
        { status: 400 }
      );
    }
    if (typeof provider_amount !== 'number' || !Number.isFinite(provider_amount) || provider_amount < 0) {
      return Response.json({ error: 'provider_amount must be a non-negative number' }, { status: 400 });
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

    const { data: reconciliationCase, error } = await supabaseAdmin.rpc('submit_reconciliation_record', {
      p_transaction_id: transaction_id,
      p_provider: provider.trim(),
      p_provider_reference: provider_reference ?? null,
      p_provider_amount: provider_amount,
      p_provider_timestamp: provider_timestamp ?? null,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ reconciliation_case: reconciliationCase });
  }),
};
