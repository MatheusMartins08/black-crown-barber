-- Agenda: bloqueios de horário, agendamentos, triggers de validação e liquidação,
-- e a view usada pelo painel.

set search_path = public, extensions;

-- Folgas, almoço e bloqueios manuais. Intervalo [starts_at, ends_at).
create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (char_length(reason) <= 200),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index schedule_blocks_professional_starts_idx on public.schedule_blocks (professional_id, starts_at);
create index schedule_blocks_created_by_idx on public.schedule_blocks (created_by);

create trigger set_updated_at before update on public.schedule_blocks
  for each row execute function public.set_updated_at();

-- Mesmo alfabeto de booking-api.ts: sem I, O, 0 e 1.
create function public.generate_reservation_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'BC-';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * 32)::integer, 1);
    end loop;
    exit when not exists (select 1 from public.appointments where code = v_code);
  end loop;
  return v_code;
end;
$$;

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_reservation_code()
    check (code ~ '^BC-[A-HJ-NP-Z2-9]{6}$'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  -- Com quem o cliente marcou (bookedWith) e quem atende de fato (performedBy).
  -- performed_by_id nasce igual ao booked e é quem trava a agenda e recebe o repasse.
  booked_professional_id uuid not null references public.professionals (id) on delete restrict,
  performed_by_id uuid not null references public.professionals (id) on delete restrict,
  requested_any_professional boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'agendado',
  source public.appointment_source not null default 'painel',
  -- Cópia do preço do serviço no momento da reserva.
  price numeric(10, 2) not null check (price >= 0),
  customer_notes text check (char_length(customer_notes) <= 280),
  -- Snapshot gravado ao concluir; é o que o fechamento usa.
  covered_by_plan boolean,
  subscription_id uuid references public.customer_subscriptions (id) on delete restrict,
  charged_amount numeric(10, 2) check (charged_amount >= 0),
  payout_amount numeric(10, 2) check (payout_amount >= 0),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check ((status = 'cancelado') = (cancelled_at is not null)),
  check ((status = 'concluido') = (covered_by_plan is not null and charged_amount is not null and payout_amount is not null)),
  -- O mesmo profissional não executa dois atendimentos sobrepostos. Faltas e
  -- cancelamentos liberam o horário.
  constraint appointments_no_overlap exclude using gist (
    performed_by_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('agendado', 'concluido'))
);

create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_performed_starts_idx on public.appointments (performed_by_id, starts_at);
create index appointments_booked_starts_idx on public.appointments (booked_professional_id, starts_at);
create index appointments_customer_id_idx on public.appointments (customer_id);
create index appointments_service_id_idx on public.appointments (service_id);
create index appointments_subscription_id_idx on public.appointments (subscription_id);
create index appointments_status_idx on public.appointments (status);

-- --- Triggers (BEFORE, executados em ordem alfabética do nome) ---

-- 10: a equipe (não admin) só altera status e executor, e não reabre um concluído.
-- Não se aplica sem usuário (RPCs do anon, SQL Editor) nem ao admin. O anon não
-- tem UPDATE na tabela, então isso não abre caminho para ele.
create function public.appointments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_free constant text[] := array['status', 'performed_by_id', 'updated_at'];
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free) then
    raise exception using
      errcode = '42501',
      message = 'column_not_allowed',
      hint = 'A equipe altera apenas o status e quem executou o atendimento.';
  end if;

  if old.status = 'concluido' and new.status <> 'concluido' then
    raise exception using
      errcode = '42501',
      message = 'settled_appointment',
      hint = 'Só o administrador reabre um atendimento concluído.';
  end if;

  return new;
end;
$$;

-- 20: completa e valida a linha (qualquer origem: site, painel ou balcão).
create function public.appointments_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := public.shop_timezone();
  v_duration integer;
  v_price numeric(10, 2);
  v_local_start timestamp;
  v_local_end timestamp;
  v_opens time;
  v_closes time;
begin
  if new.performed_by_id is null then
    new.performed_by_id := new.booked_professional_id;
  end if;

  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
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

  if new.status in ('agendado', 'concluido') and (
    tg_op = 'INSERT'
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.service_id is distinct from old.service_id
    or new.performed_by_id is distinct from old.performed_by_id
    or old.status in ('cancelado', 'faltou')
  ) then
    if not exists (
      select 1
      from public.professional_services ps
      join public.professionals p on p.id = ps.professional_id
      where ps.professional_id = new.performed_by_id
        and ps.service_id = new.service_id
        and (p.is_active or tg_op = 'UPDATE')
    ) then
      raise exception using
        errcode = 'BC005',
        message = 'service_not_offered',
        hint = 'O profissional não atende este serviço.';
    end if;

    v_local_start := new.starts_at at time zone v_timezone;
    v_local_end := new.ends_at at time zone v_timezone;

    select opens_at, closes_at into v_opens, v_closes
    from public.opening_hours
    where weekday = extract(dow from v_local_start);

    if v_opens is null
      or v_local_start::time < v_opens
      or v_local_end > v_local_start::date + v_closes then
      raise exception using
        errcode = 'BC003',
        message = 'outside_opening_hours',
        hint = 'Horário fora do expediente da barbearia.';
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

-- 30: liquidação. Ao concluir, grava se o plano cobriu, quanto foi cobrado e o
-- repasse, para que mudanças futuras de preço ou comissão não alterem fechamentos.
create function public.appointments_settle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local_date date;
  v_subscription_id uuid;
  v_plan_payout numeric(10, 2);
  v_rate numeric(5, 4);
begin
  if new.status <> 'concluido' then
    new.covered_by_plan := null;
    new.subscription_id := null;
    new.charged_amount := null;
    new.payout_amount := null;
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

  v_local_date := public.shop_local_date(new.starts_at);

  select cs.id into v_subscription_id
  from public.customer_subscriptions cs
  join public.plan_services ps on ps.plan_id = cs.plan_id and ps.service_id = new.service_id
  where cs.customer_id = new.customer_id
    and cs.started_at <= v_local_date
    and (cs.ended_at is null or cs.ended_at >= v_local_date)
  limit 1;

  if v_subscription_id is not null then
    select plan_payout_amount into v_plan_payout
    from public.service_payouts
    where service_id = new.service_id;

    new.covered_by_plan := true;
    new.subscription_id := v_subscription_id;
    new.charged_amount := 0;
    new.payout_amount := coalesce(v_plan_payout, 0);
  else
    select walk_in_commission_rate into v_rate
    from public.payroll_settings
    where id = 1;

    new.covered_by_plan := false;
    new.subscription_id := null;
    new.charged_amount := new.price;
    new.payout_amount := round(new.price * coalesce(v_rate, 0), 2);
  end if;

  return new;
end;
$$;

revoke execute on function public.appointments_guard() from public, anon, authenticated;
revoke execute on function public.appointments_prepare() from public, anon, authenticated;
revoke execute on function public.appointments_settle() from public, anon, authenticated;

create trigger appointments_10_guard before update on public.appointments
  for each row execute function public.appointments_guard();

create trigger appointments_20_prepare before insert or update on public.appointments
  for each row execute function public.appointments_prepare();

create trigger appointments_30_settle before insert or update on public.appointments
  for each row execute function public.appointments_settle();

create trigger appointments_40_touch before update on public.appointments
  for each row execute function public.set_updated_at();

-- --- View do painel ---
-- security_invoker: respeita a RLS das tabelas de origem.
-- covered_live mostra a cobertura enquanto o horário está aberto; o fechamento usa
-- apenas o snapshot (covered_by_plan, charged_amount, payout_amount).
create view public.appointment_details
with (security_invoker = true)
as
select
  a.id,
  a.code,
  a.status,
  a.source,
  a.starts_at,
  a.ends_at,
  public.shop_local_date(a.starts_at) as local_date,
  to_char(a.starts_at at time zone public.shop_timezone(), 'HH24:MI') as local_time,
  a.customer_id,
  c.name as customer_name,
  c.phone as customer_phone,
  c.email as customer_email,
  a.service_id,
  s.slug as service_slug,
  s.name as service_name,
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
  (sub.plan_id is not null and exists (
    select 1 from public.plan_services ps where ps.plan_id = sub.plan_id and ps.service_id = a.service_id
  )) as covered_live,
  a.covered_by_plan,
  a.subscription_id,
  a.charged_amount,
  a.payout_amount,
  a.cancelled_at,
  a.created_at,
  a.updated_at
from public.appointments a
join public.customers c on c.id = a.customer_id
join public.services s on s.id = a.service_id
join public.professionals bp on bp.id = a.booked_professional_id
join public.professionals pp on pp.id = a.performed_by_id
left join lateral (
  select sp.id as plan_id, sp.name as plan_name
  from public.customer_subscriptions cs
  join public.subscription_plans sp on sp.id = cs.plan_id
  where cs.customer_id = a.customer_id
    and cs.started_at <= public.shop_local_date(a.starts_at)
    and (cs.ended_at is null or cs.ended_at >= public.shop_local_date(a.starts_at))
  limit 1
) sub on true;
