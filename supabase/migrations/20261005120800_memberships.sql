-- Perfil do cliente, mensalidades dos planos e situação do assinante.
--
-- Situação do cliente numa data d (private.membership_status):
--   ativo         assinatura vigente e nenhuma mensalidade vencida em aberto
--   pendente      assinatura vigente com mensalidade vencida em aberto, dentro da tolerância
--   atrasado      mensalidade em aberto há mais dias que a tolerância: o plano deixa de cobrir
--   ex_assinante  nenhuma assinatura vigente, mas houve alguma antes
--   avulso        nunca assinou
-- A mesma regra está em app/data/painel.ts (getMembership).

set search_path = public, extensions;

create type public.payment_status as enum ('pendente', 'pago', 'cancelado');
create type public.payment_method as enum ('pix', 'cartao', 'dinheiro');

-- Dias depois do vencimento em que o plano ainda cobre os atendimentos.
alter table public.shop_settings
  add column subscription_grace_days integer not null default 5
    check (subscription_grace_days between 0 and 60);

-- --- Perfil: consentimento para mensagens no WhatsApp (LGPD) ---
-- O telefone do cliente é o WhatsApp. Guardá-lo serve ao agendamento; enviar
-- mensagens exige este consentimento.

alter table public.customers
  add column whatsapp_opt_in boolean not null default false,
  add column whatsapp_opt_in_at timestamptz,
  add constraint customers_whatsapp_opt_in_check check (whatsapp_opt_in = (whatsapp_opt_in_at is not null));

create function public.customers_opt_in()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.whatsapp_opt_in then
    new.whatsapp_opt_in_at := null;
  elsif tg_op = 'INSERT' or not old.whatsapp_opt_in or new.whatsapp_opt_in_at is null then
    new.whatsapp_opt_in_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.customers_opt_in() from public, anon, authenticated;

create trigger customers_opt_in before insert or update on public.customers
  for each row execute function public.customers_opt_in();

-- --- Mensalidades ---
-- Uma linha por mês de cada assinatura, ancorada no dia de início (started_at + k
-- meses; 31/01 vira 28/02). Pré-paga: vence no primeiro dia do período.
-- "Atrasado" não é guardado: sai de due_date + subscription_grace_days.

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.customer_subscriptions (id) on delete restrict,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  -- Cópia da mensalidade do plano quando a cobrança foi gerada.
  amount numeric(10, 2) not null check (amount >= 0),
  status public.payment_status not null default 'pendente',
  paid_at timestamptz,
  method public.payment_method,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  notes text check (char_length(notes) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, period_start),
  check (period_start <= period_end),
  check ((status = 'pago') = (paid_at is not null and method is not null))
);

create index subscription_payments_due_idx on public.subscription_payments (subscription_id, due_date);
create index subscription_payments_status_due_idx on public.subscription_payments (status, due_date);
create index subscription_payments_recorded_by_idx on public.subscription_payments (recorded_by);

-- Pago: registra quando e quem. Fora de "pago": limpa data e forma.
create function public.subscription_payments_prepare()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pago' then
    if new.paid_at is null then
      new.paid_at := now();
    end if;
    if tg_op = 'UPDATE' and old.status <> 'pago' then
      new.recorded_by := coalesce((select auth.uid()), new.recorded_by);
    end if;
  else
    new.paid_at := null;
    new.method := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.subscription_payments_prepare() from public, anon, authenticated;

create trigger subscription_payments_10_prepare before insert or update on public.subscription_payments
  for each row execute function public.subscription_payments_prepare();

create trigger subscription_payments_20_touch before update on public.subscription_payments
  for each row execute function public.set_updated_at();

-- Cria as mensalidades que faltam até p_until (padrão: hoje na barbearia). Idempotente:
-- pode rodar várias vezes e completa meses perdidos (ex.: projeto pausado).
create function private.generate_subscription_payments(p_until date default null, p_customer_id uuid default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_until date := coalesce(p_until, public.shop_today());
  v_count integer;
begin
  insert into public.subscription_payments (subscription_id, period_start, period_end, due_date, amount)
  select cs.id, p.period_start, p.next_start - 1, p.period_start, sp.monthly_price
  from public.customer_subscriptions cs
  join public.subscription_plans sp on sp.id = cs.plan_id
  cross join lateral (
    select
      (cs.started_at + make_interval(months => k))::date as period_start,
      (cs.started_at + make_interval(months => k + 1))::date as next_start
    from generate_series(
      0,
      (
        extract(year from age(least(v_until, coalesce(cs.ended_at, v_until)), cs.started_at)) * 12
        + extract(month from age(least(v_until, coalesce(cs.ended_at, v_until)), cs.started_at))
      )::integer
    ) as k
  ) p
  where cs.started_at <= v_until
    and (p_customer_id is null or cs.customer_id = p_customer_id)
    and p.period_start <= least(v_until, coalesce(cs.ended_at, v_until))
  on conflict (subscription_id, period_start) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Nova assinatura ou mudança de datas: gera as mensalidades do cliente na hora.
create function public.customer_subscriptions_billing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.generate_subscription_payments(null, new.customer_id);
  return null;
end;
$$;

revoke execute on function public.customer_subscriptions_billing() from public, anon, authenticated;

create trigger customer_subscriptions_billing
  after insert or update of started_at, ended_at, status, plan_id on public.customer_subscriptions
  for each row execute function public.customer_subscriptions_billing();

-- --- Regras de situação e cobertura ---

-- A assinatura não tem mensalidade em aberto vencida além da tolerância em p_date.
create function private.subscription_in_good_standing(p_subscription_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.subscription_payments sp
    where sp.subscription_id = p_subscription_id
      and sp.status = 'pendente'
      and sp.due_date + (select subscription_grace_days from public.shop_settings where id = 1) < p_date
  );
$$;

-- Assinatura que cobre o serviço na data: vigente, plano inclui o serviço e em dia.
create function private.subscription_covering(p_customer_id uuid, p_service_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select cs.id
  from public.customer_subscriptions cs
  join public.plan_services ps on ps.plan_id = cs.plan_id and ps.service_id = p_service_id
  where cs.customer_id = p_customer_id
    and cs.started_at <= p_date
    and (cs.ended_at is null or cs.ended_at >= p_date)
    and private.subscription_in_good_standing(cs.id, p_date)
  limit 1;
$$;

create function private.membership_status(p_customer_id uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with current_sub as (
    select cs.id
    from public.customer_subscriptions cs
    where cs.customer_id = p_customer_id
      and cs.started_at <= p_date
      and (cs.ended_at is null or cs.ended_at >= p_date)
    limit 1
  )
  select case
    when exists (select 1 from current_sub) then
      case
        when not private.subscription_in_good_standing((select id from current_sub), p_date) then 'atrasado'
        when exists (
          select 1
          from public.subscription_payments sp
          where sp.subscription_id = (select id from current_sub)
            and sp.status = 'pendente'
            and sp.due_date <= p_date
        ) then 'pendente'
        else 'ativo'
      end
    when exists (
      select 1 from public.customer_subscriptions cs where cs.customer_id = p_customer_id and cs.started_at <= p_date
    ) then 'ex_assinante'
    else 'avulso'
  end;
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.subscription_in_good_standing(uuid, date),
  private.subscription_covering(uuid, uuid, date),
  private.membership_status(uuid, date)
to authenticated;
revoke execute on function private.generate_subscription_payments(date, uuid) from authenticated;

-- --- Liquidação: o plano só cobre quem está em dia ---

create or replace function public.appointments_settle()
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

  -- Garante que as mensalidades até hoje existem antes de olhar o atraso.
  perform private.generate_subscription_payments(null, new.customer_id);
  v_subscription_id := private.subscription_covering(new.customer_id, new.service_id, v_local_date);

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

-- --- Views do painel ---

-- Mesmas colunas de antes; covered_live passa a exigir pagamento em dia e entra
-- membership_status (situação do cliente no dia do atendimento).
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
  private.subscription_covering(a.customer_id, a.service_id, public.shop_local_date(a.starts_at)) is not null as covered_live,
  a.covered_by_plan,
  a.subscription_id,
  a.charged_amount,
  a.payout_amount,
  a.cancelled_at,
  a.created_at,
  a.updated_at,
  private.membership_status(a.customer_id, public.shop_local_date(a.starts_at)) as membership_status
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

-- Perfil do cliente para o painel: dados, situação de hoje, plano, mensalidade em
-- aberto, último pagamento e frequência.
create view public.customer_profiles
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
  private.membership_status(c.id, public.shop_today()) as membership_status,
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
  case when open.oldest_due_date is not null then public.shop_today() - open.oldest_due_date end as days_overdue,
  last_pay.paid_at as last_paid_at,
  last_pay.method as last_payment_method,
  last_pay.amount as last_payment_amount,
  visits.last_visit_at,
  coalesce(visits.visit_count, 0) as visit_count
from public.customers c
left join lateral (
  select cs.id as subscription_id, cs.started_at, sp.id as plan_id, sp.slug as plan_slug, sp.name as plan_name, sp.monthly_price
  from public.customer_subscriptions cs
  join public.subscription_plans sp on sp.id = cs.plan_id
  where cs.customer_id = c.id
    and cs.started_at <= public.shop_today()
    and (cs.ended_at is null or cs.ended_at >= public.shop_today())
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
  where cs.customer_id = c.id and p.status = 'pendente' and p.due_date <= public.shop_today()
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

-- --- Grants e RLS (mesmo padrão de …120400_rls_policies) ---

revoke all on public.subscription_payments, public.customer_profiles from anon, authenticated;
grant select, insert, update, delete on public.subscription_payments to authenticated;
grant select on public.customer_profiles to authenticated;

alter table public.subscription_payments enable row level security;

-- Mensalidade mexe com dinheiro: a equipe vê, só o admin registra.
create policy subscription_payments_select on public.subscription_payments
  for select to authenticated using ((select private.is_staff()));
create policy subscription_payments_admin_insert on public.subscription_payments
  for insert to authenticated with check ((select private.is_admin()));
create policy subscription_payments_admin_update on public.subscription_payments
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy subscription_payments_admin_delete on public.subscription_payments
  for delete to authenticated using ((select private.is_admin()));

-- --- Agendamento: consentimento do WhatsApp ---
-- A RPC não revela a situação do cliente: quem digita um telefone no site não pode
-- descobrir se aquela pessoa é assinante. O consentimento só pode ser dado aqui,
-- nunca retirado (retirar fica com o admin, a pedido do cliente).

drop function public.create_reservation(text, text, date, text, text, text, text, text, text);

create function public.create_reservation(
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
  v_opt_in boolean := coalesce(p_whatsapp_opt_in, false);
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
  insert into public.customers as c (name, phone, email, whatsapp_opt_in)
  values (v_name, v_phone, v_email, v_opt_in)
  on conflict (phone) do update
    set email = coalesce(c.email, excluded.email),
        whatsapp_opt_in = c.whatsapp_opt_in or excluded.whatsapp_opt_in
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
      'notes', coalesce(v_notes, ''),
      'whatsappOptIn', v_opt_in
    )
  );
end;
$$;

revoke execute on function public.create_reservation(text, text, date, text, text, text, text, text, text, boolean) from public;
grant execute on function public.create_reservation(text, text, date, text, text, text, text, text, text, boolean) to anon, authenticated;
