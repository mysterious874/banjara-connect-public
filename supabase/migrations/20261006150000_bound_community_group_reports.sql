-- Bound community report loading to protect admin screens from unbounded result sets.
-- The new function keeps one-argument callers compatible via defaults.
create or replace function public.load_community_group_reports(
  p_group_id uuid,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table(
  id uuid,
  reporter_id uuid,
  reported_user_id uuid,
  group_message_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_limit < 1 or p_limit > 100 then raise exception 'Invalid report page size'; end if;
  if p_offset < 0 then raise exception 'Invalid report offset'; end if;
  if not is_community_group_admin(p_group_id, auth.uid()) then raise exception 'Only group admins can view reports'; end if;

  return query
  select r.id,r.reporter_id,r.reported_user_id,r.group_message_id,r.reason,r.details,r.status,r.created_at,r.resolved_at
  from reports r
  where r.group_id=p_group_id
  order by case when r.status='pending' then 0 else 1 end, r.created_at desc
  limit p_limit offset p_offset;
end;
$function$;