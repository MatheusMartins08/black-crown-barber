-- Tira os helpers internos da API (alerta 0028/0029 do Supabase: funções
-- SECURITY DEFINER executáveis via /rest/v1/rpc). Só as 6 RPCs do agendamento
-- continuam públicas.

-- Fuso e código de reserva: só leem shop_settings/appointments, que quem os chama já
-- pode ler (ou rodam dentro de RPCs/triggers security definer). Não precisam de definer.
alter function public.shop_timezone() security invoker;
alter function public.shop_now() security invoker;
alter function public.shop_today() security invoker;
alter function public.shop_local_ts(date, time) security invoker;
alter function public.shop_local_date(timestamptz) security invoker;
alter function public.generate_reservation_code() security invoker;

revoke execute on function
  public.shop_timezone(),
  public.shop_now(),
  public.shop_today(),
  public.shop_local_ts(date, time),
  public.shop_local_date(timestamptz),
  public.generate_reservation_code()
from public, anon;

-- A equipe usa a view (shop_local_date/shop_timezone), o default de started_at
-- (shop_today) e o default de code (generate_reservation_code).
grant execute on function
  public.shop_timezone(),
  public.shop_now(),
  public.shop_today(),
  public.shop_local_ts(date, time),
  public.shop_local_date(timestamptz),
  public.generate_reservation_code()
to authenticated;

-- Papéis: continuam security definer (leem staff_members sem cair na RLS dela), mas
-- saem do schema exposto. As políticas guardam a referência pelo OID e seguem valendo.
alter function public.is_staff() set schema private;
alter function public.is_admin() set schema private;
alter function public.current_professional_id() set schema private;

grant usage on schema private to authenticated;
revoke execute on function private.is_staff(), private.is_admin(), private.current_professional_id() from public, anon;
grant execute on function private.is_staff(), private.is_admin(), private.current_professional_id() to authenticated;

-- O guard chama is_admin() pelo nome; recria apontando para o novo schema.
create or replace function public.appointments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_free constant text[] := array['status', 'performed_by_id', 'updated_at'];
begin
  if (select auth.uid()) is null or private.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - v_free) <> (to_jsonb(old) - v_free) then
    raise exception using
      errcode = '42501',
      message = 'column_not_allowed',
      hint = 'A equipe altera apenas o status e quem executou o atendimento.';
  end if;

  if old.status = 'concluido' and new.status <> 'concluido' then
    raise exception using
      errcode = '42501',
      message = 'settled_appointment',
      hint = 'Só o administrador reabre um atendimento concluído.';
  end if;

  return new;
end;
$$;

-- O visitante não chama is_staff(): as políticas de leitura do catálogo passam a
-- valer só para authenticated (alter policy, sem apagar nada) e o anon ganha as suas.
alter policy services_select on public.services
  to authenticated using (is_active or (select private.is_staff()));
create policy services_select_anon on public.services
  for select to anon using (is_active);

alter policy professionals_select on public.professionals
  to authenticated using (is_active or (select private.is_staff()));
create policy professionals_select_anon on public.professionals
  for select to anon using (is_active);

alter policy professional_services_select on public.professional_services
  to authenticated
  using (
    (select private.is_staff())
    or (
      exists (select 1 from public.professionals p where p.id = professional_id and p.is_active)
      and exists (select 1 from public.services s where s.id = service_id and s.is_active)
    )
  );
create policy professional_services_select_anon on public.professional_services
  for select to anon
  using (
    exists (select 1 from public.professionals p where p.id = professional_id and p.is_active)
    and exists (select 1 from public.services s where s.id = service_id and s.is_active)
  );

alter policy subscription_plans_select on public.subscription_plans
  to authenticated using (is_active or (select private.is_staff()));
create policy subscription_plans_select_anon on public.subscription_plans
  for select to anon using (is_active);

alter policy plan_services_select on public.plan_services
  to authenticated
  using (
    (select private.is_staff())
    or exists (select 1 from public.subscription_plans sp where sp.id = plan_id and sp.is_active)
  );
create policy plan_services_select_anon on public.plan_services
  for select to anon
  using (exists (select 1 from public.subscription_plans sp where sp.id = plan_id and sp.is_active));
