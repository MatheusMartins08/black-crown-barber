-- RPCs do agendamento público. Cada função pública espelha uma de
-- app/agendamento/lib/booking-api.ts. O visitante não lê nem grava appointments
-- e customers diretamente: tudo passa por aqui (security definer).
--
-- Códigos de erro (SQLSTATE; "message" traz a chave e "hint" o texto em pt-BR):
--   BC001 invalid_request        BC002 slot_unavailable
--   BC003 outside_opening_hours  BC004 professional_blocked
--   BC005 service_not_offered    BC007 cancel_too_late
--   BC008 reservation_not_found  BC009 not_cancellable

-- --- Helpers internos (schema private, fora da API) ---

create function private.resolve_service(p_slug text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.services where slug = p_slug and is_active;
  if v_id is null then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Serviço inválido.';
  end if;
  return v_id;
end;
$$;

-- Aceita o slug de um profissional ativo ou "qualquer".
create function private.check_professional(p_choice text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_choice = 'qualquer' or exists (select 1 from public.professionals where slug = p_choice and is_active) then
    return p_choice;
  end if;
  raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Profissional inválido.';
end;
$$;

create function private.format_phone(p_digits text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case char_length(p_digits)
    when 11 then format('(%s) %s-%s', substr(p_digits, 1, 2), substr(p_digits, 3, 5), substr(p_digits, 8))
    when 10 then format('(%s) %s-%s', substr(p_digits, 1, 2), substr(p_digits, 3, 4), substr(p_digits, 7))
    else p_digits
  end;
$$;

-- Inícios livres de um profissional num dia: grade do expediente, sem conflito
-- com atendimentos ativos nem bloqueios, respeitando a antecedência mínima.
create function private.free_slots(p_service_id uuid, p_professional_id uuid, p_date date)
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
    select opens_at, closes_at
    from public.opening_hours
    where weekday = extract(dow from p_date) and opens_at is not null
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
  select c.starts_at
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
  order by c.starts_at;
$$;

-- Horários livres do dia para a escolha do cliente ("qualquer" junta todos os
-- profissionais ativos que fazem o serviço). Fora da janela de agendamento: vazio.
create function private.day_slots(p_service_id uuid, p_professional text, p_date date)
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
  cross join lateral private.free_slots(p_service_id, p.id, p_date) fs
  where cfg.id = 1
    and p_date >= public.shop_today()
    and p_date < public.shop_today() + cfg.booking_window_days
  group by fs.slot_start
  order by fs.slot_start;
$$;

create function private.reservation_json(p_appointment_id uuid)
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

-- --- RPCs públicas ---

-- fetchDayAvailability
create function public.get_day_availability(p_service text, p_professional text, p_date date)
returns table (slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(ds.slot_start at time zone public.shop_timezone(), 'HH24:MI'), ds.professional_slugs
  from private.day_slots(private.resolve_service(p_service), private.check_professional(p_professional), p_date) ds
  order by ds.slot_start;
$$;

-- fetchDaySummaries. Dia sem expediente: closed; com expediente e sem horário
-- (inclusive dia passado ou fora da janela): full.
create function public.get_day_summaries(p_service text, p_professional text, p_start date, p_days integer)
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
    case when oh.opens_at is null then 'closed' when slots.total > 0 then 'open' else 'full' end,
    case when oh.opens_at is null then 0 else slots.total end
  from params
  cross join lateral (select p_start + offs.i as day from generate_series(0, params.days - 1) as offs(i)) d
  left join public.opening_hours oh on oh.weekday = extract(dow from d.day)
  cross join lateral (
    select count(*)::integer as total
    from private.day_slots(params.service_id, params.professional, d.day)
  ) slots
  order by d.day;
$$;

-- findNextAvailable: primeiro horário livre a partir de p_from, dentro da janela.
create function public.find_next_available(p_service text, p_professional text, p_from date)
returns table (day date, slot_time text, professional_slugs text[])
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select
      private.resolve_service(p_service) as service_id,
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
  cross join lateral private.day_slots(params.service_id, params.professional, d.day) ds
  order by ds.slot_start
  limit 1;
$$;

-- createReservation. Revalida tudo no servidor e devolve o JSON no formato do tipo
-- Reservation (app/data/booking.ts).
create function public.create_reservation(
  p_service text,
  p_professional text,
  p_date date,
  p_time text,
  p_assigned_professional text,
  p_name text,
  p_phone text,
  p_email text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_service_id uuid := private.resolve_service(p_service);
  v_professional text := private.check_professional(p_professional);
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_start timestamptz;
  v_candidates uuid[];
  v_assigned uuid;
  v_candidate uuid;
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

  v_start := public.shop_local_ts(p_date, p_time::time);

  select ds.professional_ids into v_candidates
  from private.day_slots(v_service_id, v_professional, p_date) ds
  where ds.slot_start = v_start;

  if v_candidates is null then
    raise exception using
      errcode = 'BC002',
      message = 'slot_unavailable',
      hint = 'Esse horário acabou de ser ocupado. Escolha outro horário.';
  end if;

  -- O profissional mostrado na tela vai primeiro; os demais livres no horário só
  -- entram quando a escolha foi "qualquer" (senão a lista tem um único nome).
  select id into v_assigned from public.professionals where slug = p_assigned_professional;
  if v_assigned = any (v_candidates) then
    v_candidates := array_prepend(v_assigned, array_remove(v_candidates, v_assigned));
  end if;

  -- Telefone já cadastrado não sobrescreve o nome (não há verificação por SMS);
  -- o e-mail só é preenchido se ainda estiver vazio.
  insert into public.customers as c (name, phone, email)
  values (v_name, v_phone, v_email)
  on conflict (phone) do update set email = coalesce(c.email, excluded.email)
  returning c.id into v_customer_id;

  foreach v_candidate in array v_candidates loop
    begin
      insert into public.appointments (
        customer_id, service_id, booked_professional_id, performed_by_id,
        requested_any_professional, starts_at, status, source, customer_notes
      )
      values (
        v_customer_id, v_service_id, v_candidate, v_candidate,
        v_professional = 'qualquer', v_start, 'agendado', 'site', v_notes
      )
      returning id into v_appointment_id;
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

  -- A tela de confirmação mostra o que o cliente digitou.
  return private.reservation_json(v_appointment_id) || jsonb_build_object(
    'customer', jsonb_build_object(
      'name', v_name,
      'phone', private.format_phone(v_phone),
      'email', coalesce(v_email, ''),
      'notes', coalesce(v_notes, '')
    )
  );
end;
$$;

-- Consulta de reserva: exige código e telefone. Devolve null se não encontrar.
create function public.get_reservation(p_code text, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select private.reservation_json(a.id)
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.code = upper(btrim(p_code))
    and c.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$$;

-- Cancelamento pelo site: só reservas "agendado", com cancel_min_notice_minutes
-- de antecedência. O painel cancela sem essa restrição.
create function public.cancel_reservation(p_code text, p_phone text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status public.appointment_status;
  v_starts_at timestamptz;
  v_notice integer;
begin
  select a.id, a.status, a.starts_at into v_id, v_status, v_starts_at
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.code = upper(btrim(p_code))
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

  select cancel_min_notice_minutes into v_notice from public.shop_settings where id = 1;

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

-- --- Permissões ---

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function public.get_day_availability(text, text, date) from public;
revoke execute on function public.get_day_summaries(text, text, date, integer) from public;
revoke execute on function public.find_next_available(text, text, date) from public;
revoke execute on function public.create_reservation(text, text, date, text, text, text, text, text, text) from public;
revoke execute on function public.get_reservation(text, text) from public;
revoke execute on function public.cancel_reservation(text, text) from public;

grant execute on function public.get_day_availability(text, text, date) to anon, authenticated;
grant execute on function public.get_day_summaries(text, text, date, integer) to anon, authenticated;
grant execute on function public.find_next_available(text, text, date) to anon, authenticated;
grant execute on function public.create_reservation(text, text, date, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_reservation(text, text) to anon, authenticated;
grant execute on function public.cancel_reservation(text, text) to anon, authenticated;
