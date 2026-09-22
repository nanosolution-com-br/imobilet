-- IMOBILET - baseline minimo para testes locais e homologacao vazia.
-- Em bancos onde properties e buyers ja existem, esta migration nao os altera.
-- Nao inserir nem importar dados reais de clientes neste ambiente.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.properties') is null then
    create table public.properties (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      created_by uuid references auth.users(id) on delete set null,
      title text not null,
      code bigint,
      custom_id text,
      price numeric(14, 2) not null default 0 check (price >= 0),
      signal_value numeric(14, 2) not null default 0 check (signal_value >= 0),
      installments_count integer check (installments_count between 1 and 600),
      installment_value numeric(14, 2) check (installment_value > 0),
      first_installment_date date,
      status text not null default 'available'
    );

    alter table public.properties enable row level security;

    create policy "Owners can read local properties"
      on public.properties for select
      to authenticated
      using ((select auth.uid()) = created_by);

    create policy "Owners can insert local properties"
      on public.properties for insert
      to authenticated
      with check ((select auth.uid()) = created_by);

    create policy "Owners can update local properties"
      on public.properties for update
      to authenticated
      using ((select auth.uid()) = created_by)
      with check ((select auth.uid()) = created_by);

    grant select, insert, update on public.properties to authenticated;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.buyers') is null then
    create table public.buyers (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      created_by uuid references auth.users(id) on delete set null,
      property_id uuid references public.properties(id) on delete set null,
      full_name text not null,
      name text
    );

    create index buyers_property_id_idx on public.buyers(property_id);
    create index buyers_created_by_idx on public.buyers(created_by);

    alter table public.buyers enable row level security;

    create policy "Owners can read local buyers"
      on public.buyers for select
      to authenticated
      using ((select auth.uid()) = created_by);

    create policy "Owners can insert local buyers"
      on public.buyers for insert
      to authenticated
      with check ((select auth.uid()) = created_by);

    create policy "Owners can update local buyers"
      on public.buyers for update
      to authenticated
      using ((select auth.uid()) = created_by)
      with check ((select auth.uid()) = created_by);

    grant select, insert, update on public.buyers to authenticated;
  end if;
end;
$$;
