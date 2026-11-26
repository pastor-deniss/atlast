// recordBalanceCheck. Group Admin only: compares the money the group really
// holds (counted from its mobile-money / bank statement or cash) with the
// balance the ledger says it should hold. The expected balance is computed
// in the database, never taken from the client.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  group_id: string;
  actual_balance: number;
  note?: string;
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

    const actual = Number(payload.actual_balance);
    const note = (payload.note ?? '').trim();
    if (!payload.group_id) return Response.json({ error: 'group_id is required' }, { status: 400 });
    if (!Number.isFinite(actual) || actual < 0) {
      return Response.json({ error: 'Enter the amount the group actually holds.' }, { status: 400 });
    }
    if (note.length > 1000) {
      return Response.json({ error: 'Keep the note to 1000 characters.' }, { status: 400 });
    }

    const { data: check, error } = await supabaseAdmin.rpc('record_group_balance_check', {
      p_group_id: payload.group_id,
      p_admin_id: userClaims!.id,
      p_actual_balance: actual,
      p_note: note,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ check });
  }),
};
