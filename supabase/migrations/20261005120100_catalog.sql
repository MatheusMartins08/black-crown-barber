-- Catálogo da barbearia: configuração, expediente, serviços, profissionais e planos.
-- Espelha app/data/site.ts e app/data/booking.ts. Dados de repasse ficam em tabelas
-- separadas (payroll_settings, service_payouts), visíveis só para a equipe.

create table public.shop_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null,
  description text,
  address text,
  city text,
  phone text,
  whatsapp text,
  instagram text,
  timezone text not null default 'America/Sao_Paulo',
  booking_window_days integer not null default 21 check (booking_window_days between 1 and 365),
  slot_interval_minutes integer not null default 30 check (slot_interval_minutes between 5 and 240),
  min_lead_minutes integer not null default 60 check (min_lead_minutes >= 0),
  -- Regra nova (o FAQ fala em remarcar pelo WhatsApp): antecedência mínima para o
  -- cliente cancelar pelo site. O painel cancela sem essa restrição.
  cancel_min_notice_minutes integer not null default 120 check (cancel_min_notice_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.shop_settings
  for each row execute function public.set_updated_at();

create table public.payroll_settings (
  id smallint primary key default 1 check (id = 1),
  -- Fração do preço repassada ao profissional em atendimentos fora do plano.
  walk_in_commission_rate numeric(5, 4) not null default 0.5 check (walk_in_commission_rate between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.payroll_settings
  for each row execute function public.set_updated_at();

-- 0 = domingo, como Date.getUTCDay() e extract(dow). Horários nulos = fechado.
create table public.opening_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  check ((opens_at is null) = (closes_at is null)),
  check (opens_at < closes_at)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(10, 2) not null check (price >= 0),
  icon text,
  is_popular boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.services
  for each row execute function public.set_updated_at();

-- Valor fixo repassado ao profissional quando o atendimento é coberto por plano.
create table public.service_payouts (
  service_id uuid primary key references public.services (id) on delete cascade,
  plan_payout_amount numeric(10, 2) not null default 0 check (plan_payout_amount >= 0),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.service_payouts
  for each row execute function public.set_updated_at();

create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  -- "qualquer" é reservado para a escolha "qualquer profissional" do agendamento.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug <> 'qualquer'),
  name text not null,
  specialty text,
  description text,
  image_url text,
  image_alt text,
  image_position text,
  -- Profissionais são desativados, não apagados: o histórico de atendimentos aponta para eles.
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.professionals
  for each row execute function public.set_updated_at();

create table public.professional_services (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (professional_id, service_id)
);

create index professional_services_service_id_idx on public.professional_services (service_id);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  monthly_price numeric(10, 2) not null check (monthly_price >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.subscription_plans
  for each row execute function public.set_updated_at();

-- Serviços cobertos por cada plano.
create table public.plan_services (
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  primary key (plan_id, service_id)
);

create index plan_services_service_id_idx on public.plan_services (service_id);
