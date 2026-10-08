-- Vários serviços no mesmo agendamento (passo A de 2): estruturas novas, só aditivo.
--
--   appointment_services  serviços de cada agendamento, com cópia do momento da reserva
--                         (nome, preço, duração) e, ao concluir, a liquidação de cada
--                         serviço (plano cobriu?, cobrado, repasse). O agendamento
--                         (appointments) continua sendo um só e guarda os totais.
--   service_components    combos: quais serviços simples um serviço inclui
--                         (Corte + barba = Corte + Barba). Ids estáveis, sem regra por nome.
--
-- Os 9 atendimentos existentes ganham 1 item cada, com os valores que já têm. Nenhuma linha
-- de appointments é alterada. Rollback: apagar as duas tabelas novas.

-- --- Serviços do agendamento ---

create table public.appointment_services (
  -- Conferida só no fim da transação: a reserva grava os itens e depois o agendamento, para
  -- o banco calcular preço e duração totais a partir dos itens (appointments_prepare).
  appointment_id uuid not null references public.appointments (id) on delete cascade deferrable initially deferred,
  service_id uuid not null references public.services (id) on delete restrict,
  position smallint not null check (position between 1 and 5),
  -- Cópias do momento da reserva: mudar o catálogo não altera o histórico.
  service_name text not null,
  price numeric(10, 2) not null check (price >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  -- Liquidação por serviço, gravada ao concluir (nula enquanto não concluído).
  covered_by_plan boolean,
  subscription_id uuid references public.customer_subscriptions (id) on delete restrict,
  charged_amount numeric(10, 2) check (charged_amount >= 0),
  payout_amount numeric(10, 2) check (payout_amount >= 0),
  created_at timestamptz not null default now(),
  primary key (appointment_id, service_id),
  unique (appointment_id, position)
);

comment on table public.appointment_services is
  'Serviços de cada agendamento (1 a 5), com preço, duração e nome copiados na reserva e a liquidação de cada um ao concluir.';

create index appointment_services_service_id_idx on public.appointment_services (service_id);
create index appointment_services_subscription_id_idx on public.appointment_services (subscription_id);

-- 1 item por atendimento existente, com os valores que ele já tem.
insert into public.appointment_services (
  appointment_id, service_id, position, service_name, price, duration_minutes,
  covered_by_plan, subscription_id, charged_amount, payout_amount, created_at
)
select
  a.id, a.service_id, 1, a.service_name, a.price,
  (extract(epoch from a.ends_at - a.starts_at) / 60)::integer,
  a.covered_by_plan, a.subscription_id, a.charged_amount, a.payout_amount, a.created_at
from public.appointments a;

-- Confere agora a FK adiada do preenchimento (senão o alter table abaixo é recusado).
set constraints all immediate;

-- --- Combos ---

create table public.service_components (
  service_id uuid not null references public.services (id) on delete cascade,
  component_id uuid not null references public.services (id) on delete cascade,
  primary key (service_id, component_id),
  check (service_id <> component_id)
);

comment on table public.service_components is
  'Combos: serviço (service_id) que já inclui outros serviços simples (component_id). Dois serviços escolhidos que cobrem o mesmo serviço simples entram em conflito.';

create index service_components_component_id_idx on public.service_components (component_id);

-- Sem aninhamento: componente não pode ser combo, e combo não pode ser componente.
create function private.service_components_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.service_components where service_id = new.component_id)
    or exists (select 1 from public.service_components where component_id = new.service_id) then
    raise exception using
      errcode = 'BC001',
      message = 'invalid_request',
      hint = 'Um combo só pode incluir serviços simples.';
  end if;
  return new;
end;
$$;

revoke execute on function private.service_components_check() from public, anon, authenticated;

create trigger service_components_check before insert or update on public.service_components
  for each row execute function private.service_components_check();

insert into public.service_components (service_id, component_id)
select combo.id, part.id
from public.services combo
join public.services part on part.slug in ('corte', 'barba')
where combo.slug = 'corte-barba';

-- --- Grants e RLS (mesmo padrão de …120400_rls_policies) ---

revoke all on public.appointment_services, public.service_components from anon, authenticated;
-- Itens: a equipe lê; ninguém grava direto (só as funções da agenda, como security definer).
grant select on public.appointment_services to authenticated;
-- Combos: leitura pública (o agendamento confere conflitos na tela); escrita só do admin.
grant select on public.service_components to anon, authenticated;
grant insert, delete on public.service_components to authenticated;

alter table public.appointment_services enable row level security;
alter table public.service_components enable row level security;

create policy appointment_services_select on public.appointment_services
  for select to authenticated using ((select private.is_staff()));

create policy service_components_select on public.service_components
  for select to anon, authenticated using (true);
create policy service_components_admin_insert on public.service_components
  for insert to authenticated with check ((select private.is_admin()));
create policy service_components_admin_delete on public.service_components
  for delete to authenticated using ((select private.is_admin()));
