// resolveReconciliationCase (ticket 13/19). Closes an investigate case as
// 'matched' (discrepancy was a data-entry slip) or 'resolved' (explained;
// an actual ledger correction, if any, is a separate reverseTransaction
// call). Only 'resolved' writes an audit_events row (ticket 13, Q3).
// The Treasurer handles the money side too (treasurer-and-shareout.sql).
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  case_id: string;
  status: 'matched' | 'resolved';
  notes?: string;
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

    const { case_id, status, notes } = body;
    if (!case_id || (status !== 'matched' && status !== 'resolved')) {
      return Response.json(
        { error: 'case_id and a status of matched or resolved are required' },
        { status: 400 }
      );
    }

    const { data: caseRow } = await supabaseAdmin
      .from('reconciliation_cases')
      .select('group_id')
      .eq('id', case_id)
      .maybeSingle();
    if (!caseRow) {
      return Response.json({ error: 'Reconciliation case not found.' }, { status: 404 });
    }

    const { data: adminMembership } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userClaims!.id)
      .eq('group_id', caseRow.group_id)
      .in('role', ['group_admin', 'treasurer'])
      .eq('status', 'active')
      .maybeSingle();
    if (!adminMembership) {
      return Response.json({ error: 'Only a Group Admin or the Treasurer can perform this action.' }, { status: 403 });
    }

    const { data: reconciliationCase, error } = await supabaseAdmin.rpc('resolve_reconciliation_case', {
      p_case_id: case_id,
      p_admin_id: userClaims!.id,
      p_status: status,
      p_notes: notes ?? null,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ reconciliation_case: reconciliationCase });
  }),
};
