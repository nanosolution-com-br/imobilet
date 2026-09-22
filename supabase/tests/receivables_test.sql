begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_table('public', 'sales_contracts', 'sales_contracts existe');
select has_table('public', 'installments', 'installments existe');
select has_table('public', 'payments', 'payments existe');
select has_table('public', 'financial_audit_logs', 'financial_audit_logs existe');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.sales_contracts'::regclass),
  'sales_contracts tem RLS ativo'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.installments'::regclass),
  'installments tem RLS ativo'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payments'::regclass),
  'payments tem RLS ativo'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.financial_audit_logs'::regclass),
  'financial_audit_logs tem RLS ativo'
);

select ok(
  exists (
    select 1
    from storage.buckets
    where id = 'payment-receipts'
      and public is false
      and file_size_limit = 10485760
  ),
  'bucket de comprovantes e privado e limitado a 10 MB'
);

select ok(
  not has_table_privilege('anon', 'public.sales_contracts', 'select'),
  'anon nao pode consultar contratos'
);
select ok(
  has_table_privilege('authenticated', 'public.sales_contracts', 'select'),
  'authenticated pode consultar contratos conforme RLS'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.create_sales_contract_with_installments(uuid,uuid,text,date,numeric,numeric,integer,numeric,date,text)',
    'execute'
  ),
  'authenticated pode executar a criacao transacional'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_sales_contract_with_installments(uuid,uuid,text,date,numeric,numeric,integer,numeric,date,text)',
    'execute'
  ),
  'anon nao pode executar a criacao transacional'
);

insert into auth.users (
  id,
  aud,
  role,
  email,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
)
values (
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'receivables-test@example.invalid',
  now(),
  now(),
  '{}'::jsonb,
  '{}'::jsonb
);

insert into public.properties (
  id,
  created_by,
  title,
  price,
  signal_value,
  installments_count,
  installment_value,
  first_installment_date,
  status
)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Imovel de teste',
  300,
  0,
  3,
  100,
  current_date + 30,
  'sold'
);

insert into public.buyers (
  id,
  created_by,
  property_id,
  full_name
)
values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  'Comprador de teste'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

create temporary table receivables_test_contract as
select public.create_sales_contract_with_installments(
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  'TEST-LOCAL-001',
  current_date,
  300,
  0,
  3,
  100,
  current_date + 30,
  'Contrato ficticio para teste automatizado'
) as id;

select is(
  (select count(*)::integer from public.sales_contracts where contract_number = 'TEST-LOCAL-001'),
  1,
  'RPC cria um contrato'
);
select is(
  (
    select count(*)::integer
    from public.installments
    where contract_id = (select id from receivables_test_contract)
  ),
  3,
  'RPC gera todas as parcelas'
);
select is(
  (
    select count(*)::integer
    from public.financial_audit_logs
    where entity_id = (select id from receivables_test_contract)
      and action = 'contract_created'
  ),
  1,
  'criacao do contrato gera auditoria'
);

create temporary table receivables_test_payment as
select *
from public.register_manual_installment_payment(
  (
    select id
    from public.installments
    where contract_id = (select id from receivables_test_contract)
      and installment_number = 1
  ),
  current_date,
  25,
  'pix',
  null,
  'Pagamento ficticio de teste'
);

select is(
  (
    select paid_amount
    from public.installments
    where contract_id = (select id from receivables_test_contract)
      and installment_number = 1
  ),
  25::numeric,
  'pagamento parcial atualiza o valor pago'
);
select is(
  (
    select balance
    from public.installments
    where contract_id = (select id from receivables_test_contract)
      and installment_number = 1
  ),
  75::numeric,
  'pagamento parcial atualiza o saldo'
);
select is(
  (
    select status
    from public.installments
    where contract_id = (select id from receivables_test_contract)
      and installment_number = 1
  ),
  'partial',
  'pagamento parcial atualiza o status'
);
select is(
  (
    select count(*)::integer
    from public.payments
    where id = (select payment_id from receivables_test_payment)
  ),
  1,
  'pagamento manual gera historico financeiro'
);

select * from finish();
rollback;
