begin;

drop index if exists public.notifications_user_created_idx;

do $$
declare
  p record;
  new_qual text;
  new_check text;
  role_sql text;
begin
  for p in
    select tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        (coalesce(qual,'') like '%auth.uid()%' and coalesce(qual,'') not like '%( SELECT auth.uid()%')
        or
        (coalesce(with_check,'') like '%auth.uid()%' and coalesce(with_check,'') not like '%( SELECT auth.uid()%')
      )
  loop
    new_qual := case
      when p.qual is null then null
      else regexp_replace(p.qual, '(?i)(?<!select )auth[.]uid[(][)]', '(select auth.uid())', 'g')
    end;

    new_check := case
      when p.with_check is null then null
      else regexp_replace(p.with_check, '(?i)(?<!select )auth[.]uid[(][)]', '(select auth.uid())', 'g')
    end;

    role_sql := array_to_string(p.roles, ', ');

    execute format('drop policy %I on public.%I', p.policyname, p.tablename);

    execute format(
      'create policy %I on public.%I as permissive for %s to %s%s%s',
      p.policyname,
      p.tablename,
      p.cmd,
      role_sql,
      case when new_qual is not null then format(' using (%s)', new_qual) else '' end,
      case when new_check is not null then format(' with check (%s)', new_check) else '' end
    );
  end loop;
end
$$;

commit;