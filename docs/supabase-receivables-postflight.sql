-- IMOBILET - postflight seguro para homologacao Supabase.
-- Rode este arquivo depois de aplicar docs/supabase-receivables-schema.sql em um projeto de teste.
-- Ele consulta apenas metadados e agregacoes de catalogo; nao retorna dados de clientes.

-- 1. Tabelas do modulo criadas.
select
  expected.table_name,
  case when t.table_name is null then 'missing' else 'ok' end as status
from (
  values
    ('sales_contracts'),
    ('installments'),
    ('payments'),
    ('financial_audit_logs')
) as expected(table_name)
left join information_schema.tables t
  on t.table_schema = 'public'
  and t.table_name = expected.table_name
order by expected.table_name;

-- 2. Colunas essenciais do modulo.
select
  expected.table_name,
  expected.column_name,
  expected.expected_udt_name,
  c.udt_name as actual_udt_name,
  case
    when c.column_name is null then 'missing'
    when c.udt_name <> expected.expected_udt_name then 'type_mismatch'
    else 'ok'
  end as status
from (
  values
    ('sales_contracts', 'id', 'uuid'),
    ('sales_contracts', 'property_id', 'uuid'),
    ('sales_contracts', 'buyer_id', 'uuid'),
    ('sales_contracts', 'contract_number', 'text'),
    ('sales_contracts', 'total_amount', 'numeric'),
    ('installments', 'contract_id', 'uuid'),
    ('installments', 'installment_number', 'int4'),
    ('installments', 'due_date', 'date'),
    ('installments', 'balance', 'numeric'),
    ('installments', 'status', 'text'),
    ('payments', 'installment_id', 'uuid'),
    ('payments', 'contract_id', 'uuid'),
    ('payments', 'payment_method', 'text'),
    ('payments', 'receipt_path', 'text'),
    ('financial_audit_logs', 'entity_type', 'text'),
    ('financial_audit_logs', 'metadata', 'jsonb')
) as expected(table_name, column_name, expected_udt_name)
left join information_schema.columns c
  on c.table_schema = 'public'
  and c.table_name = expected.table_name
  and c.column_name = expected.column_name
order by expected.table_name, expected.column_name;

-- 3. RLS ativo nas novas tabelas.
select
  tablename,
  rowsecurity,
  forcerowsecurity,
  case when rowsecurity then 'ok' else 'rls_disabled' end as status
from pg_tables
where schemaname = 'public'
  and tablename in (
    'sales_contracts',
    'installments',
    'payments',
    'financial_audit_logs'
  )
order by tablename;

-- 4. Grants minimos esperados para uso via supabase-js/Data API.
select
  expected.table_name,
  expected.grantee,
  expected.privilege_type,
  case when tp.privilege_type is null then 'missing' else 'ok' end as status
from (
  values
    ('sales_contracts', 'authenticated', 'SELECT'),
    ('sales_contracts', 'authenticated', 'INSERT'),
    ('sales_contracts', 'authenticated', 'UPDATE'),
    ('installments', 'authenticated', 'SELECT'),
    ('installments', 'authenticated', 'INSERT'),
    ('installments', 'authenticated', 'UPDATE'),
    ('payments', 'authenticated', 'SELECT'),
    ('payments', 'authenticated', 'INSERT'),
    ('financial_audit_logs', 'authenticated', 'SELECT'),
    ('financial_audit_logs', 'authenticated', 'INSERT')
) as expected(table_name, grantee, privilege_type)
left join information_schema.table_privileges tp
  on tp.table_schema = 'public'
  and tp.table_name = expected.table_name
  and tp.grantee = expected.grantee
  and tp.privilege_type = expected.privilege_type
order by expected.table_name, expected.privilege_type;

-- 5. Policies esperadas por tabela e comando.
select
  expected.table_name,
  expected.cmd,
  count(p.policyname) as policies_found,
  case when count(p.policyname) = 0 then 'missing' else 'ok' end as status
from (
  values
    ('sales_contracts', 'SELECT'),
    ('sales_contracts', 'INSERT'),
    ('sales_contracts', 'UPDATE'),
    ('installments', 'SELECT'),
    ('installments', 'INSERT'),
    ('installments', 'UPDATE'),
    ('payments', 'SELECT'),
    ('payments', 'INSERT'),
    ('financial_audit_logs', 'SELECT'),
    ('financial_audit_logs', 'INSERT')
) as expected(table_name, cmd)
left join pg_policies p
  on p.schemaname = 'public'
  and p.tablename = expected.table_name
  and p.cmd = expected.cmd
group by expected.table_name, expected.cmd
order by expected.table_name, expected.cmd;

-- 6. Funcoes esperadas, sempre security invoker.
select
  expected.function_name,
  expected.arguments,
  case
    when p.proname is null then 'missing'
    when p.prosecdef then 'security_definer_unexpected'
    else 'ok'
  end as status
from (
  values
    ('set_updated_at', ''),
    ('create_sales_contract_with_installments', 'property_uuid uuid, buyer_uuid uuid, contract_number_value text, sale_date_value date, total_amount_value numeric, down_payment_amount_value numeric, installments_count_value integer, installment_amount_value numeric, first_installment_date_value date, notes_value text'),
    ('generate_installments_for_contract', 'contract_uuid uuid'),
    ('register_manual_installment_payment', 'installment_uuid uuid, payment_date_value date, paid_amount_value numeric, payment_method_value text, receipt_path_value text, notes_value text'),
    ('refresh_overdue_installments', '')
) as expected(function_name, arguments)
left join pg_namespace n
  on n.nspname = 'public'
left join pg_proc p
  on p.pronamespace = n.oid
  and p.proname = expected.function_name
  and pg_get_function_identity_arguments(p.oid) = expected.arguments
order by expected.function_name;

-- 7. EXECUTE exposto apenas onde deve estar.
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'set_updated_at',
    'create_sales_contract_with_installments',
    'generate_installments_for_contract',
    'register_manual_installment_payment',
    'refresh_overdue_installments'
  )
  and grantee in ('anon', 'authenticated', 'public')
order by routine_name, grantee, privilege_type;

-- 8. Relacoes essenciais criadas.
select
  tc.table_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
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
  and tc.table_name in ('sales_contracts', 'installments', 'payments')
order by tc.table_name, kcu.column_name;

-- 9. Bucket de comprovantes deve existir e permanecer privado.
select
  id,
  case when public then 'public_unexpected' else 'ok' end as privacy_status,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'payment-receipts';

-- 10. Policies minimas do bucket privado.
select
  expected.policyname,
  expected.cmd,
  case when p.policyname is null then 'missing' else 'ok' end as status
from (
  values
    ('Owners can upload payment receipts', 'INSERT'),
    ('Owners can read payment receipts', 'SELECT'),
    ('Owners can delete payment receipts', 'DELETE')
) as expected(policyname, cmd)
left join pg_policies p
  on p.schemaname = 'storage'
  and p.tablename = 'objects'
  and p.policyname = expected.policyname
  and p.cmd = expected.cmd
order by expected.policyname;
