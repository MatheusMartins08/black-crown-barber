-- Vários serviços no mesmo agendamento (passo B de 2): funções da agenda.
--
-- O agendamento (appointments) continua sendo um só e guarda os totais: price = soma,
-- ends_at = início + soma das durações, service_name = "Corte masculino + Sobrancelha",
-- service_id = 1º serviço, cobrado e repasse = somas. Os serviços ficam em
-- appointment_services. Para 1 serviço tudo funciona exatamente como antes (verificado com
-- funções temporárias contra as atuais antes de aplicar).
--
-- Combos: um conjunto é válido se nenhum serviço simples aparece duas vezes (simples conta
-- como ele mesmo; combo conta como as suas partes, em service_components). Conjunto inválido:
-- BC012 conflicting_services.
--
-- Bloqueio contínuo e sem agendamento duplo: ends_at já nasce com a duração total e a
-- restrição de exclusão existente (appointments_no_overlap) cobre o intervalo inteiro.
--
-- As RPCs públicas antigas (um serviço, p_service text) continuam existindo e passam a
-- chamar as novas (p_services text[]) com um item, para o site não quebrar durante o deploy.

-- --- Serviços escolhidos ---

-- Slugs -> ids na ordem, validando: 1 a 5, ativos, sem repetição e sem conflito de combo.
create function private.resolve_services(p_services text[])
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
    v_id := private.resolve_service(v_slug);
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

-- --- Horários livres: duração = soma; o profissional precisa atender todos os serviços ---

create function private.free_slots(p_service_ids uuid[], p_professional_id uuid, p_date date)
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
    select opens_at, closes_at
    from private.day_periods(p_date)
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
    and not exists (
      select 1
      from private.day_blocks(p_date) x
      where tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(c.starts_at, c.starts_at + c.duration, '[)')
    )
  order by 1;
$$;

create or replace function private.free_slots(p_service_id uuid, p_professional_id uuid, p_date date)
returns table (slot_start timestamptz)
language sql
stable
set search_path = ''
as $$
  select fs.slot_start from private.free_slots(array[p_service_id], p_professional_id, p_date) fs;
$$;

create function private.day_slots(p_service_ids uuid[], p_professional text, p_date date)
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
  join public.professionals p on p.is_active and (p_professional = 'qualquer' or p.slug = p_professional)
  cross join lateral private.free_slots(p_service_ids, p.id, p_date) fs
  where cfg.id = 1
    and p_date >= public.shop_today()
    and p_date < public.shop_today() + cfg.booking_window_days
  group by fs.slot_start
  order by fs.slot_start;
$$;

create or replace function private.day_slots(p_service_id uuid, p_professional text, p_date date)
returns table (slot_start timestamptz, professional_ids uuid[], professional_slugs text[])
language sql
stable
set search_path = ''
as $$
  select ds.slot_start, ds.professional_ids, ds.professional_slugs
  from private.day_slots(array[p_service_id], p_professional, p_date) ds;
$$;

-- --- RPCs públicas de disponibilidade (lista de serviços) ---

create function public.get_day_availability(p_services text[], p_professional text, p_date date)
returns table (slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(ds.slot_start at time zone public.shop_timezone(), 'HH24:MI'), ds.professional_slugs
  from private.day_slots(private.resolve_services(p_services), private.check_professional(p_professional), p_date) ds
  order by ds.slot_start;
$$;

create or replace function public.get_day_availability(p_service text, p_professional text, p_date date)
returns table (slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.get_day_availability(array[p_service], p_professional, p_date);
$$;

create function public.get_day_summaries(p_services text[], p_professional text, p_start date, p_days integer)
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
  cross join lateral (select exists (select 1 from private.day_periods(d.day)) as is_open) opened
  cross join lateral (
    select count(*)::integer as total
    from private.day_slots(params.service_ids, params.professional, d.day)
  ) slots
  order by d.day;
$$;

create or replace function public.get_day_summaries(p_service text, p_professional text, p_start date, p_days integer)
returns table (day date, status text, available_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.get_day_summaries(array[p_service], p_professional, p_start, p_days);
$$;

create function public.find_next_available(p_services text[], p_professional text, p_from date)
returns table (day date, slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      private.resolve_services(p_services) as service_ids,
      private.check_professional(p_professional) as professional,
      public.shop_today() as today,
      (select booking_window_days from public.shop_settings where id = 1) as window_days
  )
  select d.day, to_char(ds.slot_start at time zone public.shop_timezone(), 'HH24:MI'), ds.professional_slugs
  from params
  cross join lateral (
    select params.today + offs.i as day
    from generate_series(greatest(p_from, params.today) - params.today, params.window_days - 1) as offs(i)
  ) d
  cross join lateral private.day_slots(params.service_ids, params.professional, d.day) ds
  order by ds.slot_start
  limit 1;
$$;

create or replace function public.find_next_available(p_service text, p_professional text, p_from date)
returns table (day date, slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.find_next_available(array[p_service], p_professional, p_from);
$$;

-- --- Cobertura do plano: o uso conta pelos serviços do agendamento ---

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
  v_date date := public.shop_local_date(p_starts_at);
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
    and a.starts_at >= public.shop_local_ts(v_window_start, time '00:00')
    and a.starts_at < public.shop_local_ts(v_window_end + 1, time '00:00')
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

-- --- Reserva: itens primeiro, agendamento depois (totais calculados pelo banco) ---

create function private.book_site_appointment(
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
volatile
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_candidates uuid[];
  v_assigned uuid;
  v_candidate uuid;
  v_appointment_id uuid;
begin
  if p_date is null or coalesce(p_time, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    raise exception using
      errcode = 'BC001',
      message = 'invalid_request',
      hint = 'Revise os dados do agendamento antes de confirmar.';
  end if;

  v_start := public.shop_local_ts(p_date, p_time::time);

  -- Revalida o horário com a duração total: o intervalo inteiro precisa estar livre.
  select ds.professional_ids into v_candidates
  from private.day_slots(p_service_ids, p_professional, p_date) ds
  where ds.slot_start = v_start;

  if v_candidates is null then
    raise exception using
      errcode = 'BC002',
      message = 'slot_unavailable',
      hint = 'Esse horário acabou de ser ocupado. Escolha outro horário.';
  end if;

  select id into v_assigned from public.professionals where slug = p_assigned_professional;
  if v_assigned = any (v_candidates) then
    v_candidates := array_prepend(v_assigned, array_remove(v_candidates, v_assigned));
  end if;

  foreach v_candidate in array v_candidates loop
    begin
      v_appointment_id := gen_random_uuid();

      -- Itens com as cópias do catálogo (a FK para o agendamento é conferida no fim).
      insert into public.appointment_services (appointment_id, service_id, position, service_name, price, duration_minutes)
      select v_appointment_id, s.id, chosen.ord::smallint, s.name, s.price, s.duration_minutes
      from unnest(p_service_ids) with ordinality as chosen(id, ord)
      join public.services s on s.id = chosen.id;

      -- Preço, término e nome saem da soma dos itens (appointments_prepare).
      insert into public.appointments (
        id, customer_id, service_id, booked_professional_id, performed_by_id,
        requested_any_professional, starts_at, status, source, customer_notes
      )
      values (
        v_appointment_id, p_customer_id, p_service_ids[1], v_candidate, v_candidate,
        p_professional = 'qualquer', v_start, 'agendado', 'site', p_notes
      );
      exit;
    exception when exclusion_violation then
      -- Outro cliente levou o horário deste profissional; tenta o próximo.
      v_appointment_id := null;
    end;
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

create or replace function private.book_site_appointment(
  p_customer_id uuid,
  p_service_id uuid,
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text,
  p_notes text
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select private.book_site_appointment(
    p_customer_id, array[p_service_id], p_professional, p_date, p_time, p_assigned_professional, p_notes
  );
$$;

-- --- Triggers do agendamento ---

-- 20: com itens (reserva), preço, término e 1º serviço vêm deles. Sem itens (inserção direta
-- pelo painel), como antes: do serviço. Profissional habilitado em todos os serviços.
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

  -- Profissional: atende todos os serviços e não está bloqueado (também ao trocar quem executa).
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
  end if;

  -- Expediente da barbearia (períodos + exceções) com a duração total.
  if new.status in ('agendado', 'concluido') and (
    tg_op = 'INSERT'
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.service_id is distinct from old.service_id
    or old.status in ('cancelado', 'faltou')
  ) then
    v_local_start := new.starts_at at time zone v_timezone;
    v_local_end := new.ends_at at time zone v_timezone;

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

-- 25: nome copiado. Com itens: "Corte masculino + Sobrancelha", na ordem escolhida.
create or replace function public.appointments_service_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_names text;
begin
  if tg_op = 'INSERT' then
    select string_agg(i.service_name, ' + ' order by i.position) into v_names
    from public.appointment_services i
    where i.appointment_id = new.id;
  end if;

  if v_names is not null then
    new.service_name := v_names;
  elsif tg_op = 'INSERT' or new.service_id is distinct from old.service_id or new.service_name is null then
    select name into new.service_name from public.services where id = new.service_id;
  end if;
  return new;
end;
$$;

-- 30: liquidação por serviço. Cada item é avaliado no plano (mesmo limite semanal/mensal):
-- coberto = R$ 0 com o repasse fixo do serviço; não coberto = preço com a comissão de avulso.
-- O agendamento guarda as somas. Já concluído e sem mudança: preserva o que foi gravado.
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
  where id = 1;

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

-- Inserção direta (sem itens) ganha 1 item; troca de serviço atualiza o item único.
create function public.appointments_sync_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.appointment_services where appointment_id = new.id) then
      insert into public.appointment_services (
        appointment_id, service_id, position, service_name, price, duration_minutes,
        covered_by_plan, subscription_id, charged_amount, payout_amount
      )
      values (
        new.id, new.service_id, 1, new.service_name, new.price,
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

create trigger appointments_50_sync_items after insert or update of service_id on public.appointments
  for each row execute function public.appointments_sync_items();

-- Integridade, conferida no fim da transação: o agendamento tem itens e os totais batem.
create function public.appointments_check_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_price numeric(10, 2);
  v_duration integer;
  v_row public.appointments;
begin
  select * into v_row from public.appointments where id = new.id;
  if not found then
    return null;
  end if;

  select count(*), sum(price), sum(duration_minutes) into v_count, v_price, v_duration
  from public.appointment_services
  where appointment_id = new.id;

  if v_count = 0
    or v_price <> v_row.price
    or make_interval(mins => v_duration) <> v_row.ends_at - v_row.starts_at then
    raise exception using
      errcode = 'BC013',
      message = 'appointment_items_mismatch',
      hint = 'Os serviços do agendamento não batem com o preço ou a duração.';
  end if;
  return null;
end;
$$;

create constraint trigger appointments_60_check_items
  after insert or update of price, starts_at, ends_at on public.appointments
  deferrable initially deferred
  for each row execute function public.appointments_check_items();

revoke execute on function
  private.resolve_services(text[]),
  private.free_slots(uuid[], uuid, date),
  private.day_slots(uuid[], text, date),
  private.book_site_appointment(uuid, uuid[], text, date, text, text, text),
  public.appointments_sync_items(),
  public.appointments_check_items()
from public, anon, authenticated;

-- --- Resposta da reserva: totais + lista de serviços ---

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
    'date', public.shop_local_date(a.starts_at),
    'time', to_char(a.starts_at at time zone public.shop_timezone(), 'HH24:MI'),
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

-- --- Reservas públicas (lista de serviços) ---

create function public.create_reservation(
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
volatile
security definer
set search_path = ''
as $$
declare
  v_service_ids uuid[] := private.resolve_services(p_services);
  v_professional text := private.check_professional(p_professional);
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

  -- Telefone já cadastrado não sobrescreve o nome (não há verificação por SMS);
  -- o e-mail só é preenchido se ainda estiver vazio.
  insert into public.customers as c (name, phone, email, whatsapp_opt_in)
  values (v_name, v_phone, v_email, v_opt_in)
  on conflict (phone) do update
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

create or replace function public.create_reservation(
  p_service text,
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
volatile
security definer
set search_path = ''
as $$
  select public.create_reservation(
    array[p_service], p_professional, p_date, p_time, p_assigned_professional,
    p_name, p_phone, p_email, p_notes, p_whatsapp_opt_in
  );
$$;

create function public.create_subscriber_reservation(
  p_services text[],
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_service_ids uuid[] := private.resolve_services(p_services);
  v_professional text := private.check_professional(p_professional);
  v_customer public.customers;
  v_appointment_id uuid;
  v_plan_id uuid;
  v_services jsonb;
  v_all_covered boolean;
begin
  select * into v_customer from public.customers where user_id = (select auth.uid());
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

create or replace function public.create_subscriber_reservation(
  p_service text,
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text
)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select public.create_subscriber_reservation(array[p_service], p_professional, p_date, p_time, p_assigned_professional);
$$;

revoke execute on function
  public.get_day_availability(text[], text, date),
  public.get_day_summaries(text[], text, date, integer),
  public.find_next_available(text[], text, date),
  public.create_reservation(text[], text, date, text, text, text, text, text, text, boolean),
  public.create_subscriber_reservation(text[], text, date, text, text)
from public;

grant execute on function
  public.get_day_availability(text[], text, date),
  public.get_day_summaries(text[], text, date, integer),
  public.find_next_available(text[], text, date),
  public.create_reservation(text[], text, date, text, text, text, text, text, text, boolean)
to anon, authenticated;

grant execute on function public.create_subscriber_reservation(text[], text, date, text, text) to authenticated;

-- --- View do painel: mesmas colunas + serviços do agendamento ---

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
  public.shop_local_date(a.starts_at) as local_date,
  to_char(a.starts_at at time zone public.shop_timezone(), 'HH24:MI') as local_time,
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
  -- Em aberto: todos os serviços entrariam no plano?
  coalesce(items.all_covered_live, false) as covered_live,
  a.covered_by_plan,
  a.subscription_id,
  a.charged_amount,
  a.payout_amount,
  a.cancelled_at,
  a.created_at,
  a.updated_at,
  private.membership_status(a.customer_id, public.shop_local_date(a.starts_at)) as membership_status,
  items.service_ids,
  items.list as items
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
    and cs.status <> 'cancelada'
    and cs.started_at <= public.shop_local_date(a.starts_at)
    and (cs.ended_at is null or cs.ended_at >= public.shop_local_date(a.starts_at))
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
