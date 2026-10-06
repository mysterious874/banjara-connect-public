update public.stories
set media_url = regexp_replace(
  media_url,
  '^.*/storage/v1/object/public/banjara-stories/',
  ''
)
where media_url like '%/storage/v1/object/public/banjara-stories/%';

update storage.buckets
set public = false
where id = 'banjara-stories';

drop policy if exists banjara_stories_select_active on storage.objects;
create policy banjara_stories_select_active on storage.objects
  as permissive for select to authenticated
  using (
    bucket_id = 'banjara-stories'
    and exists (
      select 1
      from public.stories s
      where s.media_url = storage.objects.name
        and s.expires_at > now()
        and not exists (
          select 1
          from public.blocks b
          where
            (b.blocker_id = (select auth.uid()) and b.blocked_id = s.user_id)
            or
            (b.blocker_id = s.user_id and b.blocked_id = (select auth.uid()))
        )
    )
  );