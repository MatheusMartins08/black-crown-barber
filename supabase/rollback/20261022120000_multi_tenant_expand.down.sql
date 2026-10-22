-- Reversão da etapa 2 (multi_tenant_expand). Gerado por diff do esquema antes/depois da expansão.
-- Só vale ANTES da etapa 4 (com uma única loja). Rodar no SQL Editor depois de backup.
-- Os dados permanecem (a coluna shop_id é removida; tudo era da Black Crown).

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = public, extensions;

do $$
begin
  if exists (select 1 from public.shops where id <> 'b1ac0c00-0000-4000-8000-000000000001') then
    raise exception 'reversão bloqueada: já existe mais de uma loja';
  end if;
end;
$$;

-- Cron original
select cron.schedule('generate-subscription-payments', '0 6 * * *', 'select private.generate_subscription_payments()');
select cron.schedule('purge-expired-history', '30 6 * * *', 'select private.purge_expired_history()');

-- Policies
drop policy service_components_select_authenticated on public.service_components;
drop policy site_images_select_authenticated on public.site_images;
alter policy shop_settings_admin_insert on public.shop_settings to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy shop_settings_admin_update on public.shop_settings to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy shop_settings_admin_delete on public.shop_settings to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy payroll_settings_admin_insert on public.payroll_settings to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy payroll_settings_admin_update on public.payroll_settings to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy payroll_settings_admin_delete on public.payroll_settings to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy opening_hours_admin_insert on public.opening_hours to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy opening_hours_admin_update on public.opening_hours to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy opening_hours_admin_delete on public.opening_hours to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy services_admin_insert on public.services to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy services_admin_update on public.services to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy services_admin_delete on public.services to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy service_payouts_admin_insert on public.service_payouts to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy service_payouts_admin_update on public.service_payouts to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy service_payouts_admin_delete on public.service_payouts to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy professionals_admin_insert on public.professionals to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy professionals_admin_update on public.professionals to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy professionals_admin_delete on public.professionals to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy professional_services_admin_insert on public.professional_services to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy professional_services_admin_update on public.professional_services to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy professional_services_admin_delete on public.professional_services to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy subscription_plans_admin_insert on public.subscription_plans to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy subscription_plans_admin_update on public.subscription_plans to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy subscription_plans_admin_delete on public.subscription_plans to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy plan_services_admin_insert on public.plan_services to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy plan_services_admin_update on public.plan_services to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy plan_services_admin_delete on public.plan_services to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy staff_members_admin_insert on public.staff_members to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy staff_members_admin_update on public.staff_members to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy staff_members_admin_delete on public.staff_members to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy customers_admin_insert on public.customers to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy customers_admin_update on public.customers to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy customers_admin_delete on public.customers to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy customer_subscriptions_admin_insert on public.customer_subscriptions to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy customer_subscriptions_admin_update on public.customer_subscriptions to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy customer_subscriptions_admin_delete on public.customer_subscriptions to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy shop_settings_select on public.shop_settings to anon, authenticated
  using (true);
alter policy opening_hours_select on public.opening_hours to anon, authenticated
  using (true);
alter policy staff_members_select on public.staff_members to authenticated
  using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));
alter policy customers_select on public.customers to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy schedule_blocks_select on public.schedule_blocks to authenticated
  using (( SELECT private.is_staff() AS is_staff));
alter policy schedule_blocks_insert on public.schedule_blocks to authenticated
  with check ((( SELECT private.is_admin() AS is_admin) OR (( SELECT private.is_staff() AS is_staff) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy schedule_blocks_update on public.schedule_blocks to authenticated
  using ((( SELECT private.is_admin() AS is_admin) OR (( SELECT private.is_staff() AS is_staff) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))))
  with check ((( SELECT private.is_admin() AS is_admin) OR (( SELECT private.is_staff() AS is_staff) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy schedule_blocks_delete on public.schedule_blocks to authenticated
  using ((( SELECT private.is_admin() AS is_admin) OR (( SELECT private.is_staff() AS is_staff) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy appointments_delete on public.appointments to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy services_select on public.services to authenticated
  using ((is_active OR ( SELECT private.is_staff() AS is_staff)));
alter policy services_select_anon on public.services to anon
  using (is_active);
alter policy professionals_select on public.professionals to authenticated
  using ((is_active OR ( SELECT private.is_staff() AS is_staff)));
alter policy professionals_select_anon on public.professionals to anon
  using (is_active);
alter policy professional_services_select on public.professional_services to authenticated
  using ((( SELECT private.is_staff() AS is_staff) OR ((EXISTS ( SELECT 1
   FROM professionals p
  WHERE ((p.id = professional_services.professional_id) AND p.is_active))) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = professional_services.service_id) AND s.is_active))))));
alter policy professional_services_select_anon on public.professional_services to anon
  using (((EXISTS ( SELECT 1
   FROM professionals p
  WHERE ((p.id = professional_services.professional_id) AND p.is_active))) AND (EXISTS ( SELECT 1
   FROM services s
  WHERE ((s.id = professional_services.service_id) AND s.is_active)))));
alter policy subscription_payments_admin_insert on public.subscription_payments to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy subscription_payments_admin_update on public.subscription_payments to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy subscription_payments_admin_delete on public.subscription_payments to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy opening_periods_select on public.opening_periods to anon, authenticated
  using ((professional_id IS NULL));
alter policy site_images_select on public.site_images to anon, authenticated
  using (true);
alter policy site_images_admin_update on public.site_images to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy site_media_admin_select on storage.objects to authenticated
  using (((bucket_id = 'site-media'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['barbers'::text, 'gallery'::text, 'barbershop'::text])) AND ( SELECT private.is_admin() AS is_admin)));
alter policy site_media_admin_insert on storage.objects to authenticated
  with check (((bucket_id = 'site-media'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['barbers'::text, 'gallery'::text, 'barbershop'::text])) AND ( SELECT private.is_admin() AS is_admin)));
alter policy site_media_admin_update on storage.objects to authenticated
  using (((bucket_id = 'site-media'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['barbers'::text, 'gallery'::text, 'barbershop'::text])) AND ( SELECT private.is_admin() AS is_admin)))
  with check (((bucket_id = 'site-media'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['barbers'::text, 'gallery'::text, 'barbershop'::text])) AND ( SELECT private.is_admin() AS is_admin)));
alter policy site_media_admin_delete on storage.objects to authenticated
  using (((bucket_id = 'site-media'::text) AND ((storage.foldername(name))[1] = ANY (ARRAY['barbers'::text, 'gallery'::text, 'barbershop'::text])) AND ( SELECT private.is_admin() AS is_admin)));
alter policy subscription_plans_select on public.subscription_plans to authenticated
  using (((deleted_at IS NULL) OR ( SELECT private.is_staff() AS is_staff)));
alter policy subscription_plans_select_anon on public.subscription_plans to anon
  using ((deleted_at IS NULL));
alter policy plan_services_select on public.plan_services to authenticated
  using ((( SELECT private.is_staff() AS is_staff) OR (EXISTS ( SELECT 1
   FROM subscription_plans sp
  WHERE ((sp.id = plan_services.plan_id) AND (sp.deleted_at IS NULL))))));
alter policy plan_services_select_anon on public.plan_services to anon
  using ((EXISTS ( SELECT 1
   FROM subscription_plans sp
  WHERE ((sp.id = plan_services.plan_id) AND (sp.deleted_at IS NULL)))));
alter policy schedule_exceptions_select on public.schedule_exceptions to authenticated
  using (( SELECT private.is_staff() AS is_staff));
alter policy opening_periods_editor_delete on public.opening_periods to authenticated
  using ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy service_components_select on public.service_components to anon, authenticated
  using (true);
alter policy service_components_admin_insert on public.service_components to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy service_components_admin_delete on public.service_components to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy appointments_select on public.appointments to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy appointment_services_select on public.appointment_services to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy customer_subscriptions_select on public.customer_subscriptions to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy subscription_payments_select on public.subscription_payments to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy payroll_settings_select on public.payroll_settings to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy service_payouts_select on public.service_payouts to authenticated
  using (( SELECT private.is_admin() AS is_admin));
alter policy appointments_insert on public.appointments to authenticated
  with check (( SELECT private.is_admin() AS is_admin));
alter policy appointments_update on public.appointments to authenticated
  using (( SELECT private.is_admin() AS is_admin))
  with check (( SELECT private.is_admin() AS is_admin));
alter policy opening_periods_select_staff on public.opening_periods to authenticated
  using (( SELECT private.is_staff() AS is_staff));
alter policy opening_periods_editor_insert on public.opening_periods to authenticated
  with check ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy opening_periods_editor_update on public.opening_periods to authenticated
  using ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))))
  with check ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy schedule_exceptions_editor_insert on public.schedule_exceptions to authenticated
  with check ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy schedule_exceptions_editor_update on public.schedule_exceptions to authenticated
  using ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))))
  with check ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));
alter policy schedule_exceptions_editor_delete on public.schedule_exceptions to authenticated
  using ((( SELECT private.is_admin() AS is_admin) OR ((professional_id IS NOT NULL) AND (professional_id = ( SELECT private.current_professional_id() AS current_professional_id)))));

-- Views (recriadas no fim)
drop view public.appointment_details;
drop view public.customer_profiles;
drop view public.subscriber_accounts;

-- FKs simples de volta
alter table public.service_payouts drop constraint service_payouts_service_id_fkey, add constraint service_payouts_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
alter table public.professional_services drop constraint professional_services_professional_id_fkey, add constraint professional_services_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE;
alter table public.professional_services drop constraint professional_services_service_id_fkey, add constraint professional_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
alter table public.plan_services drop constraint plan_services_plan_id_fkey, add constraint plan_services_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE;
alter table public.plan_services drop constraint plan_services_service_id_fkey, add constraint plan_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;
alter table public.staff_members drop constraint staff_members_professional_id_fkey, add constraint staff_members_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE SET NULL;
alter table public.customer_subscriptions drop constraint customer_subscriptions_plan_id_fkey, add constraint customer_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT;
alter table public.customer_subscriptions drop constraint customer_subscriptions_customer_id_fkey, add constraint customer_subscriptions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
alter table public.schedule_blocks drop constraint schedule_blocks_professional_id_fkey, add constraint schedule_blocks_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE;
alter table public.appointments drop constraint appointments_customer_id_fkey, add constraint appointments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
alter table public.appointments drop constraint appointments_service_id_fkey, add constraint appointments_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;
alter table public.appointments drop constraint appointments_booked_professional_id_fkey, add constraint appointments_booked_professional_id_fkey FOREIGN KEY (booked_professional_id) REFERENCES professionals(id) ON DELETE RESTRICT;
alter table public.appointments drop constraint appointments_performed_by_id_fkey, add constraint appointments_performed_by_id_fkey FOREIGN KEY (performed_by_id) REFERENCES professionals(id) ON DELETE RESTRICT;
alter table public.appointments drop constraint appointments_subscription_id_fkey, add constraint appointments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id) ON DELETE RESTRICT;
alter table public.subscription_payments drop constraint subscription_payments_subscription_id_fkey, add constraint subscription_payments_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id) ON DELETE RESTRICT;
alter table public.appointment_services drop constraint appointment_services_appointment_id_fkey, add constraint appointment_services_appointment_id_fkey FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;
alter table public.appointment_services drop constraint appointment_services_service_id_fkey, add constraint appointment_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE RESTRICT;
alter table public.appointment_services drop constraint appointment_services_subscription_id_fkey, add constraint appointment_services_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES customer_subscriptions(id) ON DELETE RESTRICT;
alter table public.service_components drop constraint service_components_service_id_fkey, add constraint service_components_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE;
alter table public.service_components drop constraint service_components_component_id_fkey, add constraint service_components_component_id_fkey FOREIGN KEY (component_id) REFERENCES services(id) ON DELETE CASCADE;
alter table public.opening_periods drop constraint opening_periods_professional_id_fkey, add constraint opening_periods_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE;
alter table public.schedule_exceptions drop constraint schedule_exceptions_professional_id_fkey, add constraint schedule_exceptions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES professionals(id) ON DELETE CASCADE;

-- Colunas e triggers da loja
drop trigger lock_shop_id on public.shop_settings;
drop trigger lock_shop_id on public.payroll_settings;
drop trigger lock_shop_id on public.services;
drop trigger lock_shop_id on public.professionals;
drop trigger lock_shop_id on public.subscription_plans;
drop trigger lock_shop_id on public.service_payouts;
drop trigger lock_shop_id on public.service_components;
drop trigger lock_shop_id on public.professional_services;
drop trigger lock_shop_id on public.plan_services;
drop trigger lock_shop_id on public.staff_members;
drop trigger lock_shop_id on public.customers;
drop trigger lock_shop_id on public.customer_subscriptions;
drop trigger lock_shop_id on public.subscription_payments;
drop trigger lock_shop_id on public.appointments;
drop trigger lock_shop_id on public.appointment_services;
drop trigger lock_shop_id on public.schedule_blocks;
drop trigger lock_shop_id on public.opening_periods;
drop trigger lock_shop_id on public.schedule_exceptions;
drop trigger lock_shop_id on public.site_images;
drop trigger customer_subscriptions_05_started_at on public.customer_subscriptions;
alter table public.shop_settings drop column shop_id;
alter table public.payroll_settings drop column shop_id;
alter table public.services drop column shop_id;
alter table public.professionals drop column shop_id;
alter table public.subscription_plans drop column shop_id;
alter table public.service_payouts drop column shop_id;
alter table public.service_components drop column shop_id;
alter table public.professional_services drop column shop_id;
alter table public.plan_services drop column shop_id;
alter table public.staff_members drop column shop_id;
alter table public.customers drop column shop_id;
alter table public.customer_subscriptions drop column shop_id;
alter table public.subscription_payments drop column shop_id;
alter table public.appointments drop column shop_id;
alter table public.appointment_services drop column shop_id;
alter table public.schedule_blocks drop column shop_id;
alter table public.opening_periods drop column shop_id;
alter table public.schedule_exceptions drop column shop_id;
alter table public.site_images drop column shop_id;
alter table public.shop_settings drop column maps_url;

-- Funções novas saem; as alteradas voltam ao texto original
drop function shop_local_date(uuid,timestamp with time zone);
drop function staff_context();
drop function get_subscriber_session(uuid);
drop function private.lock_shop_id();
drop function private.customer_subscriptions_started_at();
drop function private.day_periods(uuid,date);
drop function private.day_blocks(uuid,date);
drop function private.day_slots(uuid,uuid[],text,date);
drop function private.check_professional(uuid,text);
drop function private.resolve_service(uuid,text);
drop function private.resolve_services(uuid,text[]);
drop function private.can_manage_subscribers(uuid);
drop function private.history_cutoff(uuid);
drop function shop_today(uuid);
drop function shop_timezone(uuid);
drop function resolve_shop_host(text);
drop function resolve_shop_slug(text);
drop function get_shop_profile(uuid);
drop function get_day_availability(uuid,text[],text,date);
drop function shop_local_ts(uuid,date,time without time zone);
drop function get_day_summaries(uuid,text[],text,date,integer);
drop function find_next_available(uuid,text[],text,date);
drop function create_reservation(uuid,text[],text,date,text,text,text,text,text,text,boolean);
drop function get_reservation(uuid,text,text);
drop function cancel_reservation(uuid,text,text);
drop function shop_now(uuid);
drop function get_plan_coverage(uuid,text,date);
drop function create_subscriber_reservation(uuid,text[],text,date,text,text);
drop function save_subscriber(uuid,uuid,text,text,uuid);
drop function set_subscription(uuid,uuid,text,text);
drop function private.assert_shop(uuid,text);
drop function private.staff_write_shop_id();
drop function private.admin_shop_id();
drop function private.admin_write_shop_id();
drop function private.customer_shop_id();
drop function private.legacy_shop_id();
drop function private.default_shop_id();
drop function private.staff_shop_id();
CREATE OR REPLACE FUNCTION public.appointments_prepare()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.appointments_settle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.resolve_service(p_slug text)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  select id into v_id from public.services where slug = p_slug and is_active;
  if v_id is null then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Serviço inválido.';
  end if;
  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION private.check_professional(p_choice text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if p_choice = 'qualquer' or exists (select 1 from public.professionals where slug = p_choice and is_active) then
    return p_choice;
  end if;
  raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Profissional inválido.';
end;
$function$;
CREATE OR REPLACE FUNCTION private.reservation_json(p_appointment_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.get_reservation(p_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.reservation_json(a.id)
  from public.appointments a
  join public.customers c on c.id = a.customer_id
  where a.code = upper(btrim(p_code))
    and c.phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
$function$;
CREATE OR REPLACE FUNCTION public.cancel_reservation(p_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.shop_timezone()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce((select timezone from public.shop_settings where id = 1), 'America/Sao_Paulo');
$function$;
CREATE OR REPLACE FUNCTION private.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.staff_members where user_id = (select auth.uid()) and is_active
  );
$function$;
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.staff_members where user_id = (select auth.uid()) and role = 'admin' and is_active
  );
$function$;
CREATE OR REPLACE FUNCTION private.professional_day_periods(p_professional_id uuid, p_date date)
 RETURNS TABLE(opens_at time without time zone, closes_at time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select distinct greatest(o.opens_at, s.opens_at), least(o.closes_at, s.closes_at)
  from private.professional_own_day_periods(p_professional_id, p_date) o
  join private.day_periods(p_date) s
    on greatest(o.opens_at, s.opens_at) < least(o.closes_at, s.closes_at);
$function$;
CREATE OR REPLACE FUNCTION private.professional_day_blocks(p_professional_id uuid, p_date date)
 RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select b.starts_at, b.ends_at from private.day_blocks(p_date) b
  union all
  select b.starts_at, b.ends_at from private.professional_own_day_blocks(p_professional_id, p_date) b;
$function$;
CREATE OR REPLACE FUNCTION private.subscription_covering(p_customer_id uuid, p_service_id uuid, p_date date)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select pc.subscription_id
  from private.plan_coverage(p_customer_id, p_service_id, public.shop_local_ts(p_date, time '12:00')) pc;
$function$;
CREATE OR REPLACE FUNCTION private.subscription_in_good_standing(p_subscription_id uuid, p_date date)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists (
    select 1
    from public.subscription_payments sp
    where sp.subscription_id = p_subscription_id
      and sp.status = 'pendente'
      and sp.due_date + (select subscription_grace_days from public.shop_settings where id = 1) < p_date
  );
$function$;
CREATE OR REPLACE FUNCTION private.current_professional_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select professional_id from public.staff_members where user_id = (select auth.uid()) and is_active;
$function$;
CREATE OR REPLACE FUNCTION private.generate_subscription_payments(p_until date DEFAULT NULL::date, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.can_manage_subscribers()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.is_admin() or coalesce((select auth.jwt()) ->> 'role', '') = 'service_role';
$function$;
CREATE OR REPLACE FUNCTION private.apply_subscription(p_customer_id uuid, p_plan_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.plan_coverage(p_customer_id uuid, p_service_id uuid, p_starts_at timestamp with time zone, p_appointment_id uuid DEFAULT NULL::uuid, p_booked_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(subscription_id uuid, plan_id uuid, reason text, week_start date, week_end date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.purge_expired_history()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cutoff date := private.history_cutoff();
  v_cutoff_at timestamptz := public.shop_local_ts(v_cutoff, time '00:00');
  v_appointments integer;
  v_blocks integer;
begin
  delete from public.appointments where starts_at < v_cutoff_at;
  get diagnostics v_appointments = row_count;

  -- Intervalo [starts_at, ends_at): terminar à meia-noite do corte é terminar antes dele.
  delete from public.schedule_blocks where ends_at <= v_cutoff_at;
  get diagnostics v_blocks = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'appointments', v_appointments,
    'schedule_blocks', v_blocks
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_subscriber_session()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.get_plan_coverage(p_service text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.save_subscriber(p_customer_id uuid, p_name text, p_phone text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.history_cutoff()
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (
    public.shop_today()
    - make_interval(months => coalesce((select history_retention_months from public.shop_settings where id = 1), 6))
  )::date;
$function$;
CREATE OR REPLACE FUNCTION public.set_subscription(p_customer_id uuid, p_plan text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.day_periods(p_date date)
 RETURNS TABLE(opens_at time without time zone, closes_at time without time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.day_blocks(p_date date)
 RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.shop_local_ts(p_date, e.opens_at), public.shop_local_ts(p_date, e.closes_at)
  from public.schedule_exceptions e
  where e.professional_id is null
    and e.kind = 'bloqueio'
    and p_date between e.starts_on and e.ends_on;
$function$;
CREATE OR REPLACE FUNCTION private.day_slots(p_service_ids uuid[], p_professional text, p_date date)
 RETURNS TABLE(slot_start timestamp with time zone, professional_ids uuid[], professional_slugs text[])
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.resolve_services(p_services text[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.free_slots(p_service_ids uuid[], p_professional_id uuid, p_date date)
 RETURNS TABLE(slot_start timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.book_site_appointment(p_customer_id uuid, p_service_ids uuid[], p_professional text, p_date date, p_time text, p_assigned_professional text, p_notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.appointments_sync_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.get_day_availability(p_services text[], p_professional text, p_date date)
 RETURNS TABLE(slot_time text, professional_slugs text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select to_char(ds.slot_start at time zone public.shop_timezone(), 'HH24:MI'), ds.professional_slugs
  from private.day_slots(private.resolve_services(p_services), private.check_professional(p_professional), p_date) ds
  order by ds.slot_start;
$function$;
CREATE OR REPLACE FUNCTION public.find_next_available(p_services text[], p_professional text, p_from date)
 RETURNS TABLE(day date, slot_time text, professional_slugs text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.create_reservation(p_services text[], p_professional text, p_date date, p_time text, p_assigned_professional text, p_name text, p_phone text, p_email text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_whatsapp_opt_in boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.create_subscriber_reservation(p_services text[], p_professional text, p_date date, p_time text, p_assigned_professional text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.get_day_summaries(p_services text[], p_professional text, p_start date, p_days integer)
 RETURNS TABLE(day date, status text, available_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.get_team_agenda(p_start date, p_end date, p_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, code text, status appointment_status, local_date date, local_time text, starts_at timestamp with time zone, duration_minutes integer, customer_name text, items jsonb, booked_professional_id uuid, booked_professional_name text, performed_by_id uuid, performed_by_name text, requested_any_professional boolean, plan_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.update_team_appointment(p_id uuid, p_status appointment_status DEFAULT NULL::appointment_status, p_performed_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION private.professional_own_day_blocks(p_professional_id uuid, p_date date)
 RETURNS TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.shop_local_ts(p_date, e.opens_at), public.shop_local_ts(p_date, e.closes_at)
  from public.schedule_exceptions e
  where e.professional_id = p_professional_id
    and e.kind = 'bloqueio'
    and p_date between e.starts_on and e.ends_on;
$function$;
alter table public.customer_subscriptions alter column started_at set default public.shop_today();

drop table public.shop_domains;
drop table public.shops;
drop type public.shop_status;

-- Views originais
create view public.appointment_details with (security_invoker=true) as
SELECT a.id,
    a.code,
    a.status,
    a.source,
    a.starts_at,
    a.ends_at,
    shop_local_date(a.starts_at) AS local_date,
    to_char((a.starts_at AT TIME ZONE shop_timezone()), 'HH24:MI'::text) AS local_time,
    a.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    c.email AS customer_email,
    a.service_id,
    s.slug AS service_slug,
    a.service_name,
    a.booked_professional_id,
    bp.slug AS booked_professional_slug,
    bp.name AS booked_professional_name,
    a.performed_by_id,
    pp.slug AS performed_by_slug,
    pp.name AS performed_by_name,
    a.requested_any_professional,
    a.price,
    a.customer_notes,
    sub.plan_id AS live_plan_id,
    sub.plan_name AS live_plan_name,
    COALESCE(items.all_covered_live, false) AS covered_live,
    a.covered_by_plan,
    a.subscription_id,
    a.charged_amount,
    a.payout_amount,
    a.cancelled_at,
    a.created_at,
    a.updated_at,
    private.membership_status(a.customer_id, shop_local_date(a.starts_at)) AS membership_status,
    items.service_ids,
    items.list AS items
   FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN services s ON s.id = a.service_id
     JOIN professionals bp ON bp.id = a.booked_professional_id
     JOIN professionals pp ON pp.id = a.performed_by_id
     LEFT JOIN LATERAL ( SELECT sp.id AS plan_id,
            sp.name AS plan_name
           FROM customer_subscriptions cs
             JOIN subscription_plans sp ON sp.id = cs.plan_id
          WHERE cs.customer_id = a.customer_id AND cs.status <> 'cancelada'::subscription_status AND cs.started_at <= shop_local_date(a.starts_at) AND (cs.ended_at IS NULL OR cs.ended_at >= shop_local_date(a.starts_at))
         LIMIT 1) sub ON true
     LEFT JOIN LATERAL ( SELECT array_agg(i.service_id ORDER BY i."position") AS service_ids,
            bool_and(live.covered) AS all_covered_live,
            jsonb_agg(jsonb_build_object('service_id', i.service_id, 'service_slug', si.slug, 'service_name', i.service_name, 'price', i.price, 'duration_minutes', i.duration_minutes, 'covered_live', live.covered, 'covered_by_plan', i.covered_by_plan, 'charged_amount', i.charged_amount, 'payout_amount', i.payout_amount) ORDER BY i."position") AS list
           FROM appointment_services i
             JOIN services si ON si.id = i.service_id
             CROSS JOIN LATERAL ( SELECT (( SELECT pc.subscription_id
                           FROM private.plan_coverage(a.customer_id, i.service_id, a.starts_at, a.id, a.created_at) pc(subscription_id, plan_id, reason, week_start, week_end))) IS NOT NULL AS covered) live
          WHERE i.appointment_id = a.id) items ON true;
create view public.customer_profiles with (security_invoker=true) as
SELECT c.id,
    c.name,
    c.phone,
    c.email,
    c.whatsapp_opt_in,
    c.whatsapp_opt_in_at,
    c.created_at,
    private.membership_status(c.id, shop_today()) AS membership_status,
    cur.subscription_id,
    cur.plan_id,
    cur.plan_slug,
    cur.plan_name,
    cur.monthly_price,
    cur.started_at AS subscribed_since,
    last_sub.ended_at AS last_subscription_ended_at,
    COALESCE(open.open_amount, 0::numeric) AS open_amount,
    COALESCE(open.open_count, 0) AS open_count,
    open.oldest_due_date,
        CASE
            WHEN open.oldest_due_date IS NOT NULL THEN shop_today() - open.oldest_due_date
            ELSE NULL::integer
        END AS days_overdue,
    last_pay.paid_at AS last_paid_at,
    last_pay.method AS last_payment_method,
    last_pay.amount AS last_payment_amount,
    visits.last_visit_at,
    COALESCE(visits.visit_count, 0) AS visit_count
   FROM customers c
     LEFT JOIN LATERAL ( SELECT cs.id AS subscription_id,
            cs.started_at,
            sp.id AS plan_id,
            sp.slug AS plan_slug,
            sp.name AS plan_name,
            sp.monthly_price
           FROM customer_subscriptions cs
             JOIN subscription_plans sp ON sp.id = cs.plan_id
          WHERE cs.customer_id = c.id AND cs.status <> 'cancelada'::subscription_status AND cs.started_at <= shop_today() AND (cs.ended_at IS NULL OR cs.ended_at >= shop_today())
         LIMIT 1) cur ON true
     LEFT JOIN LATERAL ( SELECT max(cs.ended_at) AS ended_at
           FROM customer_subscriptions cs
          WHERE cs.customer_id = c.id AND cs.ended_at IS NOT NULL) last_sub ON true
     LEFT JOIN LATERAL ( SELECT sum(p.amount) AS open_amount,
            count(*)::integer AS open_count,
            min(p.due_date) AS oldest_due_date
           FROM subscription_payments p
             JOIN customer_subscriptions cs ON cs.id = p.subscription_id
          WHERE cs.customer_id = c.id AND p.status = 'pendente'::payment_status AND p.due_date <= shop_today()) open ON true
     LEFT JOIN LATERAL ( SELECT p.paid_at,
            p.method,
            p.amount
           FROM subscription_payments p
             JOIN customer_subscriptions cs ON cs.id = p.subscription_id
          WHERE cs.customer_id = c.id AND p.status = 'pago'::payment_status
          ORDER BY p.paid_at DESC
         LIMIT 1) last_pay ON true
     LEFT JOIN LATERAL ( SELECT max(a.starts_at) AS last_visit_at,
            count(*)::integer AS visit_count
           FROM appointments a
          WHERE a.customer_id = c.id AND a.status = 'concluido'::appointment_status) visits ON true;
create view public.subscriber_accounts with (security_invoker=true) as
SELECT c.id,
    c.name,
    c.phone,
    sp.slug AS plan_slug,
    sp.name AS plan_name,
    private.subscriber_status(c.id, shop_today()) AS status,
    first_sub.started_at AS subscribed_since
   FROM customers c
     JOIN LATERAL ( SELECT cs.plan_id
           FROM customer_subscriptions cs
          WHERE cs.customer_id = c.id
          ORDER BY cs.started_at DESC, cs.created_at DESC
         LIMIT 1) last_sub ON true
     JOIN subscription_plans sp ON sp.id = last_sub.plan_id
     CROSS JOIN LATERAL ( SELECT min(cs.started_at) AS started_at
           FROM customer_subscriptions cs
          WHERE cs.customer_id = c.id) first_sub;
revoke all on public.appointment_details from anon, authenticated, service_role;
revoke all on public.customer_profiles from anon, authenticated, service_role;
revoke all on public.subscriber_accounts from anon, authenticated, service_role;
grant insert on public.appointment_details to service_role;
grant select on public.appointment_details to service_role;
grant update on public.appointment_details to service_role;
grant delete on public.appointment_details to service_role;
grant truncate on public.appointment_details to service_role;
grant references on public.appointment_details to service_role;
grant trigger on public.appointment_details to service_role;
grant select on public.appointment_details to authenticated;
grant insert on public.customer_profiles to service_role;
grant select on public.customer_profiles to service_role;
grant update on public.customer_profiles to service_role;
grant delete on public.customer_profiles to service_role;
grant truncate on public.customer_profiles to service_role;
grant references on public.customer_profiles to service_role;
grant trigger on public.customer_profiles to service_role;
grant select on public.customer_profiles to authenticated;
grant insert on public.subscriber_accounts to service_role;
grant select on public.subscriber_accounts to service_role;
grant update on public.subscriber_accounts to service_role;
grant delete on public.subscriber_accounts to service_role;
grant truncate on public.subscriber_accounts to service_role;
grant references on public.subscriber_accounts to service_role;
grant trigger on public.subscriber_accounts to service_role;
grant select on public.subscriber_accounts to authenticated;

-- Permissões originais
grant select on public.shop_settings to anon;
revoke usage on schema private from service_role;
revoke all on function set_updated_at() from public, anon, authenticated, service_role;
grant execute on function set_updated_at() to service_role;
revoke all on function appointments_prepare() from public, anon, authenticated, service_role;
grant execute on function appointments_prepare() to service_role;
revoke all on function generate_reservation_code() from public, anon, authenticated, service_role;
grant execute on function generate_reservation_code() to authenticated,service_role;
revoke all on function appointments_guard() from public, anon, authenticated, service_role;
grant execute on function appointments_guard() to service_role;
revoke all on function appointments_settle() from public, anon, authenticated, service_role;
grant execute on function appointments_settle() to service_role;
revoke all on function private.resolve_service(text) from public, anon, authenticated, service_role;
revoke all on function private.check_professional(text) from public, anon, authenticated, service_role;
revoke all on function private.format_phone(text) from public, anon, authenticated, service_role;
revoke all on function private.day_slots(uuid,text,date) from public, anon, authenticated, service_role;
revoke all on function private.reservation_json(uuid) from public, anon, authenticated, service_role;
revoke all on function get_reservation(text,text) from public, anon, authenticated, service_role;
grant execute on function get_reservation(text,text) to anon,authenticated,service_role;
revoke all on function cancel_reservation(text,text) from public, anon, authenticated, service_role;
grant execute on function cancel_reservation(text,text) to anon,authenticated,service_role;
revoke all on function get_day_availability(text,text,date) from public, anon, authenticated, service_role;
grant execute on function get_day_availability(text,text,date) to anon,authenticated,service_role;
revoke all on function get_day_summaries(text,text,date,integer) from public, anon, authenticated, service_role;
grant execute on function get_day_summaries(text,text,date,integer) to anon,authenticated,service_role;
revoke all on function find_next_available(text,text,date) from public, anon, authenticated, service_role;
grant execute on function find_next_available(text,text,date) to anon,authenticated,service_role;
revoke all on function shop_timezone() from public, anon, authenticated, service_role;
grant execute on function shop_timezone() to authenticated,service_role;
revoke all on function shop_now() from public, anon, authenticated, service_role;
grant execute on function shop_now() to authenticated,service_role;
revoke all on function shop_today() from public, anon, authenticated, service_role;
grant execute on function shop_today() to authenticated,service_role;
revoke all on function shop_local_ts(date,time without time zone) from public, anon, authenticated, service_role;
grant execute on function shop_local_ts(date,time without time zone) to authenticated,service_role;
revoke all on function shop_local_date(timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function shop_local_date(timestamp with time zone) to authenticated,service_role;
revoke all on function private.is_staff() from public, anon, authenticated, service_role;
grant execute on function private.is_staff() to authenticated,service_role;
revoke all on function customers_opt_in() from public, anon, authenticated, service_role;
grant execute on function customers_opt_in() to service_role;
revoke all on function subscription_payments_prepare() from public, anon, authenticated, service_role;
grant execute on function subscription_payments_prepare() to service_role;
revoke all on function customer_subscriptions_billing() from public, anon, authenticated, service_role;
grant execute on function customer_subscriptions_billing() to service_role;
revoke all on function private.is_admin() from public, anon, authenticated, service_role;
grant execute on function private.is_admin() to authenticated,service_role;
revoke all on function private.professional_day_periods(uuid,date) from public, anon, authenticated, service_role;
revoke all on function private.professional_day_blocks(uuid,date) from public, anon, authenticated, service_role;
revoke all on function private.subscription_covering(uuid,uuid,date) from public, anon, authenticated, service_role;
grant execute on function private.subscription_covering(uuid,uuid,date) to authenticated;
revoke all on function private.subscription_in_good_standing(uuid,date) from public, anon, authenticated, service_role;
grant execute on function private.subscription_in_good_standing(uuid,date) to authenticated;
revoke all on function private.current_professional_id() from public, anon, authenticated, service_role;
grant execute on function private.current_professional_id() to authenticated,service_role;
revoke all on function private.membership_status(uuid,date) from public, anon, authenticated, service_role;
grant execute on function private.membership_status(uuid,date) to authenticated;
revoke all on function private.generate_subscription_payments(date,uuid) from public, anon, authenticated, service_role;
revoke all on function private.can_manage_subscribers() from public, anon, authenticated, service_role;
revoke all on function private.current_customer_id() from public, anon, authenticated, service_role;
revoke all on function create_reservation(text,text,date,text,text,text,text,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function create_reservation(text,text,date,text,text,text,text,text,text,boolean) to anon,authenticated,service_role;
revoke all on function private.apply_subscription(uuid,uuid,text) from public, anon, authenticated, service_role;
revoke all on function private.subscriber_status(uuid,date) from public, anon, authenticated, service_role;
grant execute on function private.subscriber_status(uuid,date) to authenticated;
revoke all on function private.plan_coverage(uuid,uuid,timestamp with time zone,uuid,timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function private.plan_coverage(uuid,uuid,timestamp with time zone,uuid,timestamp with time zone) to authenticated;
revoke all on function private.purge_expired_history() from public, anon, authenticated, service_role;
revoke all on function private.book_site_appointment(uuid,uuid,text,date,text,text,text) from public, anon, authenticated, service_role;
revoke all on function appointments_service_name() from public, anon, authenticated, service_role;
grant execute on function appointments_service_name() to service_role;
revoke all on function get_subscriber_session() from public, anon, authenticated, service_role;
grant execute on function get_subscriber_session() to authenticated,service_role;
revoke all on function get_plan_coverage(text,date) from public, anon, authenticated, service_role;
grant execute on function get_plan_coverage(text,date) to authenticated,service_role;
revoke all on function save_subscriber(uuid,text,text,uuid) from public, anon, authenticated, service_role;
grant execute on function save_subscriber(uuid,text,text,uuid) to authenticated,service_role;
revoke all on function private.history_cutoff() from public, anon, authenticated, service_role;
revoke all on function create_subscriber_reservation(text,text,date,text,text) from public, anon, authenticated, service_role;
grant execute on function create_subscriber_reservation(text,text,date,text,text) to authenticated,service_role;
revoke all on function set_subscription(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function set_subscription(uuid,text,text) to authenticated,service_role;
revoke all on function private.service_components_check() from public, anon, authenticated, service_role;
revoke all on function private.free_slots(uuid,uuid,date) from public, anon, authenticated, service_role;
revoke all on function private.day_periods(date) from public, anon, authenticated, service_role;
revoke all on function private.day_blocks(date) from public, anon, authenticated, service_role;
revoke all on function private.day_slots(uuid[],text,date) from public, anon, authenticated, service_role;
revoke all on function private.resolve_services(text[]) from public, anon, authenticated, service_role;
revoke all on function appointments_check_items() from public, anon, authenticated, service_role;
grant execute on function appointments_check_items() to service_role;
revoke all on function private.free_slots(uuid[],uuid,date) from public, anon, authenticated, service_role;
revoke all on function private.book_site_appointment(uuid,uuid[],text,date,text,text,text) from public, anon, authenticated, service_role;
revoke all on function appointments_sync_items() from public, anon, authenticated, service_role;
grant execute on function appointments_sync_items() to service_role;
revoke all on function get_day_availability(text[],text,date) from public, anon, authenticated, service_role;
grant execute on function get_day_availability(text[],text,date) to anon,authenticated,service_role;
revoke all on function find_next_available(text[],text,date) from public, anon, authenticated, service_role;
grant execute on function find_next_available(text[],text,date) to anon,authenticated,service_role;
revoke all on function create_reservation(text[],text,date,text,text,text,text,text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function create_reservation(text[],text,date,text,text,text,text,text,text,boolean) to anon,authenticated,service_role;
revoke all on function create_subscriber_reservation(text[],text,date,text,text) from public, anon, authenticated, service_role;
grant execute on function create_subscriber_reservation(text[],text,date,text,text) to authenticated,service_role;
revoke all on function private.professional_own_day_periods(uuid,date) from public, anon, authenticated, service_role;
revoke all on function get_day_summaries(text[],text,date,integer) from public, anon, authenticated, service_role;
grant execute on function get_day_summaries(text[],text,date,integer) to anon,authenticated,service_role;
revoke all on function get_team_agenda(date,date,uuid) from public, anon, authenticated, service_role;
grant execute on function get_team_agenda(date,date,uuid) to authenticated,service_role;
revoke all on function update_team_appointment(uuid,appointment_status,uuid) from public, anon, authenticated, service_role;
grant execute on function update_team_appointment(uuid,appointment_status,uuid) to authenticated,service_role;
revoke all on function private.professional_own_day_blocks(uuid,date) from public, anon, authenticated, service_role;

commit;
