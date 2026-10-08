-- Edição do site (etapa 6, passo 2 de 2): a agenda passa a usar o horário semanal com
-- vários períodos (opening_periods) e as exceções da barbearia (schedule_exceptions), via
-- private.day_periods / private.day_blocks. Mesmas assinaturas; opening_hours deixa de ser
-- lida (continua intacta).
--
-- Verificado antes de aplicar (funções temporárias, sem gravar nada): com as exceções vazias,
-- as funções novas devolvem exatamente o mesmo que as antigas em 315 combinações de
-- profissional × serviço × dia (5.469 horários), 61 dias de calendário e todos os
-- atendimentos existentes.
--
-- Regra nova em appointments_prepare: a checagem de expediente (períodos e exceções) roda na
-- criação e quando horário, serviço ou status mudam — não mais só por trocar quem executa.
-- Assim um agendamento que ficou fora de um horário novo pode ser repassado a outro
-- profissional. Serviço habilitado e bloqueios do profissional continuam sendo conferidos
-- também na troca de executor. Agendamentos existentes nunca são cancelados ou alterados.

create or replace function private.free_slots(p_service_id uuid, p_professional_id uuid, p_date date)
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
    select s.duration_minutes
    from public.services s
    join public.professional_services ps on ps.service_id = s.id and ps.professional_id = p_professional_id
    where s.id = p_service_id and s.is_active
  ), day as (
    -- Um ou mais períodos do dia, já com as exceções (fechado / horário especial).
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
    -- Trechos bloqueados da barbearia (exceção "bloqueio").
    and not exists (
      select 1
      from private.day_blocks(p_date) x
      where tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(c.starts_at, c.starts_at + c.duration, '[)')
    )
  order by 1;
$$;

-- Dia sem período (fechado pelo semanal ou por exceção): closed; com período e sem horário: full.
create or replace function public.get_day_summaries(p_service text, p_professional text, p_start date, p_days integer)
returns table (day date, status text, available_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      private.resolve_service(p_service) as service_id,
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
    from private.day_slots(params.service_id, params.professional, d.day)
  ) slots
  order by d.day;
$$;

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
  v_local_start timestamp;
  v_local_end timestamp;
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

  -- Profissional: atende o serviço e não está bloqueado (também ao trocar quem executa).
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

  -- Expediente da barbearia (períodos + exceções): na criação e quando horário, serviço ou
  -- status mudam. Trocar só quem executa não reconfere (o horário já estava marcado).
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
