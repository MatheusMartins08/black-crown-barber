-- Acesso por papel (admin × barbeiro) e horário individual de cada profissional.
--
-- 1. Acesso da equipe
--    staff_members.login      usuário do barbeiro ("rafael"); o Auth guarda um e-mail interno
--                             derivado dele (<login>@equipe.blackcrown.app). Nulo no admin, que
--                             entra pelo e-mail. A senha fica só no Supabase Auth.
--    staff_members.is_active  acesso ativo/inativo. Inativo perde o acesso ao banco na hora
--                             (is_staff/is_admin/current_professional_id passam a exigir ativo),
--                             sem apagar atendimentos nem histórico.
--
-- 2. Dados financeiros só para o admin
--    appointments (preço, cobrado, repasse), appointment_services, customers,
--    customer_subscriptions, subscription_payments, payroll_settings e service_payouts passam a
--    ser lidos só pelo admin. As views do painel (appointment_details, customer_profiles,
--    subscriber_accounts) são security_invoker e seguem a mesma regra. O barbeiro vê a agenda
--    pela RPC get_team_agenda (só colunas operacionais) e altera status/executor pela RPC
--    update_team_appointment (mesma regra da política antiga).
--
-- 3. Horário por profissional (mesma fonte de dados da barbearia)
--    opening_periods.professional_id / schedule_exceptions.professional_id: nulo = barbearia
--    (todas as linhas atuais); preenchido = horário daquele profissional.
--    Horário efetivo do profissional numa data = horário próprio ∩ horário da barbearia:
--      próprio = nenhum com exceção "fechado" dele (folga, férias); senão o "horário especial"
--                dele; senão o semanal dele, se tiver; senão o dia todo (herda a barbearia).
--      bloqueios = os da barbearia + os "bloqueio" dele.
--    Sem horário próprio o resultado é idêntico ao de antes (verificado contra um retrato da
--    disponibilidade tirado antes de aplicar). Agendamentos existentes nunca são alterados.
--
-- Aditiva: colunas novas (nulas/padrão nas linhas atuais), funções novas, políticas trocadas.

set search_path = public, extensions;

-- =====================================================================
-- 1. Acesso da equipe
-- =====================================================================

alter table public.staff_members
  add column login text unique check (login ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  add column is_active boolean not null default true;

comment on column public.staff_members.login is
  'Usuário de login do barbeiro (o Auth usa <login>@equipe.blackcrown.app). Nulo para quem entra por e-mail.';
comment on column public.staff_members.is_active is
  'Acesso ao painel. Inativo não entra nem lê nada; atendimentos e histórico continuam.';

-- create or replace mantém o OID: as políticas existentes continuam apontando para elas.
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members where user_id = (select auth.uid()) and is_active
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff_members where user_id = (select auth.uid()) and role = 'admin' and is_active
  );
$$;

create or replace function private.current_professional_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select professional_id from public.staff_members where user_id = (select auth.uid()) and is_active;
$$;

-- =====================================================================
-- 2. Dados financeiros só para o admin
-- =====================================================================

alter policy appointments_select on public.appointments
  using ((select private.is_admin()));
alter policy appointment_services_select on public.appointment_services
  using ((select private.is_admin()));
alter policy customers_select on public.customers
  using ((select private.is_admin()));
alter policy customer_subscriptions_select on public.customer_subscriptions
  using ((select private.is_admin()));
alter policy subscription_payments_select on public.subscription_payments
  using ((select private.is_admin()));
alter policy payroll_settings_select on public.payroll_settings
  using ((select private.is_admin()));
alter policy service_payouts_select on public.service_payouts
  using ((select private.is_admin()));

-- Escrita direta em appointments: só admin. A equipe usa update_team_appointment.
alter policy appointments_insert on public.appointments
  with check ((select private.is_admin()));
alter policy appointments_update on public.appointments
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- --- Agenda operacional da equipe ---

-- Atendimentos entre duas datas locais (ou um só, por id), sem nenhum valor: nada de preço,
-- cobrado, repasse, situação de pagamento, telefone ou e-mail. plan_name só quando o plano
-- vale no dia (assinante ativo ou dentro da tolerância).
create function public.get_team_agenda(p_start date, p_end date, p_id uuid default null)
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
begin
  if not private.is_staff() then
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só a equipe vê a agenda.';
  end if;

  if p_id is null and (p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366) then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Intervalo de datas inválido.';
  end if;

  return query
  select
    a.id,
    a.code,
    a.status,
    public.shop_local_date(a.starts_at),
    to_char(a.starts_at at time zone public.shop_timezone(), 'HH24:MI'),
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
      when private.membership_status(a.customer_id, public.shop_local_date(a.starts_at)) in ('ativo', 'pendente')
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
      and cs.started_at <= public.shop_local_date(a.starts_at)
      and (cs.ended_at is null or cs.ended_at >= public.shop_local_date(a.starts_at))
    limit 1
  ) sub on true
  where case
    when p_id is not null then a.id = p_id
    else a.starts_at >= public.shop_local_ts(p_start, time '00:00')
      and a.starts_at < public.shop_local_ts(p_end + 1, time '00:00')
  end
  order by a.starts_at;
end;
$$;

-- Status e/ou quem executou. Admin altera qualquer um; barbeiro, só os horários em que é o
-- marcado ou o executor (mesma regra da política antiga). appointments_guard continua
-- limitando as colunas e impedindo reabrir um concluído.
create function public.update_team_appointment(
  p_id uuid,
  p_status public.appointment_status default null,
  p_performed_by uuid default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_professional uuid := private.current_professional_id();
  v_booked uuid;
  v_performer uuid;
begin
  if not private.is_staff() then
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só a equipe altera a agenda.';
  end if;

  select a.booked_professional_id, a.performed_by_id into v_booked, v_performer
  from public.appointments a
  where a.id = p_id
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

  if p_performed_by is not null and not exists (select 1 from public.professionals p where p.id = p_performed_by) then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Profissional inexistente.';
  end if;

  update public.appointments
  set status = coalesce(p_status, status),
      performed_by_id = coalesce(p_performed_by, performed_by_id)
  where id = p_id;
end;
$$;

revoke execute on function
  public.get_team_agenda(date, date, uuid),
  public.update_team_appointment(uuid, public.appointment_status, uuid)
from public, anon;

grant execute on function
  public.get_team_agenda(date, date, uuid),
  public.update_team_appointment(uuid, public.appointment_status, uuid)
to authenticated;

-- =====================================================================
-- 3. Horário por profissional
-- =====================================================================

alter table public.opening_periods
  add column professional_id uuid references public.professionals (id) on delete cascade;
alter table public.schedule_exceptions
  add column professional_id uuid references public.professionals (id) on delete cascade;

comment on column public.opening_periods.professional_id is
  'Nulo = horário da barbearia. Preenchido = horário semanal próprio do profissional (limitado ao da barbearia).';
comment on column public.schedule_exceptions.professional_id is
  'Nulo = exceção da barbearia. Preenchido = folga, ausência, horário especial ou bloqueio do profissional.';

create index opening_periods_professional_idx on public.opening_periods (professional_id, weekday);
create index schedule_exceptions_professional_idx on public.schedule_exceptions (professional_id, starts_on);

-- A restrição de sobreposição passa a separar barbearia e profissional em
-- …120100_opening_periods_overlap_per_owner (precisa recriar a restrição).

-- --- Barbearia: só as linhas sem profissional ---

create or replace function private.day_periods(p_date date)
returns table (opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  with exceptions as (
    select e.kind, e.opens_at, e.closes_at
    from public.schedule_exceptions e
    where e.professional_id is null
      and p_date between e.starts_on and e.ends_on
  )
  select x.opens_at, x.closes_at
  from exceptions x
  where x.kind = 'horario_especial'
    and not exists (select 1 from exceptions c where c.kind = 'fechado')
  union all
  select op.opens_at, op.closes_at
  from public.opening_periods op
  where op.professional_id is null
    and op.weekday = extract(dow from p_date)
    and not exists (select 1 from exceptions c where c.kind in ('fechado', 'horario_especial'));
$$;

create or replace function private.day_blocks(p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select public.shop_local_ts(p_date, e.opens_at), public.shop_local_ts(p_date, e.closes_at)
  from public.schedule_exceptions e
  where e.professional_id is null
    and e.kind = 'bloqueio'
    and p_date between e.starts_on and e.ends_on;
$$;

-- --- Profissional ---

-- Períodos próprios da data, sem a barbearia: nenhum com "fechado" dele; o "horário especial"
-- dele; senão o semanal dele; sem nada próprio, o dia todo (00:00–24:00 = herda a barbearia).
create function private.professional_own_day_periods(p_professional_id uuid, p_date date)
returns table (opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  with exceptions as (
    select e.kind, e.opens_at, e.closes_at
    from public.schedule_exceptions e
    where e.professional_id = p_professional_id
      and p_date between e.starts_on and e.ends_on
  )
  select x.opens_at, x.closes_at
  from exceptions x
  where x.kind = 'horario_especial'
    and not exists (select 1 from exceptions c where c.kind = 'fechado')
  union all
  select op.opens_at, op.closes_at
  from public.opening_periods op
  where op.professional_id = p_professional_id
    and op.weekday = extract(dow from p_date)
    and not exists (select 1 from exceptions c where c.kind in ('fechado', 'horario_especial'))
  union all
  select time '00:00', time '24:00'
  where not exists (select 1 from exceptions c where c.kind in ('fechado', 'horario_especial'))
    and not exists (select 1 from public.opening_periods op where op.professional_id = p_professional_id);
$$;

-- Trechos bloqueados só do profissional (exceção "bloqueio" dele).
create function private.professional_own_day_blocks(p_professional_id uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select public.shop_local_ts(p_date, e.opens_at), public.shop_local_ts(p_date, e.closes_at)
  from public.schedule_exceptions e
  where e.professional_id = p_professional_id
    and e.kind = 'bloqueio'
    and p_date between e.starts_on and e.ends_on;
$$;

-- Horário efetivo: próprio ∩ barbearia.
create function private.professional_day_periods(p_professional_id uuid, p_date date)
returns table (opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct greatest(o.opens_at, s.opens_at), least(o.closes_at, s.closes_at)
  from private.professional_own_day_periods(p_professional_id, p_date) o
  join private.day_periods(p_date) s
    on greatest(o.opens_at, s.opens_at) < least(o.closes_at, s.closes_at);
$$;

-- Bloqueios efetivos: os da barbearia + os do profissional.
create function private.professional_day_blocks(p_professional_id uuid, p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.starts_at, b.ends_at from private.day_blocks(p_date) b
  union all
  select b.starts_at, b.ends_at from private.professional_own_day_blocks(p_professional_id, p_date) b;
$$;

revoke execute on function
  private.professional_own_day_periods(uuid, date),
  private.professional_own_day_blocks(uuid, date),
  private.professional_day_periods(uuid, date),
  private.professional_day_blocks(uuid, date)
from public, anon, authenticated;

-- --- Agenda pública passa a usar o horário efetivo de cada profissional ---

create or replace function private.free_slots(p_service_ids uuid[], p_professional_id uuid, p_date date)
returns table (slot_start timestamptz)
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select timezone, slot_interval_minutes, min_lead_minutes
    from public.shop_settings
    where id = 1
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

-- Dia "closed": o profissional escolhido (ou, em "qualquer", nenhum ativo) não atende na data.
create or replace function public.get_day_summaries(p_services text[], p_professional text, p_start date, p_days integer)
returns table (day date, status text, available_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      private.resolve_services(p_services) as service_ids,
      private.check_professional(p_professional) as professional,
      least(
        greatest(coalesce(p_days, 0), 0),
        (select booking_window_days from public.shop_settings where id = 1)
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
      where p.is_active
        and (params.professional = 'qualquer' or p.slug = params.professional)
        and exists (select 1 from private.professional_day_periods(p.id, d.day))
    ) as is_open
  ) opened
  cross join lateral (
    select count(*)::integer as total
    from private.day_slots(params.service_ids, params.professional, d.day)
  ) slots
  order by d.day;
$$;

-- Validação de qualquer agendamento (site, painel, balcão). Igual à anterior, mais a
-- disponibilidade própria do executor (BC014): na criação, ao mudar horário/serviço, ao
-- reabrir e ao trocar quem executa (não se repassa um atendimento para quem está de folga).
-- O expediente da barbearia continua conferido só quando horário, serviço ou status mudam.
create or replace function public.appointments_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_timezone text := public.shop_timezone();
  v_duration integer;
  v_price numeric(10, 2);
  v_items integer;
  v_first uuid;
  v_local_start timestamp;
  v_local_end timestamp;
begin
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
      from private.day_periods(v_local_start::date) p
      where v_local_start::time >= p.opens_at
        and v_local_end <= v_local_start::date + p.closes_at
    ) or exists (
      select 1
      from private.day_blocks(v_local_start::date) x
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

-- --- RLS dos horários ---

-- Visitante e assinante: só o horário da barbearia (landing). Equipe: tudo.
alter policy opening_periods_select on public.opening_periods
  to anon, authenticated using (professional_id is null);
create policy opening_periods_select_staff on public.opening_periods
  for select to authenticated using ((select private.is_staff()));

-- Escrita: admin em tudo; barbeiro só nas linhas do próprio profissional. As políticas
-- *_admin_* são renomeadas para *_editor_* e ganham a regra nova (nada é apagado).
do $$
declare
  v_table text;
  v_op text;
  v_rule constant text :=
    '(select private.is_admin()) or (professional_id is not null and professional_id = (select private.current_professional_id()))';
begin
  foreach v_table in array array['opening_periods', 'schedule_exceptions'] loop
    foreach v_op in array array['insert', 'update', 'delete'] loop
      execute format('alter policy %I on public.%I rename to %I',
        v_table || '_admin_' || v_op, v_table, v_table || '_editor_' || v_op);
    end loop;
    execute format('alter policy %I on public.%I with check (%s)', v_table || '_editor_insert', v_table, v_rule);
    execute format('alter policy %I on public.%I using (%s) with check (%s)', v_table || '_editor_update', v_table, v_rule, v_rule);
    execute format('alter policy %I on public.%I using (%s)', v_table || '_editor_delete', v_table, v_rule);
  end loop;
end;
$$;
