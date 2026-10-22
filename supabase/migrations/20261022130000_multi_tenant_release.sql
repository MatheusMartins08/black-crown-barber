-- Multi-barbearia, etapa 4: libera a 2ª loja.
--
-- Pré-requisito: app multi-tenant (etapa 3) em produção e estável. A partir daqui, apps
-- anteriores à etapa 3 não podem voltar ao ar.
--
-- Muda contratos:
--   - remove as uniques globais (slug, telefone, login) e a exclusão de horários sem loja;
--   - shop_settings e payroll_settings deixam de ser linha única (PK passa a ser shop_id);
--   - site_images passa a ter PK (shop_id, slot);
--   - gravação sem sessão de equipe deixa de cair na Black Crown (default sem fallback).
-- Cria o provisionamento de lojas, só para a service role (scripts/provision-shop.mjs).
--
-- Destrutiva (drop de constraints e da coluna id): rodar no SQL Editor depois de backup.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = public, extensions;

-- Nenhuma função pode depender de shop_settings.id / payroll_settings.id (as dependências do
-- corpo de função não são rastreadas pelo Postgres: conferimos o texto).
do $$
declare
  v_fn text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ')
  into v_fn
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosrc ~* '(shop_settings|payroll_settings)[^;]*where\s+(\w+\.)?id\s*=\s*1';
  if v_fn is not null then
    raise exception 'multi_tenant_release: funções ainda leem a linha única: %', v_fn;
  end if;
end;
$$;

alter table public.services drop constraint services_slug_key;
alter table public.professionals drop constraint professionals_slug_key;
alter table public.subscription_plans drop constraint subscription_plans_slug_key;
alter table public.customers drop constraint customers_phone_key;
alter table public.staff_members drop constraint staff_members_login_key;
alter table public.opening_periods drop constraint opening_periods_no_overlap;

alter table public.shop_settings
  drop constraint shop_settings_pkey,
  drop column id,
  add constraint shop_settings_pkey primary key (shop_id),
  drop constraint shop_settings_shop_id_key;

alter table public.payroll_settings
  drop constraint payroll_settings_pkey,
  drop column id,
  add constraint payroll_settings_pkey primary key (shop_id),
  drop constraint payroll_settings_shop_id_key;

alter table public.site_images
  drop constraint site_images_pkey,
  add constraint site_images_pkey primary key (shop_id, slot),
  drop constraint site_images_shop_id_slot_key;

-- Sem sessão de equipe não há loja implícita: quem grava fora do painel informa shop_id.
create or replace function private.default_shop_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.staff_shop_id();
$$;

-- --- Provisionamento (idempotente: rodar de novo completa o que faltou) ---

create function private.provision_shop(p_slug text, p_name text, p_timezone text, p_host text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_host text := nullif(lower(btrim(coalesce(p_host, ''))), '');
  v_shop uuid;
  v_owner uuid;
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception using errcode = 'BC001', message = 'invalid_request', hint = 'Fuso horário inválido.';
  end if;

  insert into public.shops (slug, name) values (v_slug, v_name) on conflict (slug) do nothing;
  select id into v_shop from public.shops where slug = v_slug;

  insert into public.shop_settings (shop_id, name, timezone)
  values (v_shop, v_name, p_timezone)
  on conflict (shop_id) do nothing;

  insert into public.payroll_settings (shop_id) values (v_shop) on conflict (shop_id) do nothing;

  -- Mesmas posições e fotos de exemplo do template; o admin troca pelo painel.
  insert into public.site_images (shop_id, slot, label, alt, image_url, sort_order) values
    (v_shop, 'about', 'A barbearia', 'Interior de barbearia com cadeiras de barbeiro e quadros nas paredes', '/gallery-interior-01.jpg', 0),
    (v_shop, 'gallery-1', 'Acabamento', 'Barbeiro refinando um corte masculino com tesoura e pente', '/gallery-corte-01.jpg', 1),
    (v_shop, 'gallery-2', 'Barba', 'Barbeiro aparando o cabelo e a barba de um cliente com navalha', '/gallery-barba-01.jpg', 2),
    (v_shop, 'gallery-3', 'Corte', 'Barbeiro trabalhando o corte de um cliente na cadeira com tesoura', '/gallery-corte-02.jpg', 3),
    (v_shop, 'gallery-4', 'Ambiente', 'Barbearia com cadeiras de barbeiro e quadros nas paredes', '/gallery-interior-01.jpg', 4),
    (v_shop, 'gallery-5', 'Estilo', 'Barbeiro finalizando o penteado de um cliente com secador', '/gallery-corte-03.jpg', 5),
    (v_shop, 'gallery-6', 'Precisão', 'Barbeiro aparando o cabelo de um cliente com máquina', '/gallery-corte-04.jpg', 6),
    (v_shop, 'gallery-7', 'Barbearia', 'Interior de barbearia com clientes sendo atendidos nas cadeiras', '/gallery-interior-02.jpg', 7),
    (v_shop, 'gallery-8', 'Finalização', 'Barbeiros atendendo clientes em uma barbearia contemporânea', '/gallery-corte-05.jpg', 8)
  on conflict (shop_id, slot) do nothing;

  -- Expediente padrão (segunda a sábado, 9h às 19h), só se a loja ainda não tiver nenhum.
  if not exists (select 1 from public.opening_periods where shop_id = v_shop) then
    insert into public.opening_periods (shop_id, weekday, opens_at, closes_at)
    select v_shop, d, time '09:00', time '19:00' from generate_series(1, 6) as d;
  end if;

  if v_host is not null then
    select shop_id into v_owner from public.shop_domains where host = v_host;
    if v_owner is null then
      insert into public.shop_domains (host, shop_id, is_primary)
      values (v_host, v_shop, not exists (select 1 from public.shop_domains where shop_id = v_shop and is_primary));
    elsif v_owner <> v_shop then
      raise exception using errcode = 'BC017', message = 'host_in_use', hint = 'Este domínio já é de outra barbearia.';
    end if;
  end if;

  return v_shop;
end;
$$;

-- Liga o primeiro admin (usuário já criado no Auth) à loja. Um login pertence a uma loja só.
create function private.provision_shop_admin(p_shop uuid, p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current uuid;
begin
  select shop_id into v_current from public.staff_members where user_id = p_user_id;

  if v_current is null then
    insert into public.staff_members (shop_id, user_id, role, display_name, is_active)
    values (p_shop, p_user_id, 'admin', nullif(btrim(coalesce(p_display_name, '')), ''), true);
  elsif v_current <> p_shop then
    raise exception using errcode = 'BC018', message = 'user_in_other_shop', hint = 'Este usuário já pertence a outra barbearia.';
  end if;
end;
$$;

create function public.provision_shop(p_slug text, p_name text, p_timezone text, p_host text default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.provision_shop(p_slug, p_name, p_timezone, p_host);
$$;

create function public.provision_shop_admin(p_shop uuid, p_user_id uuid, p_display_name text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.provision_shop_admin(p_shop, p_user_id, p_display_name);
$$;

revoke all on function private.provision_shop(text, text, text, text), private.provision_shop_admin(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.provision_shop(text, text, text, text), public.provision_shop_admin(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.provision_shop(text, text, text, text), public.provision_shop_admin(uuid, uuid, text)
  to service_role;

commit;
