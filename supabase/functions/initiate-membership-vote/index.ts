// initiateMembershipVote (ticket 13/18). Group Admin only -- the pre-screen
// gate from ticket 11: an Admin can reject outright (see
// reject-membership-application) or escalate to a full-membership vote, but
// can never admit a member unilaterally.
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  membership_id: string;
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

    const { membership_id } = body;
    if (!membership_id) {
      return Response.json({ error: 'membership_id is required' }, { status: 400 });
    }

    const { data: membershipRow } = await supabaseAdmin
      .from('memberships')
      .select('group_id')
      .eq('id', membership_id)
      .maybeSingle();
    if (!membershipRow) {
      return Response.json({ error: 'Membership not found.' }, { status: 404 });
    }

    const { data: adminMembership } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userClaims!.id)
      .eq('group_id', membershipRow.group_id)
      .eq('role', 'group_admin')
      .eq('status', 'active')
      .maybeSingle();
    if (!adminMembership) {
      return Response.json({ error: 'Only a Group Admin can perform this action.' }, { status: 403 });
    }

    const { data: motion, error } = await supabaseAdmin.rpc('initiate_membership_vote', {
      p_membership_id: membership_id,
      p_admin_id: userClaims!.id,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json({ motion });
  }),
};
