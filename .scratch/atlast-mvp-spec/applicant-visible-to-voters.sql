-- Members voting on a membership application must see who they are voting
-- on. Before this, only the Group Admin could read a pending applicant's name
-- (is_group_admin_reviewing), so an ordinary member's vote screen failed to
-- load and looked stuck (2026-11-26).
--
-- An active member of a group may read the public profile (name, photo) of
-- someone whose application to that group has an open vote.

create or replace function public.is_voting_on_applicant(target_profile_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from memberships voter_m
    join memberships applicant_m
      on applicant_m.group_id = voter_m.group_id and applicant_m.status = 'pending'
    join motions mo
      on mo.subject_membership_id = applicant_m.id and mo.status = 'open'
    where voter_m.user_id = auth.uid() and voter_m.status = 'active'
      and applicant_m.user_id = target_profile_id
  )
$$;

revoke all on function public.is_voting_on_applicant(uuid) from public, anon;
grant execute on function public.is_voting_on_applicant(uuid) to authenticated;

create or replace view public.profiles_public with (security_invoker = false) as
  select id, first_name, last_name, photo_url
  from profiles
  where id = auth.uid()
     or shares_active_group(id)
     or is_system_admin()
     or is_group_admin_reviewing(id)
     or is_voting_on_applicant(id);
