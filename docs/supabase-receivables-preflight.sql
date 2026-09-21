-- IMOBILET - preflight seguro para homologacao Supabase.
-- Rode este arquivo antes de aplicar docs/supabase-receivables-schema.sql.
-- Ele consulta apenas metadados do banco; nao retorna dados de clientes.

-- 1. Tabelas esperadas pelo app atual.
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'properties',
    'buyers',
    'customers',
    'sales_contracts',
    'installments',
    'payments',
    'financial_audit_logs'
  )
order by table_name;

-- 2. Colunas-chave e tipos reais para conferir as FKs da proposta.
select
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'properties' and column_name in ('id', 'title', 'name', 'custom_id', 'code'))
    or (table_name = 'buyers' and column_name in ('id', 'property_id', 'full_name', 'name', 'buyer_name', 'nome', 'email'))
    or (table_name = 'customers' and column_name in ('id', 'property_id', 'full_name', 'name', 'nome', 'email'))
  )
order by table_name, ordinal_position;

-- 3. Chaves estrangeiras existentes envolvendo compradores, clientes e imoveis.
select
  tc.table_schema,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  rc.update_rule,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
  and ccu.table_schema = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name
  and rc.constraint_schema = tc.table_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.table_schema = 'public'
  and (
    tc.table_name in ('buyers', 'customers', 'properties')
    or ccu.table_name in ('buyers', 'customers', 'properties')
  )
order by tc.table_name, kcu.column_name;

-- 4. Estado de RLS das tabelas envolvidas.
select
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'properties',
    'buyers',
    'customers',
    'sales_contracts',
    'installments',
    'payments',
    'financial_audit_logs'
  )
order by tablename;

-- 5. Policies existentes que podem influenciar os testes.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'properties',
    'buyers',
    'customers',
    'sales_contracts',
    'installments',
    'payments',
    'financial_audit_logs'
  )
order by tablename, policyname;

-- 6. Grants atuais para Data API. A partir de 2026, novas tabelas podem exigir GRANT explicito.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.table_privileges
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'properties',
    'buyers',
    'customers',
    'sales_contracts',
    'installments',
    'payments',
    'financial_audit_logs'
  )
order by table_name, grantee, privilege_type;

-- 7. Funcoes publicas relacionadas ao modulo de recebiveis, se ja existirem.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  l.lanname as language,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname in (
    'set_updated_at',
    'create_sales_contract_with_installments',
    'generate_installments_for_contract',
    'register_manual_installment_payment',
    'refresh_overdue_installments'
  )
order by p.proname;

-- 8. Bucket privado de comprovantes, caso ja exista. Nao retorna arquivos.
select
  id,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'payment-receipts';

-- 9. Policies existentes no Storage para evitar conflito de nomes ou acesso amplo.
select
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and (
    policyname in (
      'Owners can upload payment receipts',
      'Owners can read payment receipts',
      'Owners can delete payment receipts'
    )
    or coalesce(qual, '') ilike '%payment-receipts%'
    or coalesce(with_check, '') ilike '%payment-receipts%'
  )
order by policyname;
