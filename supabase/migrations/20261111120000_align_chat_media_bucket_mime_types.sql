do $migration$
begin
  update storage.buckets
  set allowed_mime_types = case
    when allowed_mime_types is null then null
    else array(
      select distinct mime_type
      from unnest(allowed_mime_types || array[
        'audio/aac',
        'audio/mp4',
        'audio/mpeg',
        'audio/ogg',
        'audio/wav',
        'audio/webm',
        'application/pdf',
        'text/plain',
        'application/zip',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]::text[]) as mime_type
      order by mime_type
    )
  end
  where id = 'banjara-chat-media';

  if not found then
    raise exception 'Required Storage bucket "banjara-chat-media" does not exist.';
  end if;
end
$migration$;
