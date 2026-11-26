-- ANNOUNCEMENT LIFECYCLE, 2026-11-26.
-- Draft -> Active -> Archived (and back to Active); Delete hides it for good.
--   * Group Admin and Treasurer: post (publish now or save as draft), edit,
--     activate, archive. Only the Group Admin can delete.
--   * Members are notified only the first time an announcement goes live
--     (notified_at). Edits do not re-notify; the old text goes into the
--     audit log, and members see "Edited" with the date and time.
--   * Delete is a soft delete (status 'deleted'): nobody in the group sees it
--     any more, but the audit log keeps what it said.

alter table announcements add column if not exists status text not null default 'active';
alter table announcements drop constraint if exists announcements_status_check;
alter table announcements add constraint announcements_status_check
  check (status in ('draft', 'active', 'archived', 'deleted'));
alter table announcements add column if not exists notified_at timestamptz;
alter table announcements add column if not exists edited_at timestamptz;
alter table announcements add column if not exists edited_by uuid references profiles(id);
alter table announcements add column if not exists status_changed_at timestamptz;
alter table announcements add column if not exists status_changed_by uuid references profiles(id);
update announcements set notified_at = created_at where notified_at is null and status = 'active';

drop policy if exists announcements_select_members on announcements;
create policy announcements_select_members on announcements for select using (
  is_system_admin()
  or (status in ('active', 'archived') and is_active_member(group_id))
  or (status = 'draft' and (is_group_admin(group_id) or is_group_treasurer(group_id)))
);

-- Notifications now come from the functions below (first activation only).
drop trigger if exists notify_announcement on announcements;

create or replace function announcement_officer(p_group_id uuid, p_user_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from memberships where group_id = p_group_id and user_id = p_user_id
    and role in ('group_admin', 'treasurer') and status = 'active' limit 1
$$;
revoke all on function announcement_officer(uuid, uuid) from public, anon, authenticated;
grant execute on function announcement_officer(uuid, uuid) to service_role;

create or replace function announce_to_members(v_row announcements) returns void
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform notify_group_members(v_row.group_id,
      case when v_row.priority = 'important' then 'announcement.important' else 'announcement.posted' end,
      v_row.id, jsonb_build_object('title', v_row.title), coalesce(v_row.status_changed_by, v_row.author_id));
  exception when others then
    raise warning 'notification (announcement %) failed: %', v_row.id, sqlerrm;
  end;
  update announcements set notified_at = now() where id = v_row.id;
end;
$$;
revoke all on function announce_to_members(announcements) from public, anon, authenticated;
grant execute on function announce_to_members(announcements) to service_role;

drop function if exists post_announcement(uuid, uuid, text, text, text);
create or replace function post_announcement(
  p_group_id uuid, p_admin_id uuid, p_title text, p_body text, p_priority text, p_status text default 'active'
) returns announcements
language plpgsql security definer set search_path = public as $$
declare
  v_row announcements;
begin
  if announcement_officer(p_group_id, p_admin_id) is null then
    raise exception 'Only a Group Admin or the Treasurer can post announcements.';
  end if;
  if p_status not in ('active', 'draft') then raise exception 'Invalid status.'; end if;

  insert into announcements (group_id, author_id, title, body, priority, status, status_changed_at, status_changed_by)
  values (p_group_id, p_admin_id, btrim(p_title), btrim(p_body), coalesce(p_priority, 'normal'), p_status, now(), p_admin_id)
  returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_admin_id, case when p_status = 'draft' then 'announcement.drafted' else 'announcement.posted' end,
          'announcement', v_row.id, jsonb_build_object('title', v_row.title, 'priority', v_row.priority));

  if p_status = 'active' then perform announce_to_members(v_row); end if;
  select * into v_row from announcements where id = v_row.id;
  return v_row;
end;
$$;
revoke all on function post_announcement(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function post_announcement(uuid, uuid, text, text, text, text) to service_role;

create or replace function edit_announcement(
  p_announcement_id uuid, p_actor_id uuid, p_title text, p_body text, p_priority text
) returns announcements
language plpgsql security definer set search_path = public as $$
declare
  v_old announcements;
  v_row announcements;
begin
  select * into v_old from announcements where id = p_announcement_id for update;
  if v_old is null or v_old.status = 'deleted' then raise exception 'Announcement not found.'; end if;
  if announcement_officer(v_old.group_id, p_actor_id) is null then
    raise exception 'Only a Group Admin or the Treasurer can edit announcements.';
  end if;
  if coalesce(p_priority, 'normal') not in ('normal', 'important') then raise exception 'Invalid priority.'; end if;

  update announcements set title = btrim(p_title), body = btrim(p_body), priority = coalesce(p_priority, 'normal'),
         edited_at = now(), edited_by = p_actor_id
  where id = p_announcement_id returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_row.group_id, p_actor_id, 'announcement.edited', 'announcement', v_row.id,
          jsonb_build_object('old_title', v_old.title, 'old_body', v_old.body, 'old_priority', v_old.priority,
                             'title', v_row.title, 'priority', v_row.priority));
  return v_row;
end;
$$;
revoke all on function edit_announcement(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function edit_announcement(uuid, uuid, text, text, text) to service_role;

create or replace function set_announcement_status(p_announcement_id uuid, p_actor_id uuid, p_status text)
returns announcements
language plpgsql security definer set search_path = public as $$
declare
  v_old announcements;
  v_row announcements;
  v_role text;
begin
  select * into v_old from announcements where id = p_announcement_id for update;
  if v_old is null or v_old.status = 'deleted' then raise exception 'Announcement not found.'; end if;
  v_role := announcement_officer(v_old.group_id, p_actor_id);
  if v_role is null then raise exception 'Only a Group Admin or the Treasurer can change announcements.'; end if;
  if p_status not in ('active', 'archived', 'deleted') then raise exception 'Invalid status.'; end if;
  if p_status = 'deleted' and v_role <> 'group_admin' then
    raise exception 'Only a Group Admin can delete announcements.';
  end if;
  if p_status = 'archived' and v_old.status <> 'active' then raise exception 'Only an active announcement can be archived.'; end if;
  if p_status = v_old.status then return v_old; end if;

  update announcements set status = p_status, status_changed_at = now(), status_changed_by = p_actor_id
  where id = p_announcement_id returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_row.group_id, p_actor_id,
          case p_status when 'active' then 'announcement.activated' when 'archived' then 'announcement.archived' else 'announcement.deleted' end,
          'announcement', v_row.id,
          jsonb_build_object('title', v_old.title, 'body', v_old.body, 'from', v_old.status, 'to', p_status));

  if p_status = 'active' and v_row.notified_at is null then perform announce_to_members(v_row); end if;
  select * into v_row from announcements where id = p_announcement_id;
  return v_row;
end;
$$;
revoke all on function set_announcement_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function set_announcement_status(uuid, uuid, text) to service_role;
