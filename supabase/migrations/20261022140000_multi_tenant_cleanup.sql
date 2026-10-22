-- Multi-barbearia, etapa 5: limpeza, depois de cerca de 2 semanas de observação da etapa 4.
--
-- Remove o que só existia para o app antigo continuar funcionando:
--   - RPCs sem p_shop (wrappers fixos na Black Crown) e as versões de 1 serviço;
--   - helpers internos sem loja e os de fuso sem parâmetro;
--   - o caminho legado do Storage (barbers/, gallery/, barbershop/ sem a pasta da loja);
--   - a tabela opening_hours, que não é lida desde …170000_schedule_uses_periods.
-- Pré-requisito: fotos legadas movidas para <shop_id>/… (o bloco abaixo confere).
--
-- Destrutiva (drop): rodar no SQL Editor depois de backup.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = public, extensions;

do $$
declare
  v_fn text;
begin
  if exists (
    select 1 from storage.objects
    where bucket_id = 'site-media' and (storage.foldername(name))[1] in ('barbers', 'gallery', 'barbershop')
  ) then
    raise exception 'multi_tenant_cleanup: ainda há fotos no caminho legado do Storage; mova-as antes';
  end if;

  -- Nenhuma função que fica pode chamar o que sai (o Postgres não rastreia o corpo).
  select string_agg(n.nspname || '.' || p.proname, ', ')
  into v_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosrc ~ '(shop_(timezone|today|now)\(\)|legacy_shop_id\(\))'
    and p.proname not in (
      'shop_timezone', 'shop_today', 'shop_now', 'shop_local_ts', 'shop_local_date',
      'get_day_availability', 'get_day_summaries', 'find_next_available', 'create_reservation',
      'create_subscriber_reservation', 'get_reservation', 'cancel_reservation', 'get_subscriber_session',
      'get_plan_coverage', 'save_subscriber', 'set_subscription', 'day_periods', 'day_blocks', 'day_slots',
      'check_professional', 'resolve_service', 'resolve_services', 'history_cutoff', 'can_manage_subscribers',
      'legacy_shop_id'
    );
  if v_fn is not null then
    raise exception 'multi_tenant_cleanup: funções ainda usam helpers que vão sair: %', v_fn;
  end if;
end;
$$;

drop function public.get_day_availability(text, text, date);
drop function public.get_day_availability(text[], text, date);
drop function public.get_day_summaries(text, text, date, integer);
drop function public.get_day_summaries(text[], text, date, integer);
drop function public.find_next_available(text, text, date);
drop function public.find_next_available(text[], text, date);
drop function public.create_reservation(text, text, date, text, text, text, text, text, text, boolean);
drop function public.create_reservation(text[], text, date, text, text, text, text, text, text, boolean);
drop function public.create_subscriber_reservation(text, text, date, text, text);
drop function public.create_subscriber_reservation(text[], text, date, text, text);
drop function public.get_reservation(text, text);
drop function public.cancel_reservation(text, text);
drop function public.get_subscriber_session();
drop function public.get_plan_coverage(text, date);
drop function public.save_subscriber(uuid, text, text, uuid);
drop function public.set_subscription(uuid, text, text);

drop function private.book_site_appointment(uuid, uuid, text, date, text, text, text);
drop function private.day_slots(uuid, text, date);
drop function private.day_slots(uuid[], text, date);
drop function private.free_slots(uuid, uuid, date);
drop function private.day_periods(date);
drop function private.day_blocks(date);
drop function private.check_professional(text);
drop function private.resolve_service(text);
drop function private.resolve_services(text[]);
drop function private.history_cutoff();
drop function private.can_manage_subscribers();

drop function public.shop_local_date(timestamptz);
drop function public.shop_local_ts(date, time);
drop function public.shop_now();
drop function public.shop_today();
drop function public.shop_timezone();

drop table public.opening_hours;

alter policy site_media_admin_select on storage.objects
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = (select private.admin_shop_id())::text
    and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
  );

alter policy site_media_admin_insert on storage.objects
  with check (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
    and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
  );

alter policy site_media_admin_update on storage.objects
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
    and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
  )
  with check (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
    and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
  );

alter policy site_media_admin_delete on storage.objects
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = (select private.admin_write_shop_id())::text
    and (storage.foldername(name))[2] = any (array['barbers', 'gallery', 'barbershop'])
  );

commit;
