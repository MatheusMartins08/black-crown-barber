-- Edição do site (etapa 5): planos editáveis pelo painel.
--
-- 1) subscription_plans.description e deleted_at (exclusão lógica, igual à de serviços e
--    profissionais). Inativo = some das opções para novos assinantes; quem já assina
--    continua com o plano e os benefícios.
-- 2) plan_services.period: benefício semanal ("X por semana", segunda a domingo, como hoje)
--    ou mensal ("X por mês", no ciclo da mensalidade: started_at + k meses). weekly_limit
--    passa a ser a quantidade do período (1–7 semanal, 1–31 mensal). Os benefícios atuais
--    ficam semanais (padrão).
-- 3) Leitura pública de planos: inativos não excluídos continuam visíveis (o assinante de
--    um plano inativado precisa ver o próprio plano no agendamento). Planos não têm dado
--    sensível; escrita continua só do admin.
-- 4) private.plan_coverage: mesma assinatura e colunas. Para benefícios semanais o resultado
--    é idêntico ao anterior; para mensais, a janela é o ciclo da mensalidade e o motivo de
--    estouro é 'limite_mensal'. week_start/week_end passam a significar início/fim da janela.
-- 5) set_subscription: aceita o plano atual do cliente mesmo inativo (congelar/reativar quem
--    está num plano inativado); assinatura nova continua só em plano ativo.
--
-- Atendimentos concluídos guardam a cobertura gravada (appointments_settle) e não são
-- recalculados. Mensalidades guardam o valor do ciclo. Nada é apagado.

-- --- 1) Planos: descrição e exclusão lógica ---

alter table public.subscription_plans
  add column description text check (char_length(description) <= 240),
  add column deleted_at timestamptz,
  add constraint subscription_plans_deleted_inactive_check check (deleted_at is null or not is_active);

comment on column public.subscription_plans.deleted_at is
  'Excluído pelo painel (fica só para o histórico de assinaturas e mensalidades).';

-- --- 2) Benefício semanal ou mensal ---

alter table public.plan_services
  add column period text not null default 'semana' check (period in ('semana', 'mes'));

alter table public.plan_services drop constraint plan_services_weekly_limit_check;

alter table public.plan_services
  add constraint plan_services_limit_check check (
    (period = 'semana' and weekly_limit between 1 and 7)
    or (period = 'mes' and weekly_limit between 1 and 31)
  );

comment on column public.plan_services.weekly_limit is
  'Quantas vezes o serviço está incluído no período (period): por semana (segunda a domingo) ou por mês (ciclo da mensalidade).';
comment on column public.plan_services.period is
  'semana: segunda a domingo. mes: ciclo da mensalidade (dia de início da assinatura + k meses).';

-- --- 3) Leitura: planos inativos não excluídos continuam visíveis ---

alter policy subscription_plans_select on public.subscription_plans
  to authenticated using (deleted_at is null or (select private.is_staff()));

alter policy subscription_plans_select_anon on public.subscription_plans
  to anon using (deleted_at is null);

alter policy plan_services_select on public.plan_services
  to authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.subscription_plans sp where sp.id = plan_id and sp.deleted_at is null)
  );

alter policy plan_services_select_anon on public.plan_services
  to anon
  using (exists (select 1 from public.subscription_plans sp where sp.id = plan_id and sp.deleted_at is null));

-- --- 4) Cobertura: janela semanal (igual a antes) ou ciclo da mensalidade ---

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
    -- Ciclo da mensalidade que contém a data: [started_at + k meses, started_at + k+1 meses).
    -- Mesma âncora de private.generate_subscription_payments (31/01 + 1 mês = 28/02).
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

  select count(*)::integer into v_used
  from public.appointments a
  where a.customer_id = p_customer_id
    and a.service_id = p_service_id
    and a.id is distinct from p_appointment_id
    and a.starts_at >= public.shop_local_ts(v_window_start, time '00:00')
    and a.starts_at < public.shop_local_ts(v_window_end + 1, time '00:00')
    and (
      (a.status = 'agendado' and a.created_at < v_booked_at)
      or (a.status = 'concluido' and a.covered_by_plan)
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

-- --- 5) Plano atual do cliente aceito mesmo inativo ---

create or replace function public.set_subscription(p_customer_id uuid, p_plan text, p_status text)
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

  -- Plano ativo, ou o plano do período em aberto do cliente (mesmo que tenha sido inativado
  -- depois): assim dá para congelar ou reativar quem já está nele. Excluído, nunca.
  select sp.id into v_plan_id
  from public.subscription_plans sp
  where sp.slug = p_plan
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

  if not exists (select 1 from public.customers where id = p_customer_id) then
    raise exception using errcode = 'BC011', message = 'subscriber_not_found', hint = 'Assinante não encontrado.';
  end if;

  perform private.apply_subscription(p_customer_id, v_plan_id, p_status);
end;
$$;
