// postAnnouncement. Group Admin only: posts a message every active member
// of the group sees on the Announcements screen. The insert and its
// audit_events row happen together inside post_announcement().
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  group_id: string;
  title: string;
  body: string;
  priority?: 'normal' | 'important';
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

    const groupId = payload.group_id;
    const title = (payload.title ?? '').trim();
    const body = (payload.body ?? '').trim();
    const priority = payload.priority ?? 'normal';

    if (!groupId) return Response.json({ error: 'group_id is required' }, { status: 400 });
    if (!title || title.length > 120) {
      return Response.json({ error: 'Enter a title of up to 120 characters.' }, { status: 400 });
    }
    if (!body || body.length > 2000) {
      return Response.json({ error: 'Enter a message of up to 2000 characters.' }, { status: 400 });
    }
    if (priority !== 'normal' && priority !== 'important') {
      return Response.json({ error: 'Invalid priority.' }, { status: 400 });
    }

    const { data: adminMembership } = await supabaseAdmin
      .from('memberships')
      .select('id')
      .eq('user_id', userClaims!.id)
      .eq('group_id', groupId)
      .eq('role', 'group_admin')
      .eq('status', 'active')
      .maybeSingle();
    if (!adminMembership) {
      return Response.json({ error: 'Only a Group Admin can perform this action.' }, { status: 403 });
    }

    const { data: announcement, error } = await supabaseAdmin.rpc('post_announcement', {
      p_group_id: groupId,
      p_admin_id: userClaims!.id,
      p_title: title,
      p_body: body,
      p_priority: priority,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ announcement });
  }),
};
