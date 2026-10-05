-- Extensões, tipos e utilidades compartilhadas por todo o schema.

-- btree_gist permite combinar "=" (uuid) com "&&" (intervalos) nas restrições de
-- exclusão que impedem horários e assinaturas sobrepostos.
create extension if not exists btree_gist with schema extensions;

-- Funções internas ficam fora de "public", que é o schema exposto pela API.
create schema if not exists private;
revoke all on schema private from public;
comment on schema private is 'Funções internas do agendamento. Não é exposto pela API.';

create type public.appointment_status as enum ('agendado', 'concluido', 'faltou', 'cancelado');
create type public.appointment_source as enum ('site', 'painel', 'balcao');
create type public.staff_role as enum ('admin', 'barbeiro');
create type public.subscription_status as enum ('ativa', 'suspensa', 'cancelada');

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
