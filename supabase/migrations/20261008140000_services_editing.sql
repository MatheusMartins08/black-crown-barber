-- Edição do site (etapa 4): serviços editáveis pelo painel.
--
-- 1) services.deleted_at: exclusão lógica, igual à dos profissionais. Quem tem histórico
--    (atendimentos) não pode ser apagado (FK "restrict"): fica marcado como excluído e
--    inativo, some do site e das listas, e continua nos atendimentos e no fechamento.
-- 2) appointments.service_name: cópia do nome do serviço no momento da reserva (como já
--    acontece com price, ends_at, charged_amount e payout_amount). Renomear um serviço não
--    muda o nome nos atendimentos antigos. Preenchida por um trigger novo, só quando o
--    atendimento é criado ou troca de serviço; os atendimentos atuais recebem o nome atual.
-- 3) appointment_details: mesmas colunas; service_name passa a vir da cópia.
--
-- Nenhuma função ou trigger existente é alterado. Nada é apagado.

-- --- 1) Exclusão lógica de serviço ---

alter table public.services
  add column deleted_at timestamptz,
  add constraint services_deleted_inactive_check check (deleted_at is null or not is_active);

comment on column public.services.deleted_at is
  'Excluído pelo painel (fica só para o histórico). Nulo = serviço em uso, ativo ou inativo.';

-- --- 2) Nome do serviço copiado no atendimento ---

alter table public.appointments add column service_name text;

-- 25: depois do guard (10) e do prepare (20), antes da liquidação (30).
create function public.appointments_service_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id or new.service_name is null then
    select name into new.service_name from public.services where id = new.service_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.appointments_service_name() from public, anon, authenticated;

create trigger appointments_25_service_name before insert or update on public.appointments
  for each row execute function public.appointments_service_name();

-- Preenchimento único dos atendimentos existentes com o nome atual (o trigger acima
-- completa: service_name nulo recebe o nome do serviço).
update public.appointments set service_name = null where service_name is null;

alter table public.appointments alter column service_name set not null;

comment on column public.appointments.service_name is
  'Nome do serviço no momento da reserva (não muda se o serviço for renomeado).';

-- --- 3) View do painel: mesmas colunas, nome do serviço da cópia ---

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
