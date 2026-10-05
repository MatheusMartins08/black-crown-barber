-- Assinantes: login pelo telefone, planos Bronze/Prata/Ouro com limite semanal por
-- serviço e situação da assinatura definida pela barbearia (ativo, congelado, inativo).
-- Espelha app/data/plans.ts, app/data/subscribers.ts e app/lib/subscribers-api.ts.
--
-- Senha: fica só no Supabase Auth (auth.users, bcrypt). customers.user_id liga o
-- cliente ao login. Criar e redefinir a senha é tarefa de uma rotina de servidor com a
-- service role (auth.admin.createUser / updateUserById), nunca do navegador. Nenhuma
-- tabela do projeto guarda senha.
--
-- Períodos (customer_subscriptions): cada linha tem plano e situação fixos.
--   ativa      Ativo: o plano cobre e gera mensalidade
--   suspensa   Congelado: não cobre nem gera mensalidade
--   cancelada  período anulado no mesmo dia em que começou
--   Inativo = nenhum período vigente (o "ex_assinante" de membership_status).
-- Mudar plano ou situação encerra o período atual na véspera e abre outro hoje: a
-- mensalidade passa a vencer na data da mudança, sem rateio. No dia em que o período
-- começou, ele é ajustado no lugar.
--
-- Benefício semanal (segunda a domingo, no fuso da barbearia): o atendimento entra no
-- plano se o período estiver ativo e em dia, o plano incluir o serviço e o cliente ainda
-- não tiver usado weekly_limit vezes naquela semana. Contam como uso os agendamentos
-- feitos antes e os concluídos cobertos pelo plano; faltas e cancelamentos liberam.

set search_path = public, extensions;

-- --- Planos: Bronze, Prata e Ouro com limite semanal ---

alter table public.plan_services
  add column weekly_limit smallint not null default 1 check (weekly_limit between 1 and 7);

comment on column public.plan_services.weekly_limit is
  'Quantas vezes por semana (segunda a domingo) o serviço está incluído no plano.';

-- Os planos atuais são renomeados no lugar: assinaturas que já existam seguem válidas.
update public.subscription_plans
set slug = 'bronze', name = 'Plano Bronze', monthly_price = 99, sort_order = 1
where slug = 'plano-corte';

update public.subscription_plans
set slug = 'prata', name = 'Plano Prata', monthly_price = 129, sort_order = 2
where slug = 'plano-barba';

update public.subscription_plans
set slug = 'ouro', name = 'Plano Ouro', monthly_price = 189, sort_order = 3
where slug = 'plano-coroa';

insert into public.subscription_plans (slug, name, monthly_price, sort_order)
values
  ('bronze', 'Plano Bronze', 99, 1),
  ('prata', 'Plano Prata', 129, 2),
  ('ouro', 'Plano Ouro', 189, 3)
on conflict (slug) do update
  set name = excluded.name,
      monthly_price = excluded.monthly_price,
      sort_order = excluded.sort_order,
      is_active = true;

delete from public.plan_services ps
using public.subscription_plans sp
where sp.id = ps.plan_id
  and sp.slug in ('bronze', 'prata', 'ouro');

insert into public.plan_services (plan_id, service_id, weekly_limit)
select sp.id, s.id, v.weekly_limit
from (values
  ('bronze', 'corte', 1),
  ('prata', 'corte', 1),
  ('ouro', 'corte', 1),
  ('ouro', 'barba', 1),
  ('ouro', 'sobrancelha', 1)
) as v (plan_slug, service_slug, weekly_limit)
join public.subscription_plans sp on sp.slug = v.plan_slug
join public.services s on s.slug = v.service_slug;

-- --- Períodos com situação própria ---

-- O check de …120200_people exigia "ativa" exatamente nos períodos abertos. Agora um
-- período aberto pode estar ativo ou congelado; só o anulado precisa estar fechado.
do $$
declare
  v_name text;
begin
  for v_name in
    select conname
    from pg_constraint
    where conrelid = 'public.customer_subscriptions'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%ended_at%'
  loop
    execute format('alter table public.customer_subscriptions drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.customer_subscriptions
  add constraint customer_subscriptions_status_period_check
    check (status <> 'cancelada' or ended_at is not null);

comment on column public.customer_subscriptions.status is
  'ativa: plano ativo (cobre e gera mensalidade). suspensa: plano congelado. cancelada: período anulado no mesmo dia.';

-- Mensalidade só para períodos ativos.
create or replace function private.generate_subscription_payments(p_until date default null, p_customer_id uuid default null)
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
  where cs.status = 'ativa'
    and cs.started_at <= v_until
    and (p_customer_id is null or cs.customer_id = p_customer_id)
    and p.period_start <= least(v_until, coalesce(cs.ended_at, v_until))
  on conflict (subscription_id, period_start) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Situação definida pela barbearia na data: ativo, congelado ou inativo.
create function private.subscriber_status(p_customer_id uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case cs.status when 'ativa' then 'ativo' else 'congelado' end
      from public.customer_subscriptions cs
      where cs.customer_id = p_customer_id
        and cs.status <> 'cancelada'
        and cs.started_at <= p_date
        and (cs.ended_at is null or cs.ended_at >= p_date)
      limit 1
    ),
    'inativo'
  );
$$;

-- Mesma regra de antes, com o plano congelado. Igual a getMembership (app/data/painel.ts).
create or replace function private.membership_status(p_customer_id uuid, p_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with current_sub as (
    select cs.id, cs.status
    from public.customer_subscriptions cs
    where cs.customer_id = p_customer_id
      and cs.status <> 'cancelada'
      and cs.started_at <= p_date
      and (cs.ended_at is null or cs.ended_at >= p_date)
    limit 1
  )
  select case
    when exists (select 1 from current_sub) then
      case
        when (select status from current_sub) = 'suspensa' then 'congelado'
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

-- --- Cobertura do plano ---

-- O plano cobre este atendimento? Motivos iguais a CoverageReason (app/data/subscribers.ts):
-- incluido, fora_do_plano, limite_semanal, congelado, inativo, pagamento_atrasado.
-- p_appointment_id e p_booked_at identificam o próprio atendimento (nulos numa prévia).
create function private.plan_coverage(
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
  v_limit smallint;
  v_used integer;
begin
  select cs.id, cs.plan_id, cs.status into v_subscription_id, v_plan_id, v_status
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

  select ps.weekly_limit into v_limit
  from public.plan_services ps
  where ps.plan_id = v_plan_id and ps.service_id = p_service_id;

  if not found then
    return query select null::uuid, v_plan_id, 'fora_do_plano'::text, v_week_start, v_week_start + 6;
    return;
  end if;

  select count(*)::integer into v_used
  from public.appointments a
  where a.customer_id = p_customer_id
    and a.service_id = p_service_id
    and a.id is distinct from p_appointment_id
    and a.starts_at >= public.shop_local_ts(v_week_start, time '00:00')
    and a.starts_at < public.shop_local_ts(v_week_start + 7, time '00:00')
    and (
      (a.status = 'agendado' and a.created_at < v_booked_at)
      or (a.status = 'concluido' and a.covered_by_plan)
    );

  if v_used >= v_limit then
    return query select null::uuid, v_plan_id, 'limite_semanal'::text, v_week_start, v_week_start + 6;
  else
    return query select v_subscription_id, v_plan_id, 'incluido'::text, v_week_start, v_week_start + 6;
  end if;
end;
$$;

-- Mantida para compatibilidade: um atendimento novo nessa data entraria no plano?
create or replace function private.subscription_covering(p_customer_id uuid, p_service_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pc.subscription_id
  from private.plan_coverage(p_customer_id, p_service_id, public.shop_local_ts(p_date, time '12:00')) pc;
$$;

-- Liquidação: além de vigente e em dia, respeita o limite semanal do benefício.
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

  -- Garante que as mensalidades até hoje existem antes de olhar o atraso.
  perform private.generate_subscription_payments(null, new.customer_id);

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

-- --- Views do painel (mesmas colunas; ignoram períodos anulados) ---

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
  (
    select pc.subscription_id
    from private.plan_coverage(a.customer_id, a.service_id, a.starts_at, a.id, a.created_at) pc
  ) is not null as covered_live,
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
    and cs.status <> 'cancelada'
    and cs.started_at <= public.shop_local_date(a.starts_at)
    and (cs.ended_at is null or cs.ended_at >= public.shop_local_date(a.starts_at))
  limit 1
) sub on true;

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
    and cs.status <> 'cancelada'
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

-- Lista da área "Assinantes" do painel (listSubscribers / SubscriberAccount): quem já
-- teve algum período de assinatura, com o plano atual (ou o último) e a situação de hoje.
create view public.subscriber_accounts
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.phone,
  sp.slug as plan_slug,
  sp.name as plan_name,
  private.subscriber_status(c.id, public.shop_today()) as status,
  first_sub.started_at as subscribed_since
from public.customers c
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

-- --- Painel: cadastro e situação do assinante ---

-- Admin logado ou a rotina de servidor que usa a service role.
create function private.can_manage_subscribers()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
$$;

-- Aplica plano e situação a partir de hoje (p_status: ativo, congelado ou inativo).
create function private.apply_subscription(p_customer_id uuid, p_plan_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := public.shop_today();
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
      insert into public.customer_subscriptions (customer_id, plan_id, status, started_at, ended_at)
      values (p_customer_id, p_plan_id, 'cancelada', v_today, v_today);
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

  insert into public.customer_subscriptions (customer_id, plan_id, status, started_at)
  values (p_customer_id, p_plan_id, v_target, v_today);
end;
$$;

-- createSubscriber / updateSubscriber: cria ou atualiza o cliente assinante. O login já
-- foi criado no Supabase Auth pela rotina de servidor; aqui só se liga o user_id. Um
-- cliente que já agendou como avulso vira assinante no mesmo cadastro.
create function public.save_subscriber(p_customer_id uuid, p_name text, p_phone text, p_user_id uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_id uuid;
begin
  if not private.can_manage_subscribers() then
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só o administrador gerencia assinantes.';
  end if;

  if char_length(v_name) not between 2 and 120 or v_phone !~ '^\d{10,11}$' then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Revise os dados do assinante.';
  end if;

  -- O telefone é o login: não pode ser de outro assinante (nem, na edição, de outro cliente).
  if exists (
    select 1
    from public.customers c
    where c.phone = v_phone
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
    insert into public.customers as c (name, phone, user_id)
    values (v_name, v_phone, p_user_id)
    on conflict (phone) do update
      set name = excluded.name,
          user_id = coalesce(excluded.user_id, c.user_id)
    returning c.id into v_id;
  else
    update public.customers
    set name = v_name,
        phone = v_phone,
        user_id = coalesce(p_user_id, user_id)
    where id = p_customer_id
    returning id into v_id;

    if v_id is null then
      raise exception using errcode = 'BC011', message = 'subscriber_not_found', hint = 'Assinante não encontrado.';
    end if;
  end if;

  return v_id;
end;
$$;

-- changeSubscriberPlan / changeSubscriberStatus: plano (slug) e situação a partir de hoje.
create function public.set_subscription(p_customer_id uuid, p_plan text, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  if not private.can_manage_subscribers() then
    raise exception using errcode = '42501', message = 'not_allowed', hint = 'Só o administrador gerencia assinantes.';
  end if;

  select id into v_plan_id from public.subscription_plans where slug = p_plan and is_active;

  if v_plan_id is null or coalesce(p_status, '') not in ('ativo', 'congelado', 'inativo') then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Plano ou situação inválidos.';
  end if;

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception using errcode = 'BC011', message = 'subscriber_not_found', hint = 'Assinante não encontrado.';
  end if;

  perform private.apply_subscription(p_customer_id, v_plan_id, p_status);
end;
$$;

-- --- Agendamento do assinante logado ---

-- Cliente ligado ao login atual. Nulo para quem não tem conta de assinante.
create function private.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.customers where user_id = (select auth.uid());
$$;

-- getSubscriberSession: assinante logado, no formato de SubscriberSession. Nulo se o
-- login não estiver ligado a um cliente com plano.
create function public.get_subscriber_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := public.shop_today();
  v_customer public.customers;
  v_plan_slug text;
  v_status text;
  v_active_id uuid;
begin
  select * into v_customer from public.customers where user_id = (select auth.uid());
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

-- fetchPlanCoverage: o plano do assinante logado cobre o serviço nesta data (PlanCoverage)?
create function public.get_plan_coverage(p_service text, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := private.current_customer_id();
  v_reason text;
  v_plan_id uuid;
  v_week_start date;
  v_week_end date;
begin
  if v_customer_id is null or p_date is null then
    return null;
  end if;

  select pc.reason, pc.plan_id, pc.week_start, pc.week_end
  into v_reason, v_plan_id, v_week_start, v_week_end
  from private.plan_coverage(
    v_customer_id,
    private.resolve_service(p_service),
    public.shop_local_ts(p_date, time '12:00')
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

-- Reserva o horário para um cliente já identificado. Mesma regra que estava em
-- create_reservation: o profissional mostrado na tela vai primeiro; com "qualquer",
-- os demais livres no horário entram em seguida.
create function private.book_site_appointment(
  p_customer_id uuid,
  p_service_id uuid,
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

  select ds.professional_ids into v_candidates
  from private.day_slots(p_service_id, p_professional, p_date) ds
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
      insert into public.appointments (
        customer_id, service_id, booked_professional_id, performed_by_id,
        requested_any_professional, starts_at, status, source, customer_notes
      )
      values (
        p_customer_id, p_service_id, v_candidate, v_candidate,
        p_professional = 'qualquer', v_start, 'agendado', 'site', p_notes
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

  return v_appointment_id;
end;
$$;

-- createReservation (quem não é assinante): mesma assinatura e comportamento, agora
-- usando o helper acima.
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
    v_customer_id, v_service_id, v_professional, p_date, p_time, p_assigned_professional, v_notes
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

-- createSubscriberReservation: o assinante logado reserva sem informar dados; o banco
-- usa o cadastro e diz se o plano cobre o atendimento (Reservation.plan).
create function public.create_subscriber_reservation(
  p_service text,
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
  v_service_id uuid := private.resolve_service(p_service);
  v_professional text := private.check_professional(p_professional);
  v_customer public.customers;
  v_appointment_id uuid;
  v_reason text;
  v_plan_id uuid;
begin
  select * into v_customer from public.customers where user_id = (select auth.uid());
  if not found then
    raise exception using
      errcode = 'BC011',
      message = 'subscriber_not_found',
      hint = 'Sua sessão de assinante terminou. Entre novamente para agendar.';
  end if;

  v_appointment_id := private.book_site_appointment(
    v_customer.id, v_service_id, v_professional, p_date, p_time, p_assigned_professional, null
  );

  select pc.reason, pc.plan_id into v_reason, v_plan_id
  from public.appointments a
  cross join lateral private.plan_coverage(a.customer_id, a.service_id, a.starts_at, a.id, a.created_at) pc
  where a.id = v_appointment_id;

  return private.reservation_json(v_appointment_id) || jsonb_build_object(
    'customer', jsonb_build_object(
      'name', v_customer.name,
      'phone', private.format_phone(v_customer.phone),
      'email', coalesce(v_customer.email, ''),
      'notes', '',
      'whatsappOptIn', v_customer.whatsapp_opt_in
    ),
    'plan', (
      select jsonb_build_object('id', sp.slug, 'name', sp.name, 'covered', v_reason = 'incluido')
      from public.subscription_plans sp
      where sp.id = v_plan_id
    )
  );
end;
$$;

-- --- Grants (mesmo padrão de …120400 e …120800) ---

revoke execute on function
  private.subscriber_status(uuid, date),
  private.plan_coverage(uuid, uuid, timestamptz, uuid, timestamptz),
  private.can_manage_subscribers(),
  private.apply_subscription(uuid, uuid, text),
  private.current_customer_id(),
  private.book_site_appointment(uuid, uuid, text, date, text, text, text)
from public, anon, authenticated;

-- As views do painel (security_invoker) chamam estas como o usuário da equipe.
grant execute on function
  private.subscriber_status(uuid, date),
  private.plan_coverage(uuid, uuid, timestamptz, uuid, timestamptz)
to authenticated;

revoke execute on function
  public.save_subscriber(uuid, text, text, uuid),
  public.set_subscription(uuid, text, text),
  public.get_subscriber_session(),
  public.get_plan_coverage(text, date),
  public.create_subscriber_reservation(text, text, date, text, text)
from public, anon;

-- Assinante logado (Supabase Auth).
grant execute on function
  public.get_subscriber_session(),
  public.get_plan_coverage(text, date),
  public.create_subscriber_reservation(text, text, date, text, text)
to authenticated;

-- Painel: as funções conferem se quem chama é admin ou a service role.
grant execute on function
  public.save_subscriber(uuid, text, text, uuid),
  public.set_subscription(uuid, text, text)
to authenticated, service_role;

revoke all on public.subscriber_accounts from anon, authenticated;
grant select on public.subscriber_accounts to authenticated;
