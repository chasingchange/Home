-- Run this once in the Supabase SQL editor, AFTER client_dashboard_data.sql
-- (this adds a column to public.client_dashboard and depends on
-- public.is_coach(uuid), defined in client_portal_profile.sql).
--
-- Backs the "vision board" header on the client portal dashboard: a client
-- uploads one image of their choosing, which renders full-width above their
-- dashboard with a soft gradient fade into the page background — see
-- .cp-vision-band in client-portal/index.html and renderVisionBand() /
-- the cpVisionFileInput handler in client-portal/portal.js.
--
-- Only the owning client can upload/replace/remove their own image (the
-- coach can view it when looking at a client's portal, same as everything
-- else there, but has no upload control in the UI). The bucket is public
-- for read so the dashboard can just use the plain public URL — nothing
-- sensitive lives in it, and paths are namespaced by client_id so a client
-- can only ever touch objects under their own folder. The image is always
-- stored as "<client_id>/vision-board" (no extension, upsert'd in place —
-- see the cpVisionFileInput handler in portal.js) so re-uploading never
-- leaves orphaned files behind.

alter table public.client_dashboard
  add column if not exists vision_board_url text not null default '';

-- ─── Storage bucket ─────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vision-boards', 'vision-boards', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

-- Objects are stored as "<client_id>/vision-board" — the leading path
-- segment is what the policies below check against auth.uid().
drop policy if exists "vision board public read" on storage.objects;
create policy "vision board public read" on storage.objects for select
  using (bucket_id = 'vision-boards');

drop policy if exists "vision board owner can write" on storage.objects;
create policy "vision board owner can write" on storage.objects for insert
  with check (
    bucket_id = 'vision-boards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vision board owner can update" on storage.objects;
create policy "vision board owner can update" on storage.objects for update
  using (
    bucket_id = 'vision-boards'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'vision-boards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "vision board owner can delete" on storage.objects;
create policy "vision board owner can delete" on storage.objects for delete
  using (
    bucket_id = 'vision-boards'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
