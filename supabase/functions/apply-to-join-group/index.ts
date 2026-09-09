// applyToJoinGroup (ticket 13). RLS deliberately has no client-facing INSERT
// policy on `memberships` (ticket 12) — this is the one legitimate write
// path, using the service role. Handles the rejoin-updates-existing-row rule
// from ticket 08 (one row per (user, group) pair, ever).
//
// Uses @supabase/server's withSupabase — auth: "user" verifies the caller's
// JWT before the handler ever runs (no manual 401 handling needed), and
// hands us ctx.supabaseAdmin (service role, bypasses RLS) and
// ctx.userClaims (the caller's identity — .id matches profiles.id /
// memberships.user_id regardless of which factor they authenticated with).
import { withSupabase } from 'jsr:@supabase/server@^1';

interface ApplyToJoinGroupPayload {
  group_id: string;
  application_note?: string;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;

    let body: ApplyToJoinGroupPayload;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { group_id, application_note } = body;
    if (!group_id) {
      return Response.json({ error: 'group_id is required' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('memberships')
      .select('id, status')
      .eq('user_id', userClaims!.id)
      .eq('group_id', group_id)
      .maybeSingle();

    if (existingError) {
      return Response.json({ error: existingError.message }, { status: 500 });
    }

    if (existing) {
      if (existing.status === 'active' || existing.status === 'pending') {
        return Response.json(
          { error: 'You already have an application or membership for this group.' },
          { status: 409 }
        );
      }
      // Rejoin after 'declined'/'exited' — update the existing row, never a new one.
      const { error: updateError } = await supabaseAdmin
        .from('memberships')
        .update({
          status: 'pending',
          application_note: application_note ?? null,
          applied_at: new Date().toISOString(),
          decided_at: null,
          decision_motion_id: null,
        })
        .eq('id', existing.id);
      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500 });
      }
      return Response.json({ status: 'pending' });
    }

    const { error: insertError } = await supabaseAdmin.from('memberships').insert({
      user_id: userClaims!.id,
      group_id,
      role: 'member',
      status: 'pending',
      application_note: application_note ?? null,
    });
    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({ status: 'pending' });
  }),
};
