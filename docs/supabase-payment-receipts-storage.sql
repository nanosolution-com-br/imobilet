-- IMOBILET - policies do bucket privado de comprovantes de pagamento.
-- Antes de executar, crie no painel do Supabase Storage um bucket PRIVADO com:
-- nome: payment-receipts
-- limite por arquivo: 10 MB
-- MIME types: application/pdf, image/jpeg, image/png, image/webp
-- Aplicar primeiro em ambiente de teste. Este arquivo não cria bucket nem usa service_role.

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
