-- ANNOUNCEMENTS: a Group Admin posts a message; every active member of
-- that group reads it on the Announcements screen. No push/SMS delivery
-- (V1 has no notifications) -- members see it when they open the app.
--
-- Reads go straight through RLS. Writes only through post_announcement(),
-- called by the post-announcement Edge Function after it checks the caller
-- is an active Group Admin, so every post also lands in audit_events.

create table if not exists announcements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references groups(id),
  author_id   uuid not null references profiles(id),
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 2000),
  priority    text not null default 'normal' check (priority in ('normal', 'important')),
  created_at  timestamptz not null default now()
);

create index if not exists announcements_group_created_idx on announcements (group_id, created_at desc);

alter table announcements enable row level security;

drop policy if exists announcements_select_members on announcements;
create policy announcements_select_members on announcements
  for select using (is_active_member(group_id) or is_system_admin());
-- No insert/update/delete policies: clients cannot write directly.

create or replace function post_announcement(
  p_group_id uuid,
  p_admin_id uuid,
  p_title text,
  p_body text,
  p_priority text
) returns announcements
language plpgsql
security definer set search_path = public
as $$
declare
  v_row announcements;
begin
  if not exists (
    select 1 from memberships
    where group_id = p_group_id and user_id = p_admin_id
      and role = 'group_admin' and status = 'active'
  ) then
    raise exception 'Only a Group Admin can post announcements.';
  end if;

  insert into announcements (group_id, author_id, title, body, priority)
  values (p_group_id, p_admin_id, btrim(p_title), btrim(p_body), coalesce(p_priority, 'normal'))
  returning * into v_row;

  insert into audit_events (group_id, actor_id, action, entity_type, entity_id, metadata)
  values (p_group_id, p_admin_id, 'announcement.posted', 'announcement', v_row.id,
          jsonb_build_object('title', v_row.title, 'priority', v_row.priority));

  return v_row;
end;
$$;
revoke all on function post_announcement(uuid, uuid, text, text, text) from public;
grant execute on function post_announcement(uuid, uuid, text, text, text) to service_role;
