-- Correções da auditoria de segurança de 22/10/2026 (security/VULNERABILITIES.md).
--
-- AUTH-01: o admin de uma loja conseguia ligar a um cliente ou à equipe dele o login (UUID do
-- Auth) de outra loja, e as Server Actions usam esse vínculo para trocar senha, e-mail e
-- bloqueio com a service role. Agora cada login tem dono em auth.users.raw_app_meta_data
-- (shop_id e kind), que só o servidor grava, e o banco recusa qualquer vínculo em que a loja ou
-- o tipo não confiram, venha de INSERT, UPDATE ou RPC (save_subscriber). Os logins atuais são
-- preenchidos a partir dos vínculos existentes (cada um tem um único vínculo).
--
-- DATA-01: uma reserva anônima com o telefone de um cliente existente ligava o consentimento de
-- WhatsApp e preenchia o e-mail dele. Agora a reserva não altera cadastro existente; o que o
-- visitante marcou fica registrado no próprio agendamento (whatsapp_opt_in_declared), como
-- declaração não verificada. Cadastro novo continua nascendo com o que foi informado.
--
-- Aditiva: nada é apagado.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';
set local search_path = public, extensions;

-- --- AUTH-01: dono de cada login ---

-- Vínculos atuais: cada login em uma loja, um tipo. Com dois vínculos, para e pede revisão.
do $$
declare
  v_conflicts integer;
begin
  with links as (
    select user_id, shop_id, 'assinante' as kind from public.customers where user_id is not null
    union all
    select user_id, shop_id, 'equipe' from public.staff_members
  )
  select count(*) into v_conflicts
  from (select user_id from links group by user_id having count(*) > 1) x;

  if v_conflicts > 0 then
    raise exception 'identity_binding: % login(s) com mais de um vínculo; revise antes de aplicar', v_conflicts;
  end if;

  select count(*) into v_conflicts
  from (
    select user_id, shop_id, 'assinante' as kind from public.customers where user_id is not null
    union all
    select user_id, shop_id, 'equipe' from public.staff_members
  ) l
  join auth.users u on u.id = l.user_id
  where u.raw_app_meta_data ? 'shop_id'
    and (u.raw_app_meta_data ->> 'shop_id' <> l.shop_id::text or u.raw_app_meta_data ->> 'kind' is distinct from l.kind);

  if v_conflicts > 0 then
    raise exception 'identity_binding: % login(s) com dono diferente do vínculo; revise antes de aplicar', v_conflicts;
  end if;
end;
$$;

update auth.users u
set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('shop_id', l.shop_id, 'kind', l.kind)
from (
  select user_id, shop_id, 'assinante' as kind from public.customers where user_id is not null
  union all
  select user_id, shop_id, 'equipe' from public.staff_members
) l
where u.id = l.user_id;

-- O login pertence a esta loja e é deste tipo (app_metadata gravado só pelo servidor)?
create function private.auth_identity_matches(p_user_id uuid, p_shop uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.raw_app_meta_data ->> 'shop_id' = p_shop::text
      and u.raw_app_meta_data ->> 'kind' = p_kind
  );
$$;

revoke all on function private.auth_identity_matches(uuid, uuid, text) from public, anon, authenticated;

-- Trigger de customers (TG_ARGV[0] = 'assinante') e staff_members ('equipe').
create function private.check_identity_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null or (tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id) then
    return new;
  end if;

  if not private.auth_identity_matches(new.user_id, new.shop_id, tg_argv[0]) then
    raise exception using
      errcode = '42501',
      message = 'identity_not_allowed',
      hint = 'Este login não pertence a esta barbearia.';
  end if;
  return new;
end;
$$;

revoke all on function private.check_identity_link() from public, anon, authenticated;

create trigger customers_05_identity before insert or update of user_id on public.customers
  for each row execute function private.check_identity_link('assinante');

create trigger staff_members_05_identity before insert or update of user_id on public.staff_members
  for each row execute function private.check_identity_link('equipe');

-- --- DATA-01: reserva anônima não altera cadastro existente ---

alter table public.appointments
  add column whatsapp_opt_in_declared boolean not null default false;

comment on column public.appointments.whatsapp_opt_in_declared is
  'O visitante marcou o aceite de WhatsApp nesta reserva. Declaração não verificada: não muda o cadastro de quem já existia.';

create or replace function public.create_reservation(
  p_shop uuid,
  p_services text[],
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
security definer
set search_path = ''
as $$
declare
  v_shop uuid := private.assert_shop(p_shop, 'public');
  v_service_ids uuid[] := private.resolve_services(v_shop, p_services);
  v_professional text := private.check_professional(v_shop, p_professional);
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

  -- Telefone não comprova quem é a pessoa: cadastro novo nasce com o que foi informado;
  -- cadastro existente não muda (nome, e-mail e consentimento ficam como estão).
  insert into public.customers (shop_id, name, phone, email, whatsapp_opt_in)
  values (v_shop, v_name, v_phone, v_email, v_opt_in)
  on conflict (shop_id, phone) do nothing
  returning id into v_customer_id;

  if v_customer_id is null then
    select id into v_customer_id from public.customers where shop_id = v_shop and phone = v_phone;
  end if;

  v_appointment_id := private.book_site_appointment(
    v_customer_id, v_service_ids, v_professional, p_date, p_time, p_assigned_professional, v_notes
  );

  if v_opt_in then
    update public.appointments set whatsapp_opt_in_declared = true where id = v_appointment_id;
  end if;

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

commit;
