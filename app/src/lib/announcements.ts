import { supabase } from '@/lib/supabase';

export type Priority = 'normal' | 'important';
export type AnnouncementStatus = 'draft' | 'active' | 'archived';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: Priority;
  created_at: string;
  author_name: string;
  status: AnnouncementStatus;
  edited_at: string | null;
};

export const TITLE_MAX = 120;
export const BODY_MAX = 2000;

/**
 * Newest announcements for a group, with the author's name. `statuses`
 * defaults to live ones only; drafts come back only for the Admin/Treasurer
 * (the database hides them from everyone else; deleted ones from everyone).
 */
export async function fetchAnnouncements(
  groupId: string,
  limit?: number,
  statuses: AnnouncementStatus[] = ['active']
): Promise<Announcement[]> {
  let query = supabase
    .from('announcements')
    .select('id, title, body, priority, created_at, author_id, status, edited_at')
    .eq('group_id', groupId)
    .in('status', statuses)
    .order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);
  const { data: rows } = await query;
  const authorIds = [...new Set((rows ?? []).map((r) => r.author_id))];
  const { data: profiles } =
    authorIds.length > 0
      ? await supabase.from('profiles_public').select('id, first_name, last_name').in('id', authorIds)
      : { data: [] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, `${p.first_name} ${p.last_name}`.trim()]));
  return (rows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    priority: r.priority,
    created_at: r.created_at,
    author_name: nameById.get(r.author_id) ?? '',
    status: r.status,
    edited_at: r.edited_at,
  }));
}

