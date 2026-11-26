// Announcements: post, edit, activate, archive, delete. Rules live in SQL
// (.scratch/atlast-mvp-spec/announcement-lifecycle.sql):
//   * Group Admin and Treasurer post (publish now or save as a draft), edit,
//     activate and archive; only the Group Admin deletes.
//   * Members are notified the first time an announcement goes live.
//
//   { group_id, title, body, priority?, status? 'active'|'draft' }   post (default action)
//   { action: 'edit', announcement_id, title, body, priority? }
//   { action: 'set_status', announcement_id, status: 'active'|'archived'|'deleted' }
import { withSupabase } from 'jsr:@supabase/server@^1';

interface Payload {
  action?: 'post' | 'edit' | 'set_status';
  group_id?: string;
  announcement_id?: string;
  title?: string;
  body?: string;
  priority?: 'normal' | 'important';
  status?: string;
}

const bad = (error: string) => Response.json({ error }, { status: 400 });

function checkText(title: string, body: string, priority: string) {
  if (!title || title.length > 120) return 'Enter a title of up to 120 characters.';
  if (!body || body.length > 2000) return 'Enter a message of up to 2000 characters.';
  if (priority !== 'normal' && priority !== 'important') return 'Invalid priority.';
  return null;
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    const { supabaseAdmin, userClaims } = ctx;
    const me = userClaims!.id;

    let p: Payload;
    try {
      p = await req.json();
    } catch {
      return bad('Invalid JSON body');
    }

    const action = p.action ?? 'post';
    const title = (p.title ?? '').trim();
    const body = (p.body ?? '').trim();
    const priority = p.priority ?? 'normal';

    let fn: string;
    let args: Record<string, unknown>;
    if (action === 'post') {
      if (!p.group_id) return bad('group_id is required');
      const problem = checkText(title, body, priority);
      if (problem) return bad(problem);
      const status = p.status ?? 'active';
      if (status !== 'active' && status !== 'draft') return bad('Invalid status.');
      fn = 'post_announcement';
      args = { p_group_id: p.group_id, p_admin_id: me, p_title: title, p_body: body, p_priority: priority, p_status: status };
    } else if (action === 'edit') {
      if (!p.announcement_id) return bad('announcement_id is required');
      const problem = checkText(title, body, priority);
      if (problem) return bad(problem);
      fn = 'edit_announcement';
      args = { p_announcement_id: p.announcement_id, p_actor_id: me, p_title: title, p_body: body, p_priority: priority };
    } else if (action === 'set_status') {
      if (!p.announcement_id) return bad('announcement_id is required');
      if (!['active', 'archived', 'deleted'].includes(p.status ?? '')) return bad('Invalid status.');
      fn = 'set_announcement_status';
      args = { p_announcement_id: p.announcement_id, p_actor_id: me, p_status: p.status };
    } else {
      return bad('Unknown action.');
    }

    const { data: announcement, error } = await supabaseAdmin.rpc(fn, args);
    if (error) return bad(error.message);
    return Response.json({ announcement });
  }),
};
