-- Multi-barbearia, etapa 2: expansão compatível.
--
-- Várias barbearias passam a dividir o mesmo banco. Toda tabela ganha shop_id; RLS e funções
-- passam a filtrar pela loja. Esta etapa não quebra o app atual:
--   - a Black Crown vira a loja nº 1 (UUID fixo em private.legacy_shop_id());
--   - as RPCs antigas viram wrappers fixos na Black Crown;
--   - as FKs simples viram compostas (shop_id, x_id) com o MESMO nome e o mesmo ON DELETE,
--     então os embeddings do PostgREST continuam resolvendo igual;
--   - uniques globais (slug, telefone, login) continuam até a etapa 4 (…_multi_tenant_release);
--   - fotos nos caminhos antigos do Storage continuam aceitas só para a Black Crown.
-- Uma 2ª loja só pode ser cadastrada depois da etapa 4.
--
-- Suspensão (shops.status): 'suspensa' deixa o painel só para consulta e tira o site do ar
-- (consulta e cancelamento de reserva continuam); 'cancelada' corta tudo, exceto a limpeza.
-- Leitura usa private.staff_shop_id()/admin_shop_id(); escrita, *_write_shop_id().

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = public, extensions;

-- --- Linha de base: contagens e somas que não podem mudar ---

create temporary table mt_baseline on commit drop as
select 'appointments' as t, count(*) as n, coalesce(sum(price), 0) + coalesce(sum(charged_amount), 0) + coalesce(sum(payout_amount), 0) as s from public.appointments
union all select 'appointment_services', count(*), coalesce(sum(price), 0) + coalesce(sum(charged_amount), 0) + coalesce(sum(payout_amount), 0) from public.appointment_services
union all select 'subscription_payments', count(*), coalesce(sum(amount), 0) from public.subscription_payments
union all select 'customer_subscriptions', count(*), 0 from public.customer_subscriptions
union all select 'customers', count(*), 0 from public.customers
union all select 'staff_members', count(*), 0 from public.staff_members
union all select 'services', count(*), coalesce(sum(price), 0) from public.services
union all select 'service_payouts', count(*), coalesce(sum(plan_payout_amount), 0) from public.service_payouts
union all select 'service_components', count(*), 0 from public.service_components
union all select 'professionals', count(*), 0 from public.professionals
union all select 'professional_services', count(*), 0 from public.professional_services
union all select 'subscription_plans', count(*), coalesce(sum(monthly_price), 0) from public.subscription_plans
union all select 'plan_services', count(*), 0 from public.plan_services
union all select 'opening_periods', count(*), 0 from public.opening_periods
union all select 'schedule_exceptions', count(*), 0 from public.schedule_exceptions
union all select 'schedule_blocks', count(*), 0 from public.schedule_blocks
union all select 'site_images', count(*), 0 from public.site_images
union all select 'shop_settings', count(*), 0 from public.shop_settings
union all select 'payroll_settings', count(*), coalesce(sum(walk_in_commission_rate), 0) from public.payroll_settings;

-- --- Lojas e domínios ---

create type public.shop_status as enum ('ativa', 'suspensa', 'cancelada');

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 40),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  status public.shop_status not null default 'ativa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shops is
  'Barbearias da plataforma. Fora da API: o site resolve a loja por public.resolve_shop_host/slug.';

create trigger set_updated_at before update on public.shops
  for each row execute function public.set_updated_at();

-- Domínio (host normalizado: minúsculo, sem porta) de cada loja. Um primário por loja.
create table public.shop_domains (
  host text primary key check (
    host ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and char_length(host) <= 253
  ),
  shop_id uuid not null references public.shops (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index shop_domains_shop_id_idx on public.shop_domains (shop_id);
create unique index shop_domains_one_primary on public.shop_domains (shop_id) where is_primary;

alter table public.shops enable row level security;
alter table public.shop_domains enable row level security;
revoke all on public.shops, public.shop_domains from anon, authenticated;

create function private.legacy_shop_id()
returns uuid
language sql
immutable
set search_path = ''
as $$
  select 'b1ac0c00-0000-4000-8000-000000000001'::uuid;
$$;

comment on function private.legacy_shop_id() is
  'Black Crown, a loja que existia antes do multi-tenant. Usada pelos wrappers de compatibilidade.';

insert into public.shops (id, slug, name)
values (
  private.legacy_shop_id(),
  'black-crown',
  coalesce((select name from public.shop_settings where id = 1), 'Black Crown Barber')
);

alter table public.shop_settings
  add column maps_url text check (maps_url ~ '^https://' and char_length(maps_url) <= 500);

-- --- shop_id em todas as tabelas (backfill dos pais para os filhos) ---

alter table public.shop_settings add column shop_id uuid;
alter table public.payroll_settings add column shop_id uuid;
alter table public.services add column shop_id uuid;
alter table public.professionals add column shop_id uuid;
alter table public.subscription_plans add column shop_id uuid;
alter table public.service_payouts add column shop_id uuid;
alter table public.service_components add column shop_id uuid;
alter table public.professional_services add column shop_id uuid;
alter table public.plan_services add column shop_id uuid;
alter table public.staff_members add column shop_id uuid;
alter table public.customers add column shop_id uuid;
alter table public.customer_subscriptions add column shop_id uuid;
alter table public.subscription_payments add column shop_id uuid;
alter table public.appointments add column shop_id uuid;
alter table public.appointment_services add column shop_id uuid;
alter table public.schedule_blocks add column shop_id uuid;
alter table public.opening_periods add column shop_id uuid;
alter table public.schedule_exceptions add column shop_id uuid;
alter table public.site_images add column shop_id uuid;

-- Sem triggers no backfill: não pode mexer em updated_at nem recalcular nada.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shop_settings', 'payroll_settings', 'services', 'professionals', 'subscription_plans',
    'service_payouts', 'service_components', 'professional_services', 'plan_services',
    'staff_members', 'customers', 'customer_subscriptions', 'subscription_payments',
    'appointments', 'appointment_services', 'schedule_blocks', 'opening_periods',
    'schedule_exceptions', 'site_images'
  ] loop
    execute format('alter table public.%I disable trigger user', v_table);
    execute format('update public.%I set shop_id = private.legacy_shop_id()', v_table);
    execute format('alter table public.%I enable trigger user', v_table);
    execute format('alter table public.%I alter column shop_id set not null', v_table);
  end loop;
end;
$$;

-- --- Helpers de acesso ---
-- Uma busca por PK em staff_members/customers. Nas policies, sempre "(select private.x())":
-- o helper roda uma vez por consulta e a igualdade com shop_id usa o índice.

create function private.staff_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.shop_id
  from public.staff_members sm
  join public.shops s on s.id = sm.shop_id
  where sm.user_id = (select auth.uid()) and sm.is_active and s.status <> 'cancelada';
$$;

create function private.staff_write_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.shop_id
  from public.staff_members sm
  join public.shops s on s.id = sm.shop_id
  where sm.user_id = (select auth.uid()) and sm.is_active and s.status = 'ativa';
$$;

create function private.admin_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.shop_id
  from public.staff_members sm
  join public.shops s on s.id = sm.shop_id
  where sm.user_id = (select auth.uid()) and sm.is_active and sm.role = 'admin' and s.status <> 'cancelada';
$$;

create function private.admin_write_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.shop_id
  from public.staff_members sm
  join public.shops s on s.id = sm.shop_id
  where sm.user_id = (select auth.uid()) and sm.is_active and sm.role = 'admin' and s.status = 'ativa';
$$;

create function private.customer_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.shop_id
  from public.customers c
  join public.shops s on s.id = c.shop_id
  where c.user_id = (select auth.uid()) and s.status = 'ativa';
$$;

-- Default de shop_id nas gravações do painel. Na transição, quem grava sem sessão de equipe
-- (app antigo) cai na Black Crown; a etapa 4 tira esse fallback.
create function private.default_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.staff_shop_id(), private.legacy_shop_id());
$$;

-- Confere a loja de uma RPC e devolve o próprio id. Modos (ver matriz no topo):
--   public: só loja ativa (site, agendamento, assinante)
--   read:   ativa ou suspensa (consulta e cancelamento de reserva)
--   write:  só loja ativa
create function private.assert_shop(p_shop uuid, p_mode text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status public.shop_status;
begin
  select status into v_status from public.shops where id = p_shop;

  if v_status is null then
    raise exception using errcode = 'BC015', message = 'shop_not_found', hint = 'Barbearia não encontrada.';
  end if;

  if (p_mode in ('public', 'write') and v_status <> 'ativa')
    or (p_mode = 'read' and v_status = 'cancelada') then
    raise exception using
      errcode = 'BC016',
      message = 'shop_unavailable',
      hint = 'Esta barbearia está temporariamente indisponível.';
  end if;

  return p_shop;
end;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.admin_shop_id() is not null;
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_shop_id() is not null;
$$;

create or replace function private.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select sm.professional_id
  from public.staff_members sm
  join public.shops s on s.id = sm.shop_id
  where sm.user_id = (select auth.uid()) and sm.is_active and s.status <> 'cancelada';
$$;

-- --- Defaults, chaves compostas e FKs ---

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shop_settings', 'payroll_settings', 'services', 'professionals', 'subscription_plans',
    'service_payouts', 'service_components', 'professional_services', 'plan_services',
    'staff_members', 'customers', 'customer_subscriptions', 'subscription_payments',
    'appointments', 'appointment_services', 'schedule_blocks', 'opening_periods',
    'schedule_exceptions', 'site_images'
  ] loop
    execute format('alter table public.%I alter column shop_id set default private.default_shop_id()', v_table);
  end loop;
end;
$$;

-- Tabelas cuja loja não vem de um pai obrigatório apontam direto para shops.
alter table public.shop_settings add constraint shop_settings_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.payroll_settings add constraint payroll_settings_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.services add constraint services_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.professionals add constraint professionals_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.subscription_plans add constraint subscription_plans_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.staff_members add constraint staff_members_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.customers add constraint customers_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.opening_periods add constraint opening_periods_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.schedule_exceptions add constraint schedule_exceptions_shop_id_fkey foreign key (shop_id) references public.shops (id);
alter table public.site_images add constraint site_images_shop_id_fkey foreign key (shop_id) references public.shops (id);

-- Alvos das FKs compostas.
alter table public.services add constraint services_shop_id_id_key unique (shop_id, id);
alter table public.professionals add constraint professionals_shop_id_id_key unique (shop_id, id);
alter table public.subscription_plans add constraint subscription_plans_shop_id_id_key unique (shop_id, id);
alter table public.customers add constraint customers_shop_id_id_key unique (shop_id, id);
alter table public.customer_subscriptions add constraint customer_subscriptions_shop_id_id_key unique (shop_id, id);
alter table public.appointments add constraint appointments_shop_id_id_key unique (shop_id, id);

-- Cada FK simples vira composta com o mesmo nome e o mesmo ON DELETE (inventário de
-- 2026-10-21). Assim um registro nunca aponta para outro de outra loja.
alter table public.service_payouts
  drop constraint service_payouts_service_id_fkey,
  add constraint service_payouts_service_id_fkey foreign key (shop_id, service_id)
    references public.services (shop_id, id) on delete cascade not valid;
alter table public.professional_services
  drop constraint professional_services_professional_id_fkey,
  add constraint professional_services_professional_id_fkey foreign key (shop_id, professional_id)
    references public.professionals (shop_id, id) on delete cascade not valid,
  drop constraint professional_services_service_id_fkey,
  add constraint professional_services_service_id_fkey foreign key (shop_id, service_id)
    references public.services (shop_id, id) on delete cascade not valid;
alter table public.plan_services
  drop constraint plan_services_plan_id_fkey,
  add constraint plan_services_plan_id_fkey foreign key (shop_id, plan_id)
    references public.subscription_plans (shop_id, id) on delete cascade not valid,
  drop constraint plan_services_service_id_fkey,
  add constraint plan_services_service_id_fkey foreign key (shop_id, service_id)
    references public.services (shop_id, id) on delete restrict not valid;
-- SET NULL só da coluna do profissional: o acesso continua na mesma loja.
alter table public.staff_members
  drop constraint staff_members_professional_id_fkey,
  add constraint staff_members_professional_id_fkey foreign key (shop_id, professional_id)
    references public.professionals (shop_id, id) on delete set null (professional_id) not valid;
alter table public.customer_subscriptions
  drop constraint customer_subscriptions_customer_id_fkey,
  add constraint customer_subscriptions_customer_id_fkey foreign key (shop_id, customer_id)
    references public.customers (shop_id, id) on delete cascade not valid,
  drop constraint customer_subscriptions_plan_id_fkey,
  add constraint customer_subscriptions_plan_id_fkey foreign key (shop_id, plan_id)
    references public.subscription_plans (shop_id, id) on delete restrict not valid;
alter table public.schedule_blocks
  drop constraint schedule_blocks_professional_id_fkey,
  add constraint schedule_blocks_professional_id_fkey foreign key (shop_id, professional_id)
    references public.professionals (shop_id, id) on delete cascade not valid;
alter table public.appointments
  drop constraint appointments_booked_professional_id_fkey,
  add constraint appointments_booked_professional_id_fkey foreign key (shop_id, booked_professional_id)
    references public.professionals (shop_id, id) on delete restrict not valid,
  drop constraint appointments_customer_id_fkey,
  add constraint appointments_customer_id_fkey foreign key (shop_id, customer_id)
    references public.customers (shop_id, id) on delete restrict not valid,
  drop constraint appointments_performed_by_id_fkey,
  add constraint appointments_performed_by_id_fkey foreign key (shop_id, performed_by_id)
    references public.professionals (shop_id, id) on delete restrict not valid,
  drop constraint appointments_service_id_fkey,
  add constraint appointments_service_id_fkey foreign key (shop_id, service_id)
    references public.services (shop_id, id) on delete restrict not valid,
  drop constraint appointments_subscription_id_fkey,
  add constraint appointments_subscription_id_fkey foreign key (shop_id, subscription_id)
    references public.customer_subscriptions (shop_id, id) on delete restrict not valid;
alter table public.subscription_payments
  drop constraint subscription_payments_subscription_id_fkey,
  add constraint subscription_payments_subscription_id_fkey foreign key (shop_id, subscription_id)
    references public.customer_subscriptions (shop_id, id) on delete restrict not valid;
alter table public.opening_periods
  drop constraint opening_periods_professional_id_fkey,
  add constraint opening_periods_professional_id_fkey foreign key (shop_id, professional_id)
    references public.professionals (shop_id, id) on delete cascade not valid;
alter table public.schedule_exceptions
  drop constraint schedule_exceptions_professional_id_fkey,
  add constraint schedule_exceptions_professional_id_fkey foreign key (shop_id, professional_id)
    references public.professionals (shop_id, id) on delete cascade not valid;
alter table public.appointment_services
  drop constraint appointment_services_appointment_id_fkey,
  add constraint appointment_services_appointment_id_fkey foreign key (shop_id, appointment_id)
    references public.appointments (shop_id, id) on delete cascade deferrable initially deferred not valid,
  drop constraint appointment_services_service_id_fkey,
  add constraint appointment_services_service_id_fkey foreign key (shop_id, service_id)
    references public.services (shop_id, id) on delete restrict not valid,
  drop constraint appointment_services_subscription_id_fkey,
  add constraint appointment_services_subscription_id_fkey foreign key (shop_id, subscription_id)
    references public.customer_subscriptions (shop_id, id) on delete restrict not valid;
alter table public.service_components
  drop constraint service_components_component_id_fkey,
  add constraint service_components_component_id_fkey foreign key (shop_id, component_id)
    references public.services (shop_id, id) on delete cascade not valid,
  drop constraint service_components_service_id_fkey,
  add constraint service_components_service_id_fkey foreign key (shop_id, service_id)
    references public.services (shop_id, id) on delete cascade not valid;

-- Validação separada: com tabelas grandes, roda sem travar gravações. Hoje é instantânea.
do $$
declare
  v_fk record;
begin
  for v_fk in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'f' and connamespace = 'public'::regnamespace and not convalidated
  loop
    execute format('alter table %s validate constraint %I', v_fk.tbl, v_fk.conname);
  end loop;
end;
$$;

-- Unicidade por loja. As globais (slug, telefone, login, id = 1, slot) saem na etapa 4.
alter table public.shop_settings add constraint shop_settings_shop_id_key unique (shop_id);
alter table public.payroll_settings add constraint payroll_settings_shop_id_key unique (shop_id);
alter table public.services add constraint services_shop_id_slug_key unique (shop_id, slug);
alter table public.professionals add constraint professionals_shop_id_slug_key unique (shop_id, slug);
alter table public.subscription_plans add constraint subscription_plans_shop_id_slug_key unique (shop_id, slug);
alter table public.customers add constraint customers_shop_id_phone_key unique (shop_id, phone);
alter table public.staff_members add constraint staff_members_shop_id_login_key unique (shop_id, login);
alter table public.site_images add constraint site_images_shop_id_slot_key unique (shop_id, slot);

-- Horários da barbearia (professional_id nulo) de lojas diferentes não se sobrepõem entre si.
alter table public.opening_periods add constraint opening_periods_no_overlap_per_shop exclude using gist (
  shop_id with =,
  (coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  weekday with =,
  tsrange('2000-01-01'::date + opens_at, '2000-01-01'::date + closes_at, '[)') with &&
);

create index appointments_shop_starts_idx on public.appointments (shop_id, starts_at);
create index schedule_exceptions_shop_starts_idx on public.schedule_exceptions (shop_id, starts_on);
create index opening_periods_shop_idx on public.opening_periods (shop_id, professional_id, weekday);
create index subscription_payments_shop_status_due_idx on public.subscription_payments (shop_id, status, due_date);

-- --- shop_id imutável ---

create function private.lock_shop_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shop_id is distinct from old.shop_id then
    raise exception using
      errcode = '42501',
      message = 'shop_change_not_allowed',
      hint = 'Um registro não pode mudar de barbearia.';
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shop_settings', 'payroll_settings', 'services', 'professionals', 'subscription_plans',
    'service_payouts', 'service_components', 'professional_services', 'plan_services',
    'staff_members', 'customers', 'customer_subscriptions', 'subscription_payments',
    'appointments', 'appointment_services', 'schedule_blocks', 'opening_periods',
    'schedule_exceptions', 'site_images'
  ] loop
    execute format(
      'create trigger lock_shop_id before update of shop_id on public.%I for each row execute function private.lock_shop_id()',
      v_table
    );
  end loop;
end;
$$;

-- --- Fuso por loja ---

create function public.shop_timezone(p_shop uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select timezone from public.shop_settings where shop_id = p_shop), 'America/Sao_Paulo');
$$;

create function public.shop_now(p_shop uuid)
returns timestamp
language sql
stable
security definer
set search_path = ''
as $$
  select now() at time zone public.shop_timezone(p_shop);
$$;

create function public.shop_today(p_shop uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public.shop_timezone(p_shop))::date;
$$;

create function public.shop_local_ts(p_shop uuid, p_date date, p_time time)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (p_date + p_time) at time zone public.shop_timezone(p_shop);
$$;

create function public.shop_local_date(p_shop uuid, p_ts timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_ts at time zone public.shop_timezone(p_shop))::date;
$$;

-- As versões sem loja ficam presas na Black Crown até a limpeza (etapa 5).
create or replace function public.shop_timezone()
returns text
language sql
stable
set search_path = ''
as $$
  select public.shop_timezone(private.legacy_shop_id());
$$;

-- started_at no fuso da loja do período (o default antigo usava o fuso da Black Crown).
create function private.customer_subscriptions_started_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at is null then
    new.started_at := public.shop_today(new.shop_id);
  end if;
  return new;
end;
$$;

create trigger customer_subscriptions_05_started_at before insert on public.customer_subscriptions
  for each row execute function private.customer_subscriptions_started_at();

alter table public.customer_subscriptions alter column started_at drop default;

-- --- Expediente e horários livres ---

create function private.day_periods(p_shop uuid, p_date date)
returns table (opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  with exceptions as (
    select e.kind, e.opens_at, e.closes_at
    from public.schedule_exceptions e
    where e.shop_id = p_shop
      and e.professional_id is null
      and p_date between e.starts_on and e.ends_on
  )
  select x.opens_at, x.closes_at
  from exceptions x
  where x.kind = 'horario_especial'
    and not exists (select 1 from exceptions c where c.kind = 'fechado')
  union all
  select op.opens_at, op.closes_at
  from public.opening_periods op
  where op.shop_id = p_shop
    and op.professional_id is null
    and op.weekday = extract(dow from p_date)
    and not exists (select 1 from exceptions c where c.kind in ('fechado', 'horario_especial'));
$$;

create function private.day_blocks(p_shop uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select public.shop_local_ts(p_shop, p_date, e.opens_at), public.shop_local_ts(p_shop, p_date, e.closes_at)
  from public.schedule_exceptions e
  where e.shop_id = p_shop
    and e.professional_id is null
    and e.kind = 'bloqueio'
    and p_date between e.starts_on and e.ends_on;
$$;

create or replace function private.day_periods(p_date date)
returns table (opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  select d.opens_at, d.closes_at from private.day_periods(private.legacy_shop_id(), p_date) d;
$$;

create or replace function private.day_blocks(p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.starts_at, d.ends_at from private.day_blocks(private.legacy_shop_id(), p_date) d;
$$;

create or replace function private.professional_own_day_blocks(p_professional_id uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select public.shop_local_ts(e.shop_id, p_date, e.opens_at), public.shop_local_ts(e.shop_id, p_date, e.closes_at)
  from public.schedule_exceptions e
  where e.professional_id = p_professional_id
    and e.kind = 'bloqueio'
    and p_date between e.starts_on and e.ends_on;
$$;

create or replace function private.professional_day_blocks(p_professional_id uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.starts_at, b.ends_at
  from public.professionals p
  cross join lateral private.day_blocks(p.shop_id, p_date) b
  where p.id = p_professional_id
  union all
  select b.starts_at, b.ends_at from private.professional_own_day_blocks(p_professional_id, p_date) b;
$$;

create or replace function private.professional_day_periods(p_professional_id uuid, p_date date)
returns table (opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct greatest(o.opens_at, s.opens_at), least(o.closes_at, s.closes_at)
  from public.professionals p
  cross join lateral private.professional_own_day_periods(p.id, p_date) o
  join lateral private.day_periods(p.shop_id, p_date) s
    on greatest(o.opens_at, s.opens_at) < least(o.closes_at, s.closes_at)
  where p.id = p_professional_id;
$$;

create or replace function private.free_slots(p_service_ids uuid[], p_professional_id uuid, p_date date)
returns table (slot_start timestamptz)
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select s.timezone, s.slot_interval_minutes, s.min_lead_minutes
    from public.professionals p
    join public.shop_settings s on s.shop_id = p.shop_id
    where p.id = p_professional_id
  ), svc as (
    select sum(s.duration_minutes)::integer as duration_minutes
    from public.services s
    join public.professional_services ps on ps.service_id = s.id and ps.professional_id = p_professional_id
    where s.id = any (p_service_ids) and s.is_active
    having count(*) = cardinality(p_service_ids)
  ), day as (
    -- Horário próprio ∩ barbearia, já com as exceções dos dois.
    select opens_at, closes_at
    from private.professional_day_periods(p_professional_id, p_date)
  ), candidates as (
    select
      (p_date + day.opens_at + make_interval(mins => step * cfg.slot_interval_minutes)) at time zone cfg.timezone as starts_at,
      make_interval(mins => svc.duration_minutes) as duration,
      cfg.min_lead_minutes
    from cfg, svc, day,
      generate_series(
        0,
        ((extract(epoch from day.closes_at - day.opens_at) / 60)::integer - svc.duration_minutes) / cfg.slot_interval_minutes
      ) as step
  )
  select distinct c.starts_at
  from candidates c
  where c.starts_at >= now() + make_interval(mins => c.min_lead_minutes)
    and not exists (
      select 1
      from public.appointments a
      where a.performed_by_id = p_professional_id
        and a.status in ('agendado', 'concluido')
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.starts_at, c.starts_at + c.duration, '[)')
    )
    and not exists (
      select 1
      from public.schedule_blocks b
      where b.professional_id = p_professional_id
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(c.starts_at, c.starts_at + c.duration, '[)')
    )
    -- Trechos bloqueados da barbearia e do profissional.
    and not exists (
      select 1
      from private.professional_day_blocks(p_professional_id, p_date) x
      where tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(c.starts_at, c.starts_at + c.duration, '[)')
    )
  order by 1;
$$;

create function private.day_slots(p_shop uuid, p_service_ids uuid[], p_professional text, p_date date)
returns table (slot_start timestamptz, professional_ids uuid[], professional_slugs text[])
language sql
stable
set search_path = ''
as $$
  select
    fs.slot_start,
    array_agg(p.id order by p.sort_order, p.slug),
    array_agg(p.slug order by p.sort_order, p.slug)
  from public.shop_settings cfg
  join public.professionals p
    on p.shop_id = cfg.shop_id and p.is_active and (p_professional = 'qualquer' or p.slug = p_professional)
  cross join lateral private.free_slots(p_service_ids, p.id, p_date) fs
  where cfg.shop_id = p_shop
    and p_date >= public.shop_today(p_shop)
    and p_date < public.shop_today(p_shop) + cfg.booking_window_days
  group by fs.slot_start
  order by fs.slot_start;
$$;

create or replace function private.day_slots(p_service_ids uuid[], p_professional text, p_date date)
returns table (slot_start timestamptz, professional_ids uuid[], professional_slugs text[])
language sql
stable
set search_path = ''
as $$
  select ds.slot_start, ds.professional_ids, ds.professional_slugs
  from private.day_slots(private.legacy_shop_id(), p_service_ids, p_professional, p_date) ds;
$$;

-- --- Catálogo resolvido dentro da loja ---

create function private.check_professional(p_shop uuid, p_choice text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_choice = 'qualquer'
    or exists (select 1 from public.professionals where shop_id = p_shop and slug = p_choice and is_active) then
    return p_choice;
  end if;
  raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Profissional inválido.';
end;
$$;

create function private.resolve_service(p_shop uuid, p_slug text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.services where shop_id = p_shop and slug = p_slug and is_active;
  if v_id is null then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Serviço inválido.';
  end if;
  return v_id;
end;
$$;

create function private.resolve_services(p_shop uuid, p_services text[])
returns uuid[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v_ids uuid[] := '{}';
  v_slug text;
  v_id uuid;
begin
  if p_services is null or cardinality(p_services) not between 1 and 5 then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Escolha de 1 a 5 serviços.';
  end if;

  foreach v_slug in array p_services loop
    v_id := private.resolve_service(p_shop, v_slug);
    if v_id = any (v_ids) then
      raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Serviço repetido.';
    end if;
    v_ids := v_ids || v_id;
  end loop;

  if exists (
    select 1
    from unnest(v_ids) as chosen(id)
    left join public.service_components sc on sc.service_id = chosen.id
    group by coalesce(sc.component_id, chosen.id)
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'BC012',
      message = 'conflicting_services',
      hint = 'Um dos serviços escolhidos já está incluído em outro. Revise a seleção.';
  end if;

  return v_ids;
end;
$$;

create or replace function private.check_professional(p_choice text)
returns text
language sql
stable
set search_path = ''
as $$
  select private.check_professional(private.legacy_shop_id(), p_choice);
$$;

create or replace function private.resolve_service(p_slug text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select private.resolve_service(private.legacy_shop_id(), p_slug);
$$;

create or replace function private.resolve_services(p_services text[])
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select private.resolve_services(private.legacy_shop_id(), p_services);
$$;

-- --- Reserva ---

-- A loja vem do cliente. O código da reserva é conferido antes de gravar, mas duas reservas
-- simultâneas podem sortear o mesmo: nesse caso tenta de novo (até 5 vezes).
create or replace function private.book_site_appointment(
  p_customer_id uuid,
  p_service_ids uuid[],
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
  v_start timestamptz;
  v_candidates uuid[];
  v_assigned uuid;
  v_candidate uuid;
  v_appointment_id uuid;
  v_attempt integer;
  v_constraint text;
begin
  if p_date is null or coalesce(p_time, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception using
      errcode = 'BC001',
      message = 'invalid_request',
      hint = 'Revise os dados do agendamento antes de confirmar.';
  end if;

  select shop_id into v_shop from public.customers where id = p_customer_id;
  v_start := public.shop_local_ts(v_shop, p_date, p_time::time);

  -- Revalida o horário com a duração total: o intervalo inteiro precisa estar livre.
  select ds.professional_ids into v_candidates
  from private.day_slots(v_shop, p_service_ids, p_professional, p_date) ds
  where ds.slot_start = v_start;

  if v_candidates is null then
    raise exception using
      errcode = 'BC002',
      message = 'slot_unavailable',
      hint = 'Esse horário acabou de ser ocupado. Escolha outro horário.';
  end if;

  select id into v_assigned from public.professionals where shop_id = v_shop and slug = p_assigned_professional;
  if v_assigned = any (v_candidates) then
    v_candidates := array_prepend(v_assigned, array_remove(v_candidates, v_assigned));
  end if;

  foreach v_candidate in array v_candidates loop
    v_attempt := 0;
    loop
      begin
        v_appointment_id := gen_random_uuid();

        -- Itens com as cópias do catálogo (a FK para o agendamento é conferida no fim).
        insert into public.appointment_services (shop_id, appointment_id, service_id, position, service_name, price, duration_minutes)
        select v_shop, v_appointment_id, s.id, chosen.ord::smallint, s.name, s.price, s.duration_minutes
        from unnest(p_service_ids) with ordinality as chosen(id, ord)
        join public.services s on s.id = chosen.id and s.shop_id = v_shop;

        -- Preço, término e nome saem da soma dos itens (appointments_prepare).
        insert into public.appointments (
          shop_id, id, customer_id, service_id, booked_professional_id, performed_by_id,
          requested_any_professional, starts_at, status, source, customer_notes
        )
        values (
          v_shop, v_appointment_id, p_customer_id, p_service_ids[1], v_candidate, v_candidate,
          p_professional = 'qualquer', v_start, 'agendado', 'site', p_notes
        );
        exit;
      exception
        when exclusion_violation then
          -- Outro cliente levou o horário deste profissional; tenta o próximo.
          v_appointment_id := null;
          exit;
        when unique_violation then
          get stacked diagnostics v_constraint = constraint_name;
          v_appointment_id := null;
          if v_constraint is distinct from 'appointments_code_key' or v_attempt >= 4 then
            raise;
          end if;
          v_attempt := v_attempt + 1;
      end;
    end loop;
    exit when v_appointment_id is not null;
  end loop;

  if v_appointment_id is null then
    raise exception using
      errcode = 'BC002',
      message = 'slot_unavailable',
      hint = 'Esse horário acabou de ser ocupado. Escolha outro horário.';
  end if;

  return v_appointment_id;
end;
$$;

create or replace function private.reservation_json(p_appointment_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', a.code,
    'status', case a.status when 'agendado' then 'confirmado' else a.status::text end,
    'createdAt', a.created_at,
    'serviceId', s.slug,
    'services', (
      select jsonb_agg(
        jsonb_build_object('id', si.slug, 'name', i.service_name, 'price', i.price, 'durationMinutes', i.duration_minutes)
        order by i.position
      )
      from public.appointment_services i
      join public.services si on si.id = i.service_id
      where i.appointment_id = a.id
    ),
    'professionalId', p.slug,
    'requestedAnyProfessional', a.requested_any_professional,
    'date', public.shop_local_date(a.shop_id, a.starts_at),
    'time', to_char(a.starts_at at time zone public.shop_timezone(a.shop_id), 'HH24:MI'),
    'durationMinutes', (extract(epoch from a.ends_at - a.starts_at) / 60)::integer,
    'price', a.price,
    'customer', jsonb_build_object(
      'name', c.name,
      'phone', private.format_phone(c.phone),
      'email', coalesce(c.email, ''),
      'notes', coalesce(a.customer_notes, '')
    )
  )
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  join public.services s on s.id = a.service_id
  join public.professionals p on p.id = a.performed_by_id
  where a.id = p_appointment_id;
$$;

-- --- Assinaturas e cobrança ---

create or replace function private.subscription_in_good_standing(p_subscription_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.subscription_payments sp
    join public.shop_settings s on s.shop_id = sp.shop_id
    where sp.subscription_id = p_subscription_id
      and sp.status = 'pendente'
      and sp.due_date + s.subscription_grace_days < p_date
  );
$$;

create or replace function private.plan_coverage(
  p_customer_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_appointment_id uuid default null,
  p_booked_at timestamptz default null
)
returns table (subscription_id uuid, plan_id uuid, reason text, week_start date, week_end date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop uuid := (select c.shop_id from public.customers c where c.id = p_customer_id);
  v_date date := public.shop_local_date(v_shop, p_starts_at);
  -- Segunda-feira da semana (isodow: 1 = segunda), sem depender do fuso da sessão.
  v_week_start date := v_date - (extract(isodow from v_date)::integer - 1);
  v_booked_at timestamptz := coalesce(p_booked_at, now());
  v_subscription_id uuid;
  v_plan_id uuid;
  v_status public.subscription_status;
  v_started_at date;
  v_limit smallint;
  v_period text;
  v_window_start date;
  v_window_end date;
  v_cycle integer;
  v_used integer;
begin
  select cs.id, cs.plan_id, cs.status, cs.started_at into v_subscription_id, v_plan_id, v_status, v_started_at
  from public.customer_subscriptions cs
  where cs.customer_id = p_customer_id
    and cs.status <> 'cancelada'
    and cs.started_at <= v_date
    and (cs.ended_at is null or cs.ended_at >= v_date)
  limit 1;

  if not found then
    return query
      select null::uuid,
        (
          select cs.plan_id
          from public.customer_subscriptions cs
          where cs.customer_id = p_customer_id
          order by cs.started_at desc, cs.created_at desc
          limit 1
        ),
        'inativo'::text, v_week_start, v_week_start + 6;
    return;
  end if;

  if v_status = 'suspensa' then
    return query select null::uuid, v_plan_id, 'congelado'::text, v_week_start, v_week_start + 6;
    return;
  end if;

  if not private.subscription_in_good_standing(v_subscription_id, v_date) then
    return query select null::uuid, v_plan_id, 'pagamento_atrasado'::text, v_week_start, v_week_start + 6;
    return;
  end if;

  select ps.weekly_limit, ps.period into v_limit, v_period
  from public.plan_services ps
  where ps.plan_id = v_plan_id and ps.service_id = p_service_id;

  if not found then
    return query select null::uuid, v_plan_id, 'fora_do_plano'::text, v_week_start, v_week_start + 6;
    return;
  end if;

  if v_period = 'mes' then
    v_cycle := (extract(year from age(v_date, v_started_at)) * 12 + extract(month from age(v_date, v_started_at)))::integer;
    while (v_started_at + make_interval(months => v_cycle + 1))::date <= v_date loop
      v_cycle := v_cycle + 1;
    end loop;
    v_window_start := (v_started_at + make_interval(months => v_cycle))::date;
    v_window_end := (v_started_at + make_interval(months => v_cycle + 1))::date - 1;
  else
    v_window_start := v_week_start;
    v_window_end := v_week_start + 6;
  end if;

  -- Uso pelos serviços de cada agendamento (um agendamento pode ter vários).
  select count(*)::integer into v_used
  from public.appointment_services i
  join public.appointments a on a.id = i.appointment_id
  where a.customer_id = p_customer_id
    and i.service_id = p_service_id
    and a.id is distinct from p_appointment_id
    and a.starts_at >= public.shop_local_ts(v_shop, v_window_start, time '00:00')
    and a.starts_at < public.shop_local_ts(v_shop, v_window_end + 1, time '00:00')
    and (
      (a.status = 'agendado' and a.created_at < v_booked_at)
      or (a.status = 'concluido' and i.covered_by_plan)
    );

  if v_used >= v_limit then
    return query
      select null::uuid, v_plan_id,
        (case v_period when 'mes' then 'limite_mensal' else 'limite_semanal' end)::text,
        v_window_start, v_window_end;
  else
    return query select v_subscription_id, v_plan_id, 'incluido'::text, v_window_start, v_window_end;
  end if;
end;
$$;

create or replace function private.subscription_covering(p_customer_id uuid, p_service_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pc.subscription_id
  from private.plan_coverage(
    p_customer_id,
    p_service_id,
    public.shop_local_ts((select c.shop_id from public.customers c where c.id = p_customer_id), p_date, time '12:00')
  ) pc;
$$;

-- Mensalidades até hoje, no fuso de cada loja. Lojas canceladas não geram cobrança. Cada
-- execução grava no máximo 5 mil linhas (transação curta); o cron retoma na rodada seguinte.
create or replace function private.generate_subscription_payments(p_until date default null, p_customer_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Rodadas do cron não se sobrepõem; a geração de um cliente (trigger) não espera.
  if p_customer_id is null and not pg_try_advisory_xact_lock(hashtext('private.generate_subscription_payments')) then
    return 0;
  end if;

  insert into public.subscription_payments (shop_id, subscription_id, period_start, period_end, due_date, amount)
  select cs.shop_id, cs.id, p.period_start, p.next_start - 1, p.period_start, sp.monthly_price
  from public.customer_subscriptions cs
  join public.shops sh on sh.id = cs.shop_id and sh.status <> 'cancelada'
  join public.subscription_plans sp on sp.id = cs.plan_id
  cross join lateral (select coalesce(p_until, public.shop_today(cs.shop_id)) as until) u
  cross join lateral (
    select
      (cs.started_at + make_interval(months => k))::date as period_start,
      (cs.started_at + make_interval(months => k + 1))::date as next_start
    from generate_series(
      0,
      (
        extract(year from age(least(u.until, coalesce(cs.ended_at, u.until)), cs.started_at)) * 12
        + extract(month from age(least(u.until, coalesce(cs.ended_at, u.until)), cs.started_at))
      )::integer
    ) as k
  ) p
  where cs.status = 'ativa'
    and cs.started_at <= u.until
    and (p_customer_id is null or cs.customer_id = p_customer_id)
    and p.period_start <= least(u.until, coalesce(cs.ended_at, u.until))
    and not exists (
      select 1 from public.subscription_payments x
      where x.subscription_id = cs.id and x.period_start = p.period_start
    )
  limit 5000
  on conflict (subscription_id, period_start) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function private.apply_subscription(p_customer_id uuid, p_plan_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := (select c.shop_id from public.customers c where c.id = p_customer_id);
  v_today date := public.shop_today(v_shop);
  v_target public.subscription_status := case p_status when 'ativo' then 'ativa' when 'congelado' then 'suspensa' end;
  v_open public.customer_subscriptions;
  v_today_row public.customer_subscriptions;
begin
  -- Uma mudança por vez para o mesmo cliente.
  perform 1 from public.customers where id = p_customer_id for update;

  -- Gera a cobrança até hoje antes de mudar o período.
  perform private.generate_subscription_payments(null, p_customer_id);

  select * into v_open
  from public.customer_subscriptions
  where customer_id = p_customer_id and ended_at is null
  for update;

  if found then
    if p_status <> 'inativo' and v_open.plan_id = p_plan_id and v_open.status = v_target then
      return;
    end if;

    if v_open.started_at = v_today then
      -- Começou hoje: ajusta o próprio período e refaz a cobrança pendente dele.
      delete from public.subscription_payments where subscription_id = v_open.id and status = 'pendente';
      update public.customer_subscriptions
      set plan_id = case when p_status = 'inativo' then plan_id else p_plan_id end,
          status = coalesce(v_target, 'cancelada'),
          ended_at = case when p_status = 'inativo' then v_today end
      where id = v_open.id;
      return;
    end if;

    -- Encerra o período atual na véspera; o novo começa hoje.
    update public.customer_subscriptions set ended_at = v_today - 1 where id = v_open.id;
    if p_status = 'inativo' then
      return;
    end if;
  elsif p_status = 'inativo' then
    -- Já inativo. Cadastro novo direto como inativo: o plano fica num período anulado.
    if not exists (select 1 from public.customer_subscriptions where customer_id = p_customer_id) then
      insert into public.customer_subscriptions (shop_id, customer_id, plan_id, status, started_at, ended_at)
      values (v_shop, p_customer_id, p_plan_id, 'cancelada', v_today, v_today);
    end if;
    return;
  else
    -- Reativação no mesmo dia de um período anulado: reaproveita a linha (sem sobreposição).
    select * into v_today_row
    from public.customer_subscriptions
    where customer_id = p_customer_id and started_at = v_today
    order by created_at desc
    limit 1
    for update;

    if found then
      delete from public.subscription_payments where subscription_id = v_today_row.id and status = 'pendente';
      update public.customer_subscriptions
      set plan_id = p_plan_id, status = v_target, ended_at = null
      where id = v_today_row.id;
      return;
    end if;
  end if;

  insert into public.customer_subscriptions (shop_id, customer_id, plan_id, status, started_at)
  values (v_shop, p_customer_id, p_plan_id, v_target, v_today);
end;
$$;

create function private.can_manage_subscribers(p_shop uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.admin_write_shop_id()) is not distinct from p_shop and p_shop is not null
    or (
      coalesce((select auth.jwt()) ->> 'role', '') = 'service_role'
      and exists (select 1 from public.shops where id = p_shop and status = 'ativa')
    );
$$;

create or replace function private.can_manage_subscribers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_subscribers(private.legacy_shop_id());
$$;

-- --- Retenção do histórico ---

create function private.history_cutoff(p_shop uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    public.shop_today(p_shop)
    - make_interval(months => coalesce((select history_retention_months from public.shop_settings where shop_id = p_shop), 6))
  )::date;
$$;

create or replace function private.history_cutoff()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select private.history_cutoff(private.legacy_shop_id());
$$;

-- Apaga por loja, com a retenção e o fuso de cada uma. Teto de 2 mil linhas por loja e 5 mil
-- por rodada (transação curta); o cron roda várias vezes na madrugada e retoma do ponto.
create or replace function private.purge_expired_history()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_budget integer := 5000;
  v_per_shop constant integer := 2000;
  v_shop uuid;
  v_cutoff_at timestamptz;
  v_n integer;
  v_appointments integer := 0;
  v_blocks integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('private.purge_expired_history')) then
    return jsonb_build_object('skipped', true);
  end if;

  -- Ordem aleatória: com o teto da rodada, nenhuma loja fica sempre por último.
  for v_shop in select id from public.shops order by random() loop
    exit when v_budget <= 0;
    v_cutoff_at := public.shop_local_ts(v_shop, private.history_cutoff(v_shop), time '00:00');

    delete from public.appointments
    where id in (
      select id from public.appointments
      where shop_id = v_shop and starts_at < v_cutoff_at
      limit least(v_per_shop, v_budget)
    );
    get diagnostics v_n = row_count;
    v_appointments := v_appointments + v_n;
    v_budget := v_budget - v_n;
    exit when v_budget <= 0;

    -- Intervalo [starts_at, ends_at): terminar à meia-noite do corte é terminar antes dele.
    delete from public.schedule_blocks
    where id in (
      select id from public.schedule_blocks
      where shop_id = v_shop and ends_at <= v_cutoff_at
      limit least(v_per_shop, v_budget)
    );
    get diagnostics v_n = row_count;
    v_blocks := v_blocks + v_n;
    v_budget := v_budget - v_n;
  end loop;

  return jsonb_build_object('appointments', v_appointments, 'schedule_blocks', v_blocks, 'budget_left', v_budget);
end;
$$;

-- --- Triggers de agendamento: tudo na loja do próprio agendamento ---

create or replace function public.appointments_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text;
  v_duration integer;
  v_price numeric(10, 2);
  v_items integer;
  v_first uuid;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  v_timezone := public.shop_timezone(new.shop_id);

  if new.performed_by_id is null then
    new.performed_by_id := new.booked_professional_id;
  end if;

  if tg_op = 'INSERT' then
    select count(*), sum(i.price), sum(i.duration_minutes)
    into v_items, v_price, v_duration
    from public.appointment_services i
    where i.appointment_id = new.id;

    if v_items > 0 then
      select i.service_id into v_first
      from public.appointment_services i
      where i.appointment_id = new.id
      order by i.position
      limit 1;
      new.service_id := v_first;
    else
      select duration_minutes, price into v_duration, v_price
      from public.services
      where id = new.service_id;

      if not found then
        raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Serviço inexistente.';
      end if;
    end if;

    new.price := v_price;
    new.ends_at := new.starts_at + make_interval(mins => v_duration);
  elsif new.service_id is distinct from old.service_id then
    if (select count(*) from public.appointment_services i where i.appointment_id = new.id) > 1 then
      raise exception using
        errcode = 'BC001',
        message = 'invalid_request',
        hint = 'Este agendamento tem vários serviços: cancele e faça uma nova reserva para trocar.';
    end if;

    select duration_minutes, price into v_duration, v_price
    from public.services
    where id = new.service_id;

    if not found then
      raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Serviço inexistente.';
    end if;

    new.price := v_price;
    new.ends_at := new.starts_at + make_interval(mins => v_duration);
  elsif new.starts_at is distinct from old.starts_at and new.ends_at is not distinct from old.ends_at then
    -- Remarcação: mantém a duração atual.
    new.ends_at := new.starts_at + (old.ends_at - old.starts_at);
  end if;

  v_local_start := new.starts_at at time zone v_timezone;
  v_local_end := new.ends_at at time zone v_timezone;

  -- Profissional: atende todos os serviços, não está bloqueado e está no próprio horário
  -- (também ao trocar quem executa).
  if new.status in ('agendado', 'concluido') and (
    tg_op = 'INSERT'
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.service_id is distinct from old.service_id
    or new.performed_by_id is distinct from old.performed_by_id
    or old.status in ('cancelado', 'faltou')
  ) then
    if exists (
      select 1
      from (
        select i.service_id from public.appointment_services i where i.appointment_id = new.id
        union
        select new.service_id
      ) chosen
      where not exists (
        select 1
        from public.professional_services ps
        join public.professionals p on p.id = ps.professional_id
        where ps.professional_id = new.performed_by_id
          and ps.service_id = chosen.service_id
          and (p.is_active or tg_op = 'UPDATE')
      )
    ) then
      raise exception using
        errcode = 'BC005',
        message = 'service_not_offered',
        hint = 'O profissional não atende este serviço.';
    end if;

    if exists (
      select 1
      from public.schedule_blocks b
      where b.professional_id = new.performed_by_id
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception using
        errcode = 'BC004',
        message = 'professional_blocked',
        hint = 'O profissional está com a agenda bloqueada nesse horário.';
    end if;

    if not exists (
      select 1
      from private.professional_own_day_periods(new.performed_by_id, v_local_start::date) p
      where v_local_start::time >= p.opens_at
        and v_local_end <= v_local_start::date + p.closes_at
    ) or exists (
      select 1
      from private.professional_own_day_blocks(new.performed_by_id, v_local_start::date) x
      where tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception using
        errcode = 'BC014',
        message = 'professional_unavailable',
        hint = 'O profissional não atende nesse horário.';
    end if;
  end if;

  -- Expediente da barbearia (períodos + exceções) com a duração total.
  if new.status in ('agendado', 'concluido') and (
    tg_op = 'INSERT'
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.service_id is distinct from old.service_id
    or old.status in ('cancelado', 'faltou')
  ) then
    if not exists (
      select 1
      from private.day_periods(new.shop_id, v_local_start::date) p
      where v_local_start::time >= p.opens_at
        and v_local_end <= v_local_start::date + p.closes_at
    ) or exists (
      select 1
      from private.day_blocks(new.shop_id, v_local_start::date) x
      where tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
    ) then
      raise exception using
        errcode = 'BC003',
        message = 'outside_opening_hours',
        hint = 'Horário fora do expediente da barbearia.';
    end if;
  end if;

  if new.status = 'cancelado' then
    if tg_op = 'INSERT' or old.status <> 'cancelado' or new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  else
    new.cancelled_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.appointments_settle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subscription_id uuid;
  v_plan_payout numeric(10, 2);
  v_rate numeric(5, 4);
  v_item record;
  v_item_sub uuid;
  v_item_charged numeric(10, 2);
  v_item_payout numeric(10, 2);
  v_all_covered boolean := true;
  v_first_sub uuid;
  v_charged numeric(10, 2) := 0;
  v_payout numeric(10, 2) := 0;
  v_items integer := 0;
begin
  if new.status <> 'concluido' then
    new.covered_by_plan := null;
    new.subscription_id := null;
    new.charged_amount := null;
    new.payout_amount := null;
    if tg_op = 'UPDATE' and old.status = 'concluido' then
      update public.appointment_services
      set covered_by_plan = null, subscription_id = null, charged_amount = null, payout_amount = null
      where appointment_id = new.id;
    end if;
    return new;
  end if;

  -- Já concluído e nada que afete o cálculo mudou: preserva o snapshot.
  if tg_op = 'UPDATE'
    and old.status = 'concluido'
    and new.customer_id = old.customer_id
    and new.service_id = old.service_id
    and new.price = old.price
    and new.starts_at = old.starts_at then
    return new;
  end if;

  -- Garante que as mensalidades até hoje existem antes de olhar o atraso.
  perform private.generate_subscription_payments(null, new.customer_id);

  select walk_in_commission_rate into v_rate
  from public.payroll_settings
  where shop_id = new.shop_id;

  if tg_op = 'UPDATE' and new.service_id is not distinct from old.service_id then
    for v_item in
      select i.service_id, i.price
      from public.appointment_services i
      where i.appointment_id = new.id
      order by i.position
    loop
      v_items := v_items + 1;

      select pc.subscription_id into v_item_sub
      from private.plan_coverage(new.customer_id, v_item.service_id, new.starts_at, new.id, new.created_at) pc;

      if v_item_sub is not null then
        select plan_payout_amount into v_plan_payout
        from public.service_payouts
        where service_id = v_item.service_id;
        v_item_charged := 0;
        v_item_payout := coalesce(v_plan_payout, 0);
        v_first_sub := coalesce(v_first_sub, v_item_sub);
      else
        v_item_charged := v_item.price;
        v_item_payout := round(v_item.price * coalesce(v_rate, 0), 2);
        v_all_covered := false;
      end if;

      update public.appointment_services
      set covered_by_plan = v_item_sub is not null,
          subscription_id = v_item_sub,
          charged_amount = v_item_charged,
          payout_amount = v_item_payout
      where appointment_id = new.id and service_id = v_item.service_id;

      v_charged := v_charged + v_item_charged;
      v_payout := v_payout + v_item_payout;
    end loop;
  end if;

  if v_items > 0 then
    new.covered_by_plan := v_all_covered;
    new.subscription_id := v_first_sub;
    new.charged_amount := v_charged;
    new.payout_amount := v_payout;
    return new;
  end if;

  -- Sem itens ainda (inserção direta já concluída) ou troca de serviço: regra de 1 serviço; o
  -- item é sincronizado em appointments_sync_items.
  select pc.subscription_id into v_subscription_id
  from private.plan_coverage(new.customer_id, new.service_id, new.starts_at, new.id, new.created_at) pc;

  if v_subscription_id is not null then
    select plan_payout_amount into v_plan_payout
    from public.service_payouts
    where service_id = new.service_id;

    new.covered_by_plan := true;
    new.subscription_id := v_subscription_id;
    new.charged_amount := 0;
    new.payout_amount := coalesce(v_plan_payout, 0);
  else
    new.covered_by_plan := false;
    new.subscription_id := null;
    new.charged_amount := new.price;
    new.payout_amount := round(new.price * coalesce(v_rate, 0), 2);
  end if;

  return new;
end;
$$;

create or replace function public.appointments_sync_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.appointment_services where appointment_id = new.id) then
      insert into public.appointment_services (
        shop_id, appointment_id, service_id, position, service_name, price, duration_minutes,
        covered_by_plan, subscription_id, charged_amount, payout_amount
      )
      values (
        new.shop_id, new.id, new.service_id, 1, new.service_name, new.price,
        (extract(epoch from new.ends_at - new.starts_at) / 60)::integer,
        new.covered_by_plan, new.subscription_id, new.charged_amount, new.payout_amount
      );
    end if;
  elsif new.service_id is distinct from old.service_id then
    update public.appointment_services
    set service_id = new.service_id,
        service_name = new.service_name,
        price = new.price,
        duration_minutes = (extract(epoch from new.ends_at - new.starts_at) / 60)::integer,
        covered_by_plan = new.covered_by_plan,
        subscription_id = new.subscription_id,
        charged_amount = new.charged_amount,
        payout_amount = new.payout_amount
    where appointment_id = new.id;
  end if;
  return null;
end;
$$;

-- --- Resolução da loja pelo site ---

create function public.resolve_shop_host(p_host text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select shop_id from public.shop_domains where host = lower(btrim(p_host));
$$;

create function public.resolve_shop_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.shops where slug = lower(btrim(p_slug));
$$;

-- Perfil público: só o que aparece no site. Carência e retenção ficam de fora.
create function public.get_shop_profile(p_shop uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', sh.id,
    'slug', sh.slug,
    'status', sh.status,
    'name', s.name,
    'description', s.description,
    'address', s.address,
    'city', s.city,
    'phone', s.phone,
    'whatsapp', s.whatsapp,
    'instagram', s.instagram,
    'mapsUrl', s.maps_url,
    'timezone', s.timezone,
    'bookingWindowDays', s.booking_window_days,
    'slotIntervalMinutes', s.slot_interval_minutes,
    'minLeadMinutes', s.min_lead_minutes,
    'cancelMinNoticeMinutes', s.cancel_min_notice_minutes
  )
  from public.shops sh
  join public.shop_settings s on s.shop_id = sh.id
  where sh.id = p_shop;
$$;

-- Vínculo de quem está logado, lido direto do banco (sem cache): as actions com service role
-- conferem loja, papel e situação antes de chamar o Auth Admin.
create function public.staff_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'shopId', sm.shop_id,
    'role', sm.role,
    'isActive', sm.is_active,
    'professionalId', sm.professional_id,
    'shopStatus', sh.status
  )
  from public.staff_members sm
  join public.shops sh on sh.id = sm.shop_id
  where sm.user_id = (select auth.uid());
$$;

-- --- RPCs públicas com a loja ---

create function public.get_day_availability(p_shop uuid, p_services text[], p_professional text, p_date date)
returns table (slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(ds.slot_start at time zone public.shop_timezone(p_shop), 'HH24:MI'), ds.professional_slugs
  from private.day_slots(
    private.assert_shop(p_shop, 'public'),
    private.resolve_services(p_shop, p_services),
    private.check_professional(p_shop, p_professional),
    p_date
  ) ds
  order by ds.slot_start;
$$;

create function public.get_day_summaries(p_shop uuid, p_services text[], p_professional text, p_start date, p_days integer)
returns table (day date, status text, available_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      private.assert_shop(p_shop, 'public') as shop,
      private.resolve_services(p_shop, p_services) as service_ids,
      private.check_professional(p_shop, p_professional) as professional,
      least(
        greatest(coalesce(p_days, 0), 0),
        (select booking_window_days from public.shop_settings where shop_id = p_shop)
      ) as days
  )
  select
    d.day,
    case when not opened.is_open then 'closed' when slots.total > 0 then 'open' else 'full' end,
    case when not opened.is_open then 0 else slots.total end
  from params
  cross join lateral (select p_start + offs.i as day from generate_series(0, params.days - 1) as offs(i)) d
  cross join lateral (
    select exists (
      select 1
      from public.professionals p
      where p.shop_id = params.shop
        and p.is_active
        and (params.professional = 'qualquer' or p.slug = params.professional)
        and exists (select 1 from private.professional_day_periods(p.id, d.day))
    ) as is_open
  ) opened
  cross join lateral (
    select count(*)::integer as total
    from private.day_slots(params.shop, params.service_ids, params.professional, d.day)
  ) slots
  order by d.day;
$$;

create function public.find_next_available(p_shop uuid, p_services text[], p_professional text, p_from date)
returns table (day date, slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      private.assert_shop(p_shop, 'public') as shop,
      private.resolve_services(p_shop, p_services) as service_ids,
      private.check_professional(p_shop, p_professional) as professional,
      public.shop_today(p_shop) as today,
      (select booking_window_days from public.shop_settings where shop_id = p_shop) as window_days
  )
  select d.day, to_char(ds.slot_start at time zone public.shop_timezone(params.shop), 'HH24:MI'), ds.professional_slugs
  from params
  cross join lateral (
    select params.today + offs.i as day
    from generate_series(greatest(p_from, params.today) - params.today, params.window_days - 1) as offs(i)
  ) d
  cross join lateral private.day_slots(params.shop, params.service_ids, params.professional, d.day) ds
  order by ds.slot_start
  limit 1;
$$;

create function public.create_reservation(
  p_shop uuid,
  p_services text[],
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null,
  p_whatsapp_opt_in boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := private.assert_shop(p_shop, 'public');
  v_service_ids uuid[] := private.resolve_services(v_shop, p_services);
  v_professional text := private.check_professional(v_shop, p_professional);
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_opt_in boolean := coalesce(p_whatsapp_opt_in, false);
  v_customer_id uuid;
  v_appointment_id uuid;
begin
  if char_length(v_name) not between 2 and 120
    or v_phone !~ '^\d{10,11}$'
    or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
    or char_length(v_notes) > 280
    or p_date is null
    or coalesce(p_time, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception using
      errcode = 'BC001',
      message = 'invalid_request',
      hint = 'Revise os dados do agendamento antes de confirmar.';
  end if;

  -- Telefone já cadastrado nesta loja não sobrescreve o nome (não há verificação por SMS);
  -- o e-mail só é preenchido se ainda estiver vazio.
  insert into public.customers as c (shop_id, name, phone, email, whatsapp_opt_in)
  values (v_shop, v_name, v_phone, v_email, v_opt_in)
  on conflict (shop_id, phone) do update
    set email = coalesce(c.email, excluded.email),
        whatsapp_opt_in = c.whatsapp_opt_in or excluded.whatsapp_opt_in
  returning c.id into v_customer_id;

  v_appointment_id := private.book_site_appointment(
    v_customer_id, v_service_ids, v_professional, p_date, p_time, p_assigned_professional, v_notes
  );

  -- A tela de confirmação mostra o que o cliente digitou.
  return private.reservation_json(v_appointment_id) || jsonb_build_object(
    'customer', jsonb_build_object(
      'name', v_name,
      'phone', private.format_phone(v_phone),
      'email', coalesce(v_email, ''),
      'notes', coalesce(v_notes, ''),
      'whatsappOptIn', v_opt_in
    ),
    'plan', null
  );
end;
$$;

-- Consulta e cancelamento continuam com a loja suspensa (modo 'read').
create function public.get_reservation(p_shop uuid, p_code text, p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_shop(p_shop, 'read');
  return (
    select private.reservation_json(a.id)
    from public.appointments a
    join public.customers c on c.id = a.customer_id
    where a.shop_id = p_shop
      and a.code = upper(btrim(p_code))
      and c.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  );
end;
$$;

create function public.cancel_reservation(p_shop uuid, p_code text, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.appointment_status;
  v_starts_at timestamptz;
  v_notice integer;
begin
  perform private.assert_shop(p_shop, 'read');

  select a.id, a.status, a.starts_at into v_id, v_status, v_starts_at
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.shop_id = p_shop
    and a.code = upper(btrim(p_code))
    and c.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
  for update of a;

  if v_id is null then
    raise exception using
      errcode = 'BC008',
      message = 'reservation_not_found',
      hint = 'Reserva não encontrada. Confira o código e o telefone.';
  end if;

  if v_status <> 'agendado' then
    raise exception using
      errcode = 'BC009',
      message = 'not_cancellable',
      hint = 'Esta reserva não pode mais ser cancelada pelo site.';
  end if;

  select cancel_min_notice_minutes into v_notice from public.shop_settings where shop_id = p_shop;

  if v_starts_at - now() < make_interval(mins => v_notice) then
    raise exception using
      errcode = 'BC007',
      message = 'cancel_too_late',
      hint = 'O prazo para cancelar pelo site já passou. Fale com a barbearia pelo WhatsApp.';
  end if;

  update public.appointments set status = 'cancelado' where id = v_id;

  return private.reservation_json(v_id);
end;
$$;

create function public.get_subscriber_session(p_shop uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_customer public.customers;
  v_plan_slug text;
  v_status text;
  v_active_id uuid;
begin
  perform private.assert_shop(p_shop, 'public');
  v_today := public.shop_today(p_shop);

  select * into v_customer from public.customers where user_id = (select auth.uid()) and shop_id = p_shop;
  if not found then
    return null;
  end if;

  select sp.slug into v_plan_slug
  from public.customer_subscriptions cs
  join public.subscription_plans sp on sp.id = cs.plan_id
  where cs.customer_id = v_customer.id
  order by cs.started_at desc, cs.created_at desc
  limit 1;

  if v_plan_slug is null then
    return null;
  end if;

  v_status := private.subscriber_status(v_customer.id, v_today);

  select cs.id into v_active_id
  from public.customer_subscriptions cs
  where cs.customer_id = v_customer.id
    and cs.status = 'ativa'
    and cs.started_at <= v_today
    and (cs.ended_at is null or cs.ended_at >= v_today)
  limit 1;

  return jsonb_build_object(
    'subscriberId', v_customer.id,
    'name', v_customer.name,
    'phone', private.format_phone(v_customer.phone),
    'planId', v_plan_slug,
    'status', v_status,
    'blockedReason', case
      when v_status <> 'ativo' then v_status
      when not private.subscription_in_good_standing(v_active_id, v_today) then 'pagamento_atrasado'
    end
  );
end;
$$;

create function public.get_plan_coverage(p_shop uuid, p_service text, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid;
  v_reason text;
  v_plan_id uuid;
  v_week_start date;
  v_week_end date;
begin
  perform private.assert_shop(p_shop, 'public');

  select id into v_customer_id from public.customers where user_id = (select auth.uid()) and shop_id = p_shop;
  if v_customer_id is null or p_date is null then
    return null;
  end if;

  select pc.reason, pc.plan_id, pc.week_start, pc.week_end
  into v_reason, v_plan_id, v_week_start, v_week_end
  from private.plan_coverage(
    v_customer_id,
    private.resolve_service(p_shop, p_service),
    public.shop_local_ts(p_shop, p_date, time '12:00')
  ) pc;

  return jsonb_build_object(
    'covered', v_reason = 'incluido',
    'reason', v_reason,
    'planId', (select slug from public.subscription_plans where id = v_plan_id),
    'weekStart', v_week_start,
    'weekEnd', v_week_end
  );
end;
$$;

create function public.create_subscriber_reservation(
  p_shop uuid,
  p_services text[],
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := private.assert_shop(p_shop, 'public');
  v_service_ids uuid[] := private.resolve_services(v_shop, p_services);
  v_professional text := private.check_professional(v_shop, p_professional);
  v_customer public.customers;
  v_appointment_id uuid;
  v_plan_id uuid;
  v_services jsonb;
  v_all_covered boolean;
begin
  select * into v_customer from public.customers where user_id = (select auth.uid()) and shop_id = v_shop;
  if not found then
    raise exception using
      errcode = 'BC011',
      message = 'subscriber_not_found',
      hint = 'Sua sessão de assinante terminou. Entre novamente para agendar.';
  end if;

  v_appointment_id := private.book_site_appointment(
    v_customer.id, v_service_ids, v_professional, p_date, p_time, p_assigned_professional, null
  );

  -- Prévia da cobertura de cada serviço (a liquidação ao concluir é que vale).
  select
    jsonb_agg(
      jsonb_build_object(
        'id', s.slug, 'name', i.service_name, 'price', i.price, 'durationMinutes', i.duration_minutes,
        'covered', pc.reason = 'incluido'
      )
      order by i.position
    ),
    bool_and(pc.reason = 'incluido'),
    max(pc.plan_id::text)::uuid
  into v_services, v_all_covered, v_plan_id
  from public.appointments a
  join public.appointment_services i on i.appointment_id = a.id
  join public.services s on s.id = i.service_id
  cross join lateral private.plan_coverage(a.customer_id, i.service_id, a.starts_at, a.id, a.created_at) pc
  where a.id = v_appointment_id;

  return private.reservation_json(v_appointment_id) || jsonb_build_object(
    'services', v_services,
    'customer', jsonb_build_object(
      'name', v_customer.name,
      'phone', private.format_phone(v_customer.phone),
      'email', coalesce(v_customer.email, ''),
      'notes', '',
      'whatsappOptIn', v_customer.whatsapp_opt_in
    ),
    'plan', (
      select jsonb_build_object('id', sp.slug, 'name', sp.name, 'covered', coalesce(v_all_covered, false))
      from public.subscription_plans sp
      where sp.id = v_plan_id
    )
  );
end;
$$;

create function public.save_subscriber(p_shop uuid, p_customer_id uuid, p_name text, p_phone text, p_user_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  if not private.can_manage_subscribers(p_shop) then
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só o administrador gerencia assinantes.';
  end if;

  if char_length(v_name) not between 2 and 120 or v_phone !~ '^\d{10,11}$' then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Revise os dados do assinante.';
  end if;

  -- O telefone é o login: não pode ser de outro assinante da loja (nem, na edição, de outro cliente).
  if exists (
    select 1
    from public.customers c
    where c.shop_id = p_shop
      and c.phone = v_phone
      and c.id is distinct from p_customer_id
      and (
        p_customer_id is not null
        or c.user_id is not null
        or exists (select 1 from public.customer_subscriptions cs where cs.customer_id = c.id)
      )
  ) then
    raise exception using errcode = 'BC010', message = 'phone_in_use', hint = 'Já existe um assinante com este telefone.';
  end if;

  if p_customer_id is null then
    insert into public.customers as c (shop_id, name, phone, user_id)
    values (p_shop, v_name, v_phone, p_user_id)
    on conflict (shop_id, phone) do update
      set name = excluded.name,
          user_id = coalesce(excluded.user_id, c.user_id)
    returning c.id into v_id;
  else
    update public.customers
    set name = v_name,
        phone = v_phone,
        user_id = coalesce(p_user_id, user_id)
    where id = p_customer_id and shop_id = p_shop
    returning id into v_id;

    if v_id is null then
      raise exception using errcode = 'BC011', message = 'subscriber_not_found', hint = 'Assinante não encontrado.';
    end if;
  end if;

  return v_id;
end;
$$;

create function public.set_subscription(p_shop uuid, p_customer_id uuid, p_plan text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  if not private.can_manage_subscribers(p_shop) then
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só o administrador gerencia assinantes.';
  end if;

  -- Plano ativo, ou o plano do período em aberto do cliente (mesmo que tenha sido inativado
  -- depois): assim dá para congelar ou reativar quem já está nele. Excluído, nunca.
  select sp.id into v_plan_id
  from public.subscription_plans sp
  where sp.shop_id = p_shop
    and sp.slug = p_plan
    and sp.deleted_at is null
    and (
      sp.is_active
      or exists (
        select 1 from public.customer_subscriptions cs
        where cs.customer_id = p_customer_id and cs.plan_id = sp.id and cs.ended_at is null
      )
    );

  if v_plan_id is null or coalesce(p_status, '') not in ('ativo', 'congelado', 'inativo') then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Plano ou situação inválidos.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id and shop_id = p_shop) then
    raise exception using errcode = 'BC011', message = 'subscriber_not_found', hint = 'Assinante não encontrado.';
  end if;

  perform private.apply_subscription(p_customer_id, v_plan_id, p_status);
end;
$$;

-- --- RPCs da equipe: a loja vem de quem está logado ---

create or replace function public.get_team_agenda(p_start date, p_end date, p_id uuid default null)
returns table (
  id uuid,
  code text,
  status public.appointment_status,
  local_date date,
  local_time text,
  starts_at timestamptz,
  duration_minutes integer,
  customer_name text,
  items jsonb,
  booked_professional_id uuid,
  booked_professional_name text,
  performed_by_id uuid,
  performed_by_name text,
  requested_any_professional boolean,
  plan_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_shop uuid := private.staff_shop_id();
  v_tz text;
begin
  if v_shop is null then
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só a equipe vê a agenda.';
  end if;

  if p_id is null and (p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366) then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Intervalo de datas inválido.';
  end if;

  v_tz := public.shop_timezone(v_shop);

  return query
  select
    a.id,
    a.code,
    a.status,
    (a.starts_at at time zone v_tz)::date,
    to_char(a.starts_at at time zone v_tz, 'HH24:MI'),
    a.starts_at,
    (extract(epoch from a.ends_at - a.starts_at) / 60)::integer,
    c.name,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'service_id', i.service_id,
            'service_slug', s.slug,
            'service_name', i.service_name,
            'duration_minutes', i.duration_minutes
          )
          order by i.position
        )
        from public.appointment_services i
        join public.services s on s.id = i.service_id
        where i.appointment_id = a.id
      ),
      '[]'::jsonb
    ),
    a.booked_professional_id,
    bp.name,
    a.performed_by_id,
    pp.name,
    a.requested_any_professional,
    case
      when private.membership_status(a.customer_id, (a.starts_at at time zone v_tz)::date) in ('ativo', 'pendente')
        then sub.plan_name
    end
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  join public.professionals bp on bp.id = a.booked_professional_id
  join public.professionals pp on pp.id = a.performed_by_id
  left join lateral (
    select sp.name as plan_name
    from public.customer_subscriptions cs
    join public.subscription_plans sp on sp.id = cs.plan_id
    where cs.customer_id = a.customer_id
      and cs.status <> 'cancelada'
      and cs.started_at <= (a.starts_at at time zone v_tz)::date
      and (cs.ended_at is null or cs.ended_at >= (a.starts_at at time zone v_tz)::date)
    limit 1
  ) sub on true
  where a.shop_id = v_shop
    and case
      when p_id is not null then a.id = p_id
      else a.starts_at >= public.shop_local_ts(v_shop, p_start, time '00:00')
        and a.starts_at < public.shop_local_ts(v_shop, p_end + 1, time '00:00')
    end
  order by a.starts_at;
end;
$$;

create or replace function public.update_team_appointment(
  p_id uuid,
  p_status public.appointment_status default null,
  p_performed_by uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid := private.staff_write_shop_id();
  v_professional uuid := private.current_professional_id();
  v_booked uuid;
  v_performer uuid;
begin
  if v_shop is null then
    if private.staff_shop_id() is not null then
      raise exception using
        errcode = 'BC016',
        message = 'shop_unavailable',
        hint = 'A barbearia está suspensa: o painel está só para consulta.';
    end if;
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só a equipe altera a agenda.';
  end if;

  select a.booked_professional_id, a.performed_by_id into v_booked, v_performer
  from public.appointments a
  where a.id = p_id and a.shop_id = v_shop
  for update;

  if not found then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Atendimento não encontrado.';
  end if;

  if not private.is_admin()
    and v_professional is distinct from v_booked
    and v_professional is distinct from v_performer then
    raise exception using
      errcode = '42501',
      message = 'not_allowed',
      hint = 'Você só pode alterar os seus próprios horários.';
  end if;

  if p_performed_by is not null
    and not exists (select 1 from public.professionals p where p.id = p_performed_by and p.shop_id = v_shop) then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Profissional inexistente.';
  end if;

  update public.appointments
  set status = coalesce(p_status, status),
      performed_by_id = coalesce(p_performed_by, performed_by_id)
  where id = p_id;
end;
$$;

-- --- Assinaturas antigas: wrappers fixos na Black Crown (removidos na etapa 5) ---

create or replace function public.get_day_availability(p_services text[], p_professional text, p_date date)
returns table (slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.get_day_availability(private.legacy_shop_id(), p_services, p_professional, p_date);
$$;

create or replace function public.get_day_summaries(p_services text[], p_professional text, p_start date, p_days integer)
returns table (day date, status text, available_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.get_day_summaries(private.legacy_shop_id(), p_services, p_professional, p_start, p_days);
$$;

create or replace function public.find_next_available(p_services text[], p_professional text, p_from date)
returns table (day date, slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.find_next_available(private.legacy_shop_id(), p_services, p_professional, p_from);
$$;

create or replace function public.create_reservation(
  p_services text[],
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null,
  p_whatsapp_opt_in boolean default false
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.create_reservation(
    private.legacy_shop_id(), p_services, p_professional, p_date, p_time, p_assigned_professional,
    p_name, p_phone, p_email, p_notes, p_whatsapp_opt_in
  );
$$;

create or replace function public.get_reservation(p_code text, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_reservation(private.legacy_shop_id(), p_code, p_phone);
$$;

create or replace function public.cancel_reservation(p_code text, p_phone text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.cancel_reservation(private.legacy_shop_id(), p_code, p_phone);
$$;

create or replace function public.get_subscriber_session()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_subscriber_session(private.legacy_shop_id());
$$;

create or replace function public.get_plan_coverage(p_service text, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_plan_coverage(private.legacy_shop_id(), p_service, p_date);
$$;

create or replace function public.create_subscriber_reservation(
  p_services text[],
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.create_subscriber_reservation(
    private.legacy_shop_id(), p_services, p_professional, p_date, p_time, p_assigned_professional
  );
$$;

create or replace function public.save_subscriber(p_customer_id uuid, p_name text, p_phone text, p_user_id uuid default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.save_subscriber(private.legacy_shop_id(), p_customer_id, p_name, p_phone, p_user_id);
$$;

create or replace function public.set_subscription(p_customer_id uuid, p_plan text, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.set_subscription(private.legacy_shop_id(), p_customer_id, p_plan, p_status);
$$;

-- --- Views do painel: fuso e "hoje" da loja de cada linha ---

create or replace view public.appointment_details
with (security_invoker = true)
as
select
  a.id,
  a.code,
  a.status,
  a.source,
  a.starts_at,
  a.ends_at,
  (a.starts_at at time zone ss.timezone)::date as local_date,
  to_char(a.starts_at at time zone ss.timezone, 'HH24:MI') as local_time,
  a.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  a.service_id,
  s.slug as service_slug,
  a.service_name,
  a.booked_professional_id,
  bp.slug as booked_professional_slug,
  bp.name as booked_professional_name,
  a.performed_by_id,
  pp.slug as performed_by_slug,
  pp.name as performed_by_name,
  a.requested_any_professional,
  a.price,
  a.customer_notes,
  sub.plan_id as live_plan_id,
  sub.plan_name as live_plan_name,
  coalesce(items.all_covered_live, false) as covered_live,
  a.covered_by_plan,
  a.subscription_id,
  a.charged_amount,
  a.payout_amount,
  a.cancelled_at,
  a.created_at,
  a.updated_at,
  private.membership_status(a.customer_id, (a.starts_at at time zone ss.timezone)::date) as membership_status,
  items.service_ids,
  items.list as items,
  a.shop_id
from public.appointments a
join public.shop_settings ss on ss.shop_id = a.shop_id
join public.customers c on c.id = a.customer_id
join public.services s on s.id = a.service_id
join public.professionals bp on bp.id = a.booked_professional_id
join public.professionals pp on pp.id = a.performed_by_id
left join lateral (
  select sp.id as plan_id, sp.name as plan_name
  from public.customer_subscriptions cs
  join public.subscription_plans sp on sp.id = cs.plan_id
  where cs.customer_id = a.customer_id
    and cs.status <> 'cancelada'
    and cs.started_at <= (a.starts_at at time zone ss.timezone)::date
    and (cs.ended_at is null or cs.ended_at >= (a.starts_at at time zone ss.timezone)::date)
  limit 1
) sub on true
left join lateral (
  select
    array_agg(i.service_id order by i.position) as service_ids,
    bool_and(live.covered) as all_covered_live,
    jsonb_agg(
      jsonb_build_object(
        'service_id', i.service_id,
        'service_slug', si.slug,
        'service_name', i.service_name,
        'price', i.price,
        'duration_minutes', i.duration_minutes,
        'covered_live', live.covered,
        'covered_by_plan', i.covered_by_plan,
        'charged_amount', i.charged_amount,
        'payout_amount', i.payout_amount
      )
      order by i.position
    ) as list
  from public.appointment_services i
  join public.services si on si.id = i.service_id
  cross join lateral (
    select (
      select pc.subscription_id
      from private.plan_coverage(a.customer_id, i.service_id, a.starts_at, a.id, a.created_at) pc
    ) is not null as covered
  ) live
  where i.appointment_id = a.id
) items on true;

create or replace view public.customer_profiles
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.phone,
  c.email,
  c.whatsapp_opt_in,
  c.whatsapp_opt_in_at,
  c.created_at,
  private.membership_status(c.id, t.today) as membership_status,
  cur.subscription_id,
  cur.plan_id,
  cur.plan_slug,
  cur.plan_name,
  cur.monthly_price,
  cur.started_at as subscribed_since,
  last_sub.ended_at as last_subscription_ended_at,
  coalesce(open.open_amount, 0) as open_amount,
  coalesce(open.open_count, 0) as open_count,
  open.oldest_due_date,
  case when open.oldest_due_date is not null then t.today - open.oldest_due_date end as days_overdue,
  last_pay.paid_at as last_paid_at,
  last_pay.method as last_payment_method,
  last_pay.amount as last_payment_amount,
  visits.last_visit_at,
  coalesce(visits.visit_count, 0) as visit_count,
  c.shop_id
from public.customers c
join public.shop_settings ss on ss.shop_id = c.shop_id
cross join lateral (select (now() at time zone ss.timezone)::date as today) t
left join lateral (
  select cs.id as subscription_id, cs.started_at, sp.id as plan_id, sp.slug as plan_slug, sp.name as plan_name, sp.monthly_price
  from public.customer_subscriptions cs
  join public.subscription_plans sp on sp.id = cs.plan_id
  where cs.customer_id = c.id
    and cs.status <> 'cancelada'
    and cs.started_at <= t.today
    and (cs.ended_at is null or cs.ended_at >= t.today)
  limit 1
) cur on true
left join lateral (
  select max(cs.ended_at) as ended_at
  from public.customer_subscriptions cs
  where cs.customer_id = c.id and cs.ended_at is not null
) last_sub on true
left join lateral (
  select sum(p.amount) as open_amount, count(*)::integer as open_count, min(p.due_date) as oldest_due_date
  from public.subscription_payments p
  join public.customer_subscriptions cs on cs.id = p.subscription_id
  where cs.customer_id = c.id and p.status = 'pendente' and p.due_date <= t.today
) open on true
left join lateral (
  select p.paid_at, p.method, p.amount
  from public.subscription_payments p
  join public.customer_subscriptions cs on cs.id = p.subscription_id
  where cs.customer_id = c.id and p.status = 'pago'
  order by p.paid_at desc
  limit 1
) last_pay on true
left join lateral (
  select max(a.starts_at) as last_visit_at, count(*)::integer as visit_count
  from public.appointments a
  where a.customer_id = c.id and a.status = 'concluido'
) visits on true;

create or replace view public.subscriber_accounts
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.phone,
  sp.slug as plan_slug,
  sp.name as plan_name,
  private.subscriber_status(c.id, (now() at time zone ss.timezone)::date) as status,
  first_sub.started_at as subscribed_since,
  c.shop_id
from public.customers c
join public.shop_settings ss on ss.shop_id = c.shop_id
join lateral (
  select cs.plan_id
  from public.customer_subscriptions cs
  where cs.customer_id = c.id
  order by cs.started_at desc, cs.created_at desc
  limit 1
) last_sub on true
join public.subscription_plans sp on sp.id = last_sub.plan_id
cross join lateral (
  select min(cs.started_at) as started_at
  from public.customer_subscriptions cs
  where cs.customer_id = c.id
) first_sub;

-- --- RLS: a loja soma-se às regras de papel que já existiam ---
-- Onde era is_admin() passa a ser a loja do admin; onde era is_staff(), a loja da equipe.
-- Leitura usa *_shop_id() (ativa ou suspensa); escrita, *_write_shop_id() (só ativa).

-- Só admin (agenda, clientes, assinaturas, cobrança, repasses).
alter policy appointments_select on public.appointments using (shop_id = (select private.admin_shop_id()));
alter policy appointments_insert on public.appointments with check (shop_id = (select private.admin_write_shop_id()));
alter policy appointments_update on public.appointments
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy appointments_delete on public.appointments using (shop_id = (select private.admin_write_shop_id()));

alter policy appointment_services_select on public.appointment_services using (shop_id = (select private.admin_shop_id()));

alter policy customers_select on public.customers using (shop_id = (select private.admin_shop_id()));
alter policy customers_admin_insert on public.customers with check (shop_id = (select private.admin_write_shop_id()));
alter policy customers_admin_update on public.customers
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy customers_admin_delete on public.customers using (shop_id = (select private.admin_write_shop_id()));

alter policy customer_subscriptions_select on public.customer_subscriptions using (shop_id = (select private.admin_shop_id()));
alter policy customer_subscriptions_admin_insert on public.customer_subscriptions with check (shop_id = (select private.admin_write_shop_id()));
alter policy customer_subscriptions_admin_update on public.customer_subscriptions
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy customer_subscriptions_admin_delete on public.customer_subscriptions using (shop_id = (select private.admin_write_shop_id()));

alter policy subscription_payments_select on public.subscription_payments using (shop_id = (select private.admin_shop_id()));
alter policy subscription_payments_admin_insert on public.subscription_payments with check (shop_id = (select private.admin_write_shop_id()));
alter policy subscription_payments_admin_update on public.subscription_payments
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy subscription_payments_admin_delete on public.subscription_payments using (shop_id = (select private.admin_write_shop_id()));

alter policy payroll_settings_select on public.payroll_settings using (shop_id = (select private.admin_shop_id()));
alter policy payroll_settings_admin_insert on public.payroll_settings with check (shop_id = (select private.admin_write_shop_id()));
alter policy payroll_settings_admin_update on public.payroll_settings
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy payroll_settings_admin_delete on public.payroll_settings using (shop_id = (select private.admin_write_shop_id()));

alter policy service_payouts_select on public.service_payouts using (shop_id = (select private.admin_shop_id()));
alter policy service_payouts_admin_insert on public.service_payouts with check (shop_id = (select private.admin_write_shop_id()));
alter policy service_payouts_admin_update on public.service_payouts
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy service_payouts_admin_delete on public.service_payouts using (shop_id = (select private.admin_write_shop_id()));

-- Configuração da loja: só a equipe da própria loja lê (o site usa get_shop_profile).
alter policy shop_settings_select on public.shop_settings to authenticated using (shop_id = (select private.staff_shop_id()));
alter policy shop_settings_admin_insert on public.shop_settings with check (shop_id = (select private.admin_write_shop_id()));
alter policy shop_settings_admin_update on public.shop_settings
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy shop_settings_admin_delete on public.shop_settings using (shop_id = (select private.admin_write_shop_id()));
revoke select on public.shop_settings from anon;

-- Equipe: cada um vê o próprio acesso; o admin, os da loja.
alter policy staff_members_select on public.staff_members
  using (user_id = (select auth.uid()) or shop_id = (select private.admin_shop_id()));
alter policy staff_members_admin_insert on public.staff_members with check (shop_id = (select private.admin_write_shop_id()));
alter policy staff_members_admin_update on public.staff_members
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy staff_members_admin_delete on public.staff_members using (shop_id = (select private.admin_write_shop_id()));

-- Catálogo: o anônimo continua vendo o que é público (políticas *_anon intactas). Logado:
-- a equipe vê só a própria loja (inclusive inativos); os demais, o mesmo que o anônimo.
alter policy services_select on public.services
  using (case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id()) else is_active end);
alter policy services_admin_insert on public.services with check (shop_id = (select private.admin_write_shop_id()));
alter policy services_admin_update on public.services
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy services_admin_delete on public.services using (shop_id = (select private.admin_write_shop_id()));

alter policy professionals_select on public.professionals
  using (case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id()) else is_active end);
alter policy professionals_admin_insert on public.professionals with check (shop_id = (select private.admin_write_shop_id()));
alter policy professionals_admin_update on public.professionals
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy professionals_admin_delete on public.professionals using (shop_id = (select private.admin_write_shop_id()));

-- Planos inativos (não excluídos) continuam visíveis: assinantes antigos ainda os usam.
alter policy subscription_plans_select on public.subscription_plans
  using (case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id()) else deleted_at is null end);
alter policy subscription_plans_admin_insert on public.subscription_plans with check (shop_id = (select private.admin_write_shop_id()));
alter policy subscription_plans_admin_update on public.subscription_plans
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy subscription_plans_admin_delete on public.subscription_plans using (shop_id = (select private.admin_write_shop_id()));

alter policy plan_services_select on public.plan_services
  using (
    case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id())
    else exists (select 1 from public.subscription_plans sp where sp.id = plan_services.plan_id and sp.deleted_at is null)
    end
  );
alter policy plan_services_admin_insert on public.plan_services with check (shop_id = (select private.admin_write_shop_id()));
alter policy plan_services_admin_update on public.plan_services
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy plan_services_admin_delete on public.plan_services using (shop_id = (select private.admin_write_shop_id()));

alter policy professional_services_select on public.professional_services
  using (
    case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id())
    else exists (select 1 from public.professionals p where p.id = professional_services.professional_id and p.is_active)
      and exists (select 1 from public.services s where s.id = professional_services.service_id and s.is_active)
    end
  );
alter policy professional_services_admin_insert on public.professional_services with check (shop_id = (select private.admin_write_shop_id()));
alter policy professional_services_admin_update on public.professional_services
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));
alter policy professional_services_admin_delete on public.professional_services using (shop_id = (select private.admin_write_shop_id()));

-- Políticas que valiam para anon e authenticated juntos: a original fica só para anon e
-- authenticated ganha a sua, com a loja da equipe.
alter policy service_components_select on public.service_components to anon;
create policy service_components_select_authenticated on public.service_components
  for select to authenticated
  using (case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id()) else true end);
alter policy service_components_admin_insert on public.service_components with check (shop_id = (select private.admin_write_shop_id()));
alter policy service_components_admin_delete on public.service_components using (shop_id = (select private.admin_write_shop_id()));

alter policy site_images_select on public.site_images to anon;
create policy site_images_select_authenticated on public.site_images
  for select to authenticated
  using (case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id()) else true end);
alter policy site_images_admin_update on public.site_images
  using (shop_id = (select private.admin_write_shop_id()))
  with check (shop_id = (select private.admin_write_shop_id()));

alter policy opening_periods_select on public.opening_periods to anon;
alter policy opening_periods_select_staff on public.opening_periods
  using (case when (select private.staff_shop_id()) is not null then shop_id = (select private.staff_shop_id()) else professional_id is null end);

-- Agenda da equipe: o admin edita tudo da loja; o barbeiro, só o próprio.
alter policy opening_periods_editor_insert on public.opening_periods
  with check (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  );
alter policy opening_periods_editor_update on public.opening_periods
  using (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  )
  with check (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  );
alter policy opening_periods_editor_delete on public.opening_periods
  using (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  );

alter policy schedule_exceptions_select on public.schedule_exceptions using (shop_id = (select private.staff_shop_id()));
alter policy schedule_exceptions_editor_insert on public.schedule_exceptions
  with check (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  );
alter policy schedule_exceptions_editor_update on public.schedule_exceptions
  using (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  )
  with check (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  );
alter policy schedule_exceptions_editor_delete on public.schedule_exceptions
  using (
    shop_id = (select private.admin_write_shop_id())
    or (
      shop_id = (select private.staff_write_shop_id())
      and professional_id is not null
      and professional_id = (select private.current_professional_id())
    )
  );

alter policy schedule_blocks_select on public.schedule_blocks using (shop_id = (select private.staff_shop_id()));
alter policy schedule_blocks_insert on public.schedule_blocks
  with check (
    shop_id = (select private.admin_write_shop_id())
    or (shop_id = (select private.staff_write_shop_id()) and professional_id = (select private.current_professional_id()))
  );
alter policy schedule_blocks_update on public.schedule_blocks
  using (
    shop_id = (select private.admin_write_shop_id())
    or (shop_id = (select private.staff_write_shop_id()) and professional_id = (select private.current_professional_id()))
  )
  with check (
    shop_id = (select private.admin_write_shop_id())
    or (shop_id = (select private.staff_write_shop_id()) and professional_id = (select private.current_professional_id()))
  );
alter policy schedule_blocks_delete on public.schedule_blocks
  using (
    shop_id = (select private.admin_write_shop_id())
    or (shop_id = (select private.staff_write_shop_id()) and professional_id = (select private.current_professional_id()))
  );

-- --- Storage: <shop_id>/<pasta>/<arquivo>. Caminhos antigos só para a Black Crown (até a etapa 5) ---

alter policy site_media_admin_select on storage.objects
  using (
    bucket_id = 'site-media'
    and (
      (
        (storage.foldername(name))[1] = (select private.admin_shop_id())::text
        and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
      )
      or (
        (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
        and (select private.admin_shop_id()) = private.legacy_shop_id()
      )
    )
  );

alter policy site_media_admin_insert on storage.objects
  with check (
    bucket_id = 'site-media'
    and (
      (
        (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
        and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
      )
      or (
        (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
        and (select private.admin_write_shop_id()) = private.legacy_shop_id()
      )
    )
  );

alter policy site_media_admin_update on storage.objects
  using (
    bucket_id = 'site-media'
    and (
      (
        (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
        and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
      )
      or (
        (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
        and (select private.admin_write_shop_id()) = private.legacy_shop_id()
      )
    )
  )
  with check (
    bucket_id = 'site-media'
    and (
      (
        (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
        and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
      )
      or (
        (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
        and (select private.admin_write_shop_id()) = private.legacy_shop_id()
      )
    )
  );

alter policy site_media_admin_delete on storage.objects
  using (
    bucket_id = 'site-media'
    and (
      (
        (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
        and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
      )
      or (
        (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
        and (select private.admin_write_shop_id()) = private.legacy_shop_id()
      )
    )
  );

-- --- Permissões ---
-- Funções novas no schema public recebem EXECUTE de todos por padrão: revoga e concede
-- papel a papel. No schema private, só o que as policies e as views chamam.

revoke all on function
  public.shop_timezone(uuid),
  public.shop_now(uuid),
  public.shop_today(uuid),
  public.shop_local_ts(uuid, date, time),
  public.shop_local_date(uuid, timestamptz),
  public.resolve_shop_host(text),
  public.resolve_shop_slug(text),
  public.get_shop_profile(uuid),
  public.staff_context(),
  public.get_day_availability(uuid, text[], text, date),
  public.get_day_summaries(uuid, text[], text, date, integer),
  public.find_next_available(uuid, text[], text, date),
  public.create_reservation(uuid, text[], text, date, text, text, text, text, text, text, boolean),
  public.get_reservation(uuid, text, text),
  public.cancel_reservation(uuid, text, text),
  public.get_subscriber_session(uuid),
  public.get_plan_coverage(uuid, text, date),
  public.create_subscriber_reservation(uuid, text[], text, date, text, text),
  public.save_subscriber(uuid, uuid, text, text, uuid),
  public.set_subscription(uuid, uuid, text, text)
from public, anon, authenticated;

grant execute on function
  public.resolve_shop_host(text),
  public.resolve_shop_slug(text),
  public.get_shop_profile(uuid),
  public.get_day_availability(uuid, text[], text, date),
  public.get_day_summaries(uuid, text[], text, date, integer),
  public.find_next_available(uuid, text[], text, date),
  public.create_reservation(uuid, text[], text, date, text, text, text, text, text, text, boolean),
  public.get_reservation(uuid, text, text),
  public.cancel_reservation(uuid, text, text)
to anon, authenticated;

grant execute on function
  public.shop_timezone(uuid),
  public.shop_now(uuid),
  public.shop_today(uuid),
  public.shop_local_ts(uuid, date, time),
  public.shop_local_date(uuid, timestamptz),
  public.staff_context(),
  public.get_subscriber_session(uuid),
  public.get_plan_coverage(uuid, text, date),
  public.create_subscriber_reservation(uuid, text[], text, date, text, text),
  public.save_subscriber(uuid, uuid, text, text, uuid),
  public.set_subscription(uuid, uuid, text, text)
to authenticated;

grant execute on function
  public.save_subscriber(uuid, uuid, text, text, uuid),
  public.set_subscription(uuid, uuid, text, text)
to service_role;

revoke execute on all functions in schema private from public, anon, authenticated;

grant usage on schema private to service_role;

grant execute on function
  private.legacy_shop_id(),
  private.default_shop_id(),
  private.staff_shop_id(),
  private.staff_write_shop_id(),
  private.admin_shop_id(),
  private.admin_write_shop_id(),
  private.customer_shop_id(),
  private.current_professional_id(),
  private.is_admin(),
  private.is_staff(),
  private.membership_status(uuid, date),
  private.plan_coverage(uuid, uuid, timestamptz, uuid, timestamptz),
  private.subscriber_status(uuid, date),
  private.subscription_covering(uuid, uuid, date),
  private.subscription_in_good_standing(uuid, date)
to authenticated;

grant execute on function
  private.legacy_shop_id(),
  private.default_shop_id(),
  private.staff_shop_id(),
  private.current_professional_id(),
  private.is_admin(),
  private.is_staff()
to service_role;

-- --- Cron: rodadas curtas entre 03:00 e 04:45 de Brasília (pg_cron usa UTC) ---

select cron.schedule('generate-subscription-payments', '0,15,30,45 6-7 * * *', 'select private.generate_subscription_payments()');
select cron.schedule('purge-expired-history', '5,20,35,50 6-7 * * *', 'select private.purge_expired_history()');

-- --- Conferência final: nada mudou de valor e tudo ficou na Black Crown ---

do $$
declare
  v_diff text;
begin
  select string_agg(b.t || ' ' || b.n || '/' || a.n || ' ' || b.s || '/' || a.s, ', ')
  into v_diff
  from mt_baseline b
  join (
    select 'appointments' as t, count(*) as n, coalesce(sum(price), 0) + coalesce(sum(charged_amount), 0) + coalesce(sum(payout_amount), 0) as s from public.appointments
    union all select 'appointment_services', count(*), coalesce(sum(price), 0) + coalesce(sum(charged_amount), 0) + coalesce(sum(payout_amount), 0) from public.appointment_services
    union all select 'subscription_payments', count(*), coalesce(sum(amount), 0) from public.subscription_payments
    union all select 'customer_subscriptions', count(*), 0 from public.customer_subscriptions
    union all select 'customers', count(*), 0 from public.customers
    union all select 'staff_members', count(*), 0 from public.staff_members
    union all select 'services', count(*), coalesce(sum(price), 0) from public.services
    union all select 'service_payouts', count(*), coalesce(sum(plan_payout_amount), 0) from public.service_payouts
    union all select 'service_components', count(*), 0 from public.service_components
    union all select 'professionals', count(*), 0 from public.professionals
    union all select 'professional_services', count(*), 0 from public.professional_services
    union all select 'subscription_plans', count(*), coalesce(sum(monthly_price), 0) from public.subscription_plans
    union all select 'plan_services', count(*), 0 from public.plan_services
    union all select 'opening_periods', count(*), 0 from public.opening_periods
    union all select 'schedule_exceptions', count(*), 0 from public.schedule_exceptions
    union all select 'schedule_blocks', count(*), 0 from public.schedule_blocks
    union all select 'site_images', count(*), 0 from public.site_images
    union all select 'shop_settings', count(*), 0 from public.shop_settings
    union all select 'payroll_settings', count(*), coalesce(sum(walk_in_commission_rate), 0) from public.payroll_settings
  ) a using (t)
  where a.n <> b.n or a.s <> b.s;

  if v_diff is not null then
    raise exception 'multi_tenant_expand: dados mudaram durante a migração: %', v_diff;
  end if;

  if exists (select 1 from public.shops where id <> private.legacy_shop_id()) then
    raise exception 'multi_tenant_expand: só a Black Crown deveria existir nesta etapa';
  end if;
end;
$$;

commit;
