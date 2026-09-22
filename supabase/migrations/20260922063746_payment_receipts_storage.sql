-- IMOBILET - bucket privado e policies para comprovantes de pagamento.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Owners can upload payment receipts" on storage.objects;
create policy "Owners can upload payment receipts"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-receipts'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Owners can read payment receipts" on storage.objects;
create policy "Owners can read payment receipts"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and owner_id = (select auth.uid()::text)
  );

drop policy if exists "Owners can delete payment receipts" on storage.objects;
create policy "Owners can delete payment receipts"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'payment-receipts'
    and owner_id = (select auth.uid()::text)
  );
