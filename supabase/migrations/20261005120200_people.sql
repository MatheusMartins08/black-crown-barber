-- Equipe, clientes e assinaturas, mais os helpers de fuso e de papel usados nas
-- políticas, triggers e RPCs.

-- btree_gist vive no schema "extensions" no Supabase; a exclusão abaixo precisa dele.
set search_path = public, extensions;

-- --- Fuso da barbearia ---
-- A sessão do Supabase roda em UTC; "hoje" e os horários locais sempre saem daqui.

create function public.shop_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select timezone from public.shop_settings where id = 1), 'America/Sao_Paulo');
$$;

create function public.shop_now()
returns timestamp
language sql
stable
security definer
set search_path = ''
as $$
  select now() at time zone public.shop_timezone();
$$;

create function public.shop_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone public.shop_timezone())::date;
$$;

-- Data + hora locais da barbearia -> instante absoluto.
create function public.shop_local_ts(p_date date, p_time time)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (p_date + p_time) at time zone public.shop_timezone();
$$;

create function public.shop_local_date(p_ts timestamptz)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (p_ts at time zone public.shop_timezone())::date;
$$;

-- --- Equipe ---

create table public.staff_members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null,
  professional_id uuid unique references public.professionals (id) on delete set null,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Barbeiro sempre ligado a um profissional. Com o "set null" acima, apagar um
  -- profissional com login de barbeiro falha até o login ser desvinculado.
  check (role <> 'barbeiro' or professional_id is not null)
);

create trigger set_updated_at before update on public.staff_members
  for each row execute function public.set_updated_at();

-- Lidas pelas políticas RLS. São security definer para consultar staff_members
-- sem cair na própria RLS da tabela (recursão).
create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_members where user_id = (select auth.uid()));
$$;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members where user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create function public.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select professional_id from public.staff_members where user_id = (select auth.uid());
$$;

-- --- Clientes ---

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  -- Identidade do cliente no agendamento sem login. Só dígitos, com DDD.
  phone text not null unique check (phone ~ '^\d{10,11}$'),
  email text check (email ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  -- Reservado para uma futura área do cliente.
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- --- Assinaturas ---

create table public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id) on delete restrict,
  status public.subscription_status not null default 'ativa',
  started_at date not null default public.shop_today(),
  -- Último dia coberto (inclusive). Nulo só enquanto ativa. Ao trocar de plano,
  -- encerre a anterior na véspera do início da nova.
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'ativa') = (ended_at is null)),
  check (ended_at >= started_at),
  -- Um cliente nunca tem dois períodos de assinatura sobrepostos; por consequência,
  -- no máximo uma ativa.
  constraint customer_subscriptions_no_overlap exclude using gist (
    customer_id with =,
    daterange(started_at, ended_at, '[]') with &&
  )
);

create index customer_subscriptions_plan_id_idx on public.customer_subscriptions (plan_id);

create trigger set_updated_at before update on public.customer_subscriptions
  for each row execute function public.set_updated_at();
