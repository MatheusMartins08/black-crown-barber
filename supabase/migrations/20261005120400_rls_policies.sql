-- Grants e Row Level Security.
--
-- Os privilégios padrão do Supabase concedem tudo a anon e authenticated em tabelas
-- novas de "public". Revogamos e concedemos só o necessário, para que o anon receba
-- erro de permissão (42501), e não zero linhas, nas tabelas privadas.
-- Tabelas criadas em migrations futuras precisam repetir esse cuidado.
--
-- "authenticated" não significa funcionário (o signup do Supabase vem aberto):
-- todo acesso da equipe passa por is_staff() / is_admin().

revoke all on all tables in schema public from anon, authenticated;

-- --- Grants ---

grant select on
  public.shop_settings,
  public.opening_hours,
  public.services,
  public.professionals,
  public.professional_services,
  public.subscription_plans,
  public.plan_services
to anon;

grant select, insert, update, delete on
  public.shop_settings,
  public.payroll_settings,
  public.opening_hours,
  public.services,
  public.service_payouts,
  public.professionals,
  public.professional_services,
  public.subscription_plans,
  public.plan_services,
  public.staff_members,
  public.customers,
  public.customer_subscriptions,
  public.schedule_blocks,
  public.appointments
to authenticated;

grant select on public.appointment_details to authenticated;

-- --- RLS ---

alter table public.shop_settings enable row level security;
alter table public.payroll_settings enable row level security;
alter table public.opening_hours enable row level security;
alter table public.services enable row level security;
alter table public.service_payouts enable row level security;
alter table public.professionals enable row level security;
alter table public.professional_services enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.plan_services enable row level security;
alter table public.staff_members enable row level security;
alter table public.customers enable row level security;
alter table public.customer_subscriptions enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.appointments enable row level security;

-- Escrita só do admin: mesma política em todas as tabelas de catálogo e cadastro.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'shop_settings', 'payroll_settings', 'opening_hours', 'services', 'service_payouts',
    'professionals', 'professional_services', 'subscription_plans', 'plan_services',
    'staff_members', 'customers', 'customer_subscriptions'
  ] loop
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))',
      v_table || '_admin_insert', v_table);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      v_table || '_admin_update', v_table);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))',
      v_table || '_admin_delete', v_table);
  end loop;
end;
$$;

-- --- Leitura pública ---

create policy shop_settings_select on public.shop_settings
  for select to anon, authenticated using (true);

create policy opening_hours_select on public.opening_hours
  for select to anon, authenticated using (true);

create policy services_select on public.services
  for select to anon, authenticated
  using (is_active or (select public.is_staff()));

create policy professionals_select on public.professionals
  for select to anon, authenticated
  using (is_active or (select public.is_staff()));

create policy professional_services_select on public.professional_services
  for select to anon, authenticated
  using (
    (select public.is_staff())
    or (
      exists (select 1 from public.professionals p where p.id = professional_id and p.is_active)
      and exists (select 1 from public.services s where s.id = service_id and s.is_active)
    )
  );

create policy subscription_plans_select on public.subscription_plans
  for select to anon, authenticated
  using (is_active or (select public.is_staff()));

create policy plan_services_select on public.plan_services
  for select to anon, authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.subscription_plans sp where sp.id = plan_id and sp.is_active)
  );

-- --- Só a equipe ---

create policy payroll_settings_select on public.payroll_settings
  for select to authenticated using ((select public.is_staff()));

create policy service_payouts_select on public.service_payouts
  for select to authenticated using ((select public.is_staff()));

create policy customers_select on public.customers
  for select to authenticated using ((select public.is_staff()));

create policy customer_subscriptions_select on public.customer_subscriptions
  for select to authenticated using ((select public.is_staff()));

create policy staff_members_select on public.staff_members
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Bloqueios: toda a equipe vê a agenda; cada barbeiro mexe nos próprios.
create policy schedule_blocks_select on public.schedule_blocks
  for select to authenticated using ((select public.is_staff()));

create policy schedule_blocks_insert on public.schedule_blocks
  for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_staff()) and professional_id = (select public.current_professional_id()))
  );

create policy schedule_blocks_update on public.schedule_blocks
  for update to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_staff()) and professional_id = (select public.current_professional_id()))
  )
  with check (
    (select public.is_admin())
    or ((select public.is_staff()) and professional_id = (select public.current_professional_id()))
  );

create policy schedule_blocks_delete on public.schedule_blocks
  for delete to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_staff()) and professional_id = (select public.current_professional_id()))
  );

-- Agendamentos: o site só entra pelas RPCs. A equipe vê a agenda inteira, lança
-- atendimentos do painel/balcão e atualiza os horários em que é booked ou executor
-- (o trigger appointments_guard limita as colunas). Pode repassar o atendimento a
-- outro profissional, por isso o WITH CHECK do update só exige ser da equipe.
create policy appointments_select on public.appointments
  for select to authenticated using ((select public.is_staff()));

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check (
    (select public.is_admin())
    or ((select public.is_staff()) and source <> 'site')
  );

create policy appointments_update on public.appointments
  for update to authenticated
  using (
    (select public.is_admin())
    or booked_professional_id = (select public.current_professional_id())
    or performed_by_id = (select public.current_professional_id())
  )
  with check ((select public.is_staff()));

create policy appointments_delete on public.appointments
  for delete to authenticated using ((select public.is_admin()));
