-- IMOBILET - módulo de recebimento de parcelas de imóveis vendidos.
-- Proposta de migração. Revisar nomes reais de colunas/policies antes de aplicar em produção.
-- Não usa service_role no front-end e não implementa Banco do Brasil nesta etapa.

create extension if not exists pgcrypto;

create table if not exists public.sales_contracts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  property_id uuid not null references public.properties(id) on delete restrict,
  buyer_id uuid not null references public.buyers(id) on delete restrict,
  contract_number text not null unique,
  sale_date date not null,
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  down_payment_amount numeric(14, 2) not null default 0 check (down_payment_amount >= 0),
  installments_count integer not null check (installments_count between 1 and 600),
  installment_amount numeric(14, 2) not null check (installment_amount > 0),
  first_installment_date date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'settled', 'cancelled', 'renegotiated')),
  notes text
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  contract_id uuid not null references public.sales_contracts(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  original_amount numeric(14, 2) not null check (original_amount >= 0),
  adjusted_amount numeric(14, 2) not null check (adjusted_amount >= 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  balance numeric(14, 2) not null check (balance >= 0),
  status text not null default 'open' check (status in ('open', 'overdue', 'partial', 'paid', 'cancelled', 'renegotiated')),
  paid_at date,
  unique (contract_id, installment_number)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  installment_id uuid not null references public.installments(id) on delete restrict,
  contract_id uuid not null references public.sales_contracts(id) on delete restrict,
  payment_date date not null,
  paid_amount numeric(14, 2) not null check (paid_amount > 0),
  payment_method text not null check (payment_method in ('cash', 'pix', 'bank_transfer', 'bank_slip', 'credit_card', 'debit_card', 'other')),
  receipt_path text,
  notes text,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.financial_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists sales_contracts_property_id_idx on public.sales_contracts(property_id);
create index if not exists sales_contracts_buyer_id_idx on public.sales_contracts(buyer_id);
create index if not exists sales_contracts_status_idx on public.sales_contracts(status);
create index if not exists installments_contract_id_idx on public.installments(contract_id);
create index if not exists installments_due_date_idx on public.installments(due_date);
create index if not exists installments_status_idx on public.installments(status);
create index if not exists payments_installment_id_idx on public.payments(installment_id);
create index if not exists payments_contract_id_idx on public.payments(contract_id);
create index if not exists financial_audit_logs_entity_idx on public.financial_audit_logs(entity_type, entity_id);

grant select, insert, update on public.sales_contracts to authenticated;
grant select, insert, update on public.installments to authenticated;
grant select, insert on public.payments to authenticated;
grant select, insert on public.financial_audit_logs to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_contracts_set_updated_at on public.sales_contracts;
create trigger sales_contracts_set_updated_at
before update on public.sales_contracts
for each row execute function public.set_updated_at();

drop trigger if exists installments_set_updated_at on public.installments;
create trigger installments_set_updated_at
before update on public.installments
for each row execute function public.set_updated_at();

create or replace function public.generate_installments_for_contract(contract_uuid uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  contract_row public.sales_contracts%rowtype;
  current_number integer;
begin
  select * into contract_row
  from public.sales_contracts
  where id = contract_uuid;

  if not found then
    raise exception 'Contrato não encontrado';
  end if;

  for current_number in 1..contract_row.installments_count loop
    insert into public.installments (
      contract_id,
      installment_number,
      due_date,
      original_amount,
      adjusted_amount,
      paid_amount,
      balance,
      status
    )
    values (
      contract_row.id,
      current_number,
      (contract_row.first_installment_date + ((current_number - 1) || ' months')::interval)::date,
      contract_row.installment_amount,
      contract_row.installment_amount,
      0,
      contract_row.installment_amount,
      'open'
    )
    on conflict (contract_id, installment_number) do nothing;
  end loop;

  return contract_row.installments_count;
end;
$$;

create or replace function public.create_sales_contract_with_installments(
  property_uuid uuid,
  buyer_uuid uuid,
  contract_number_value text,
  sale_date_value date,
  total_amount_value numeric,
  down_payment_amount_value numeric,
  installments_count_value integer,
  installment_amount_value numeric,
  first_installment_date_value date,
  notes_value text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  contract_uuid uuid;
  current_number integer;
begin
  if caller_id is null then
    raise exception 'Usuário autenticado é obrigatório';
  end if;

  if property_uuid is null or buyer_uuid is null then
    raise exception 'Comprador e imóvel são obrigatórios';
  end if;

  if nullif(trim(contract_number_value), '') is null then
    raise exception 'Número do contrato é obrigatório';
  end if;

  if sale_date_value is null or first_installment_date_value is null then
    raise exception 'Datas da venda e da primeira parcela são obrigatórias';
  end if;

  if total_amount_value is null
    or down_payment_amount_value is null
    or installment_amount_value is null
    or total_amount_value < 0
    or down_payment_amount_value < 0
    or installment_amount_value <= 0 then
    raise exception 'Valores financeiros inválidos';
  end if;

  if installments_count_value is null or installments_count_value not between 1 and 600 then
    raise exception 'Quantidade de parcelas deve estar entre 1 e 600';
  end if;

  if not exists (
    select 1
    from public.buyers b
    where b.id = buyer_uuid
      and b.property_id = property_uuid
  ) then
    raise exception 'Comprador sem vínculo com o imóvel informado';
  end if;

  insert into public.sales_contracts (
    property_id,
    buyer_id,
    contract_number,
    sale_date,
    total_amount,
    down_payment_amount,
    installments_count,
    installment_amount,
    first_installment_date,
    status,
    notes,
    created_by
  )
  values (
    property_uuid,
    buyer_uuid,
    trim(contract_number_value),
    sale_date_value,
    total_amount_value,
    down_payment_amount_value,
    installments_count_value,
    installment_amount_value,
    first_installment_date_value,
    'active',
    nullif(trim(notes_value), ''),
    caller_id
  )
  returning id into contract_uuid;

  for current_number in 1..installments_count_value loop
    insert into public.installments (
      contract_id,
      installment_number,
      due_date,
      original_amount,
      adjusted_amount,
      paid_amount,
      balance,
      status
    )
    values (
      contract_uuid,
      current_number,
      (first_installment_date_value + ((current_number - 1) || ' months')::interval)::date,
      installment_amount_value,
      installment_amount_value,
      0,
      installment_amount_value,
      'open'
    );
  end loop;

  insert into public.financial_audit_logs (
    entity_type,
    entity_id,
    action,
    description,
    metadata,
    created_by
  )
  values (
    'sales_contract',
    contract_uuid,
    'contract_created',
    'Contrato de venda criado com geração automática de parcelas.',
    jsonb_build_object('installments_count', installments_count_value),
    caller_id
  );

  return contract_uuid;
end;
$$;

create or replace function public.refresh_overdue_installments()
returns integer
language plpgsql
security invoker
as $$
declare
  affected integer;
begin
  update public.installments
  set status = 'overdue'
  where status in ('open', 'partial')
    and balance > 0
    and due_date < current_date;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.register_manual_installment_payment(
  installment_uuid uuid,
  payment_date_value date,
  paid_amount_value numeric,
  payment_method_value text,
  receipt_path_value text default null,
  notes_value text default null
)
returns table (
  payment_id uuid,
  next_paid_amount numeric,
  next_balance numeric,
  next_status text
)
language plpgsql
security invoker
as $$
declare
  installment_row public.installments%rowtype;
  contract_uuid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Usuário autenticado é obrigatório';
  end if;

  if paid_amount_value <= 0 then
    raise exception 'Valor de pagamento inválido';
  end if;

  if payment_method_value not in ('cash', 'pix', 'bank_transfer', 'bank_slip', 'credit_card', 'debit_card', 'other') then
    raise exception 'Forma de pagamento inválida';
  end if;

  if receipt_path_value ~* '^https?://' then
    raise exception 'URL pública não é permitida para comprovantes';
  end if;

  select i.* into installment_row
  from public.installments i
  where i.id = installment_uuid
  for update;

  if not found then
    raise exception 'Parcela não encontrada';
  end if;

  if installment_row.status in ('paid', 'cancelled', 'renegotiated') then
    raise exception 'Parcela não permite novo pagamento';
  end if;

  if paid_amount_value > installment_row.balance then
    raise exception 'Pagamento maior que o saldo da parcela';
  end if;

  contract_uuid := installment_row.contract_id;
  next_paid_amount := installment_row.paid_amount + paid_amount_value;
  next_balance := greatest(installment_row.adjusted_amount - next_paid_amount, 0);

  if next_balance <= 0 then
    next_status := 'paid';
  elsif installment_row.due_date < current_date then
    next_status := 'overdue';
  elsif next_paid_amount > 0 then
    next_status := 'partial';
  else
    next_status := 'open';
  end if;

  insert into public.payments (
    installment_id,
    contract_id,
    payment_date,
    paid_amount,
    payment_method,
    receipt_path,
    notes,
    created_by
  )
  values (
    installment_uuid,
    contract_uuid,
    payment_date_value,
    paid_amount_value,
    payment_method_value,
    nullif(trim(receipt_path_value), ''),
    nullif(trim(notes_value), ''),
    (select auth.uid())
  )
  returning id into payment_id;

  update public.installments
  set
    paid_amount = next_paid_amount,
    balance = next_balance,
    status = next_status,
    paid_at = case when next_status = 'paid' then payment_date_value else null end,
    updated_at = now()
  where id = installment_uuid;

  insert into public.financial_audit_logs (
    entity_type,
    entity_id,
    action,
    description,
    metadata,
    created_by
  )
  values (
    'installment',
    installment_uuid,
    'manual_payment_registered',
    'Pagamento manual registrado em transação de baixa de parcela.',
    jsonb_build_object(
      'contract_id', contract_uuid,
      'payment_id', payment_id,
      'paid_amount', paid_amount_value,
      'payment_method', payment_method_value,
      'new_status', next_status
    ),
    (select auth.uid())
  );

  return next;
end;
$$;

revoke all on function public.set_updated_at() from public;
revoke all on function public.generate_installments_for_contract(uuid) from public;
revoke all on function public.create_sales_contract_with_installments(uuid, uuid, text, date, numeric, numeric, integer, numeric, date, text) from public;
revoke all on function public.refresh_overdue_installments() from public;
revoke all on function public.register_manual_installment_payment(uuid, date, numeric, text, text, text) from public;
revoke all on function public.set_updated_at() from anon;
revoke all on function public.generate_installments_for_contract(uuid) from anon;
revoke all on function public.create_sales_contract_with_installments(uuid, uuid, text, date, numeric, numeric, integer, numeric, date, text) from anon;
revoke all on function public.refresh_overdue_installments() from anon;
revoke all on function public.register_manual_installment_payment(uuid, date, numeric, text, text, text) from anon;

grant execute on function public.generate_installments_for_contract(uuid) to authenticated;
grant execute on function public.create_sales_contract_with_installments(uuid, uuid, text, date, numeric, numeric, integer, numeric, date, text) to authenticated;
grant execute on function public.refresh_overdue_installments() to authenticated;
grant execute on function public.register_manual_installment_payment(uuid, date, numeric, text, text, text) to authenticated;

alter table public.sales_contracts enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.financial_audit_logs enable row level security;

create policy "Authenticated users can read sales contracts"
  on public.sales_contracts for select
  to authenticated
  using ((select auth.uid()) = created_by);

create policy "Authenticated users can insert sales contracts"
  on public.sales_contracts for insert
  to authenticated
  with check (
    (select auth.uid()) = created_by
    and exists (
      select 1
      from public.buyers b
      where b.id = sales_contracts.buyer_id
        and b.property_id = sales_contracts.property_id
    )
  );

create policy "Creators can update sales contracts"
  on public.sales_contracts for update
  to authenticated
  using ((select auth.uid()) = created_by)
  with check (
    (select auth.uid()) = created_by
    and exists (
      select 1
      from public.buyers b
      where b.id = sales_contracts.buyer_id
        and b.property_id = sales_contracts.property_id
    )
  );

create policy "Authenticated users can read installments"
  on public.installments for select
  to authenticated
  using (
    exists (
      select 1 from public.sales_contracts c
      where c.id = installments.contract_id
        and c.created_by = (select auth.uid())
    )
  );

create policy "Authenticated users can insert installments for own contracts"
  on public.installments for insert
  to authenticated
  with check (
    exists (
      select 1 from public.sales_contracts c
      where c.id = installments.contract_id
        and c.created_by = (select auth.uid())
    )
  );

create policy "Authenticated users can update installments for own contracts"
  on public.installments for update
  to authenticated
  using (
    exists (
      select 1 from public.sales_contracts c
      where c.id = installments.contract_id
        and c.created_by = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sales_contracts c
      where c.id = installments.contract_id
        and c.created_by = (select auth.uid())
    )
  );

create policy "Authenticated users can read payments"
  on public.payments for select
  to authenticated
  using (
    exists (
      select 1 from public.sales_contracts c
      where c.id = payments.contract_id
        and c.created_by = (select auth.uid())
    )
  );

create policy "Authenticated users can insert payments"
  on public.payments for insert
  to authenticated
  with check (
    (select auth.uid()) = created_by
    and exists (
      select 1
      from public.sales_contracts c
      join public.installments i on i.contract_id = c.id
      where c.id = payments.contract_id
        and i.id = payments.installment_id
        and c.created_by = (select auth.uid())
    )
  );

create policy "Authenticated users can read audit logs"
  on public.financial_audit_logs for select
  to authenticated
  using ((select auth.uid()) = created_by);

create policy "Authenticated users can insert audit logs"
  on public.financial_audit_logs for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

-- Estrutura reservada para integração futura, sem emissão real nesta etapa:
-- payments.payment_method = 'bank_slip' pode representar boleto manual.
-- Adicionar futuramente tabelas como bank_slip_charges / pix_charges para Banco do Brasil.
