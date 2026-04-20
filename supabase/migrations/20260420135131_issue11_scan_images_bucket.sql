-- Draft Punk Craft Cafe - Storage bucket for scan image uploads
-- Issue #11: ensure scan-images bucket and policies exist for stock-in/out evidence uploads

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'scan-images',
  'scan-images',
  true,
  10485760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id)
do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'scan_images_public_read'
  ) then
    create policy "scan_images_public_read"
      on storage.objects
      for select
      to public
      using (bucket_id = 'scan-images');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'scan_images_anon_upload'
  ) then
    create policy "scan_images_anon_upload"
      on storage.objects
      for insert
      to anon, authenticated
      with check (
        bucket_id = 'scan-images'
        and name like 'scan-uploads/%'
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'scan_images_anon_update'
  ) then
    create policy "scan_images_anon_update"
      on storage.objects
      for update
      to anon, authenticated
      using (
        bucket_id = 'scan-images'
        and name like 'scan-uploads/%'
      )
      with check (
        bucket_id = 'scan-images'
        and name like 'scan-uploads/%'
      );
  end if;
end
$$;
