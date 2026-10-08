-- Edição do site (etapa 6, passo 1 de 2): horário semanal com vários períodos e exceções
-- gerais da barbearia. Só aditivo: nada existente muda neste passo.
--
--   opening_periods      horário semanal: dia da semana + início + fim; vários por dia
--                        (ex.: 09:00–12:00 e 13:30–20:00), sem sobreposição. Dia sem
--                        período = fechado. Preenchida com o que está em opening_hours, que
--                        fica intacta (deixa de ser lida no passo 2).
--   schedule_exceptions  exceções da barbearia numa data ou intervalo:
--                          fechado           não abre nesses dias;
--                          horario_especial  nesses dias vale este período no lugar do
--                                            semanal (várias linhas = vários períodos);
--                          bloqueio          trecho sem atendimento (ex.: 09:00–12:00).
--                        Os bloqueios por profissional continuam em schedule_blocks.
--   private.day_periods / private.day_blocks
--                        períodos de atendimento e trechos bloqueados de uma data, já com as
--                        exceções aplicadas. Usadas pelas funções da agenda no passo 2.

set search_path = public, extensions;

-- --- Horário semanal ---

create table public.opening_periods (
  id uuid primary key default gen_random_uuid(),
  -- 0 = domingo, como extract(dow) e opening_hours.
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at < closes_at),
  -- Dois períodos do mesmo dia não se sobrepõem (podem se encostar: 12:00–12:00).
  constraint opening_periods_no_overlap exclude using gist (
    weekday with =,
    tsrange(date '2000-01-01' + opens_at, date '2000-01-01' + closes_at, '[)') with &&
  )
);

comment on table public.opening_periods is
  'Horário semanal da barbearia: um ou mais períodos por dia da semana. Dia sem período = fechado.';

create trigger set_updated_at before update on public.opening_periods
  for each row execute function public.set_updated_at();

insert into public.opening_periods (weekday, opens_at, closes_at)
select weekday, opens_at, closes_at
from public.opening_hours
where opens_at is not null;

-- --- Exceções ---

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  kind text not null check (kind in ('fechado', 'horario_especial', 'bloqueio')),
  -- Vazios em "fechado"; período especial ou trecho bloqueado nos outros.
  opens_at time,
  closes_at time,
  reason text check (char_length(reason) <= 120),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  check (
    (kind = 'fechado' and opens_at is null and closes_at is null)
    or (kind <> 'fechado' and opens_at is not null and closes_at is not null and opens_at < closes_at)
  )
);

comment on table public.schedule_exceptions is
  'Exceções gerais da barbearia (feriado, férias, horário especial, bloqueio de um trecho). Nunca cancelam agendamentos.';

create index schedule_exceptions_dates_idx on public.schedule_exceptions (starts_on, ends_on);
create index schedule_exceptions_created_by_idx on public.schedule_exceptions (created_by);

create trigger set_updated_at before update on public.schedule_exceptions
  for each row execute function public.set_updated_at();

-- --- Grants e RLS (mesmo padrão de …120400_rls_policies) ---

revoke all on public.opening_periods, public.schedule_exceptions from anon, authenticated;
-- Horário semanal é público (landing); exceções só a equipe lê (o motivo pode ser interno).
grant select on public.opening_periods to anon, authenticated;
grant insert, update, delete on public.opening_periods to authenticated;
grant select, insert, update, delete on public.schedule_exceptions to authenticated;

alter table public.opening_periods enable row level security;
alter table public.schedule_exceptions enable row level security;

create policy opening_periods_select on public.opening_periods
  for select to anon, authenticated using (true);
create policy opening_periods_admin_insert on public.opening_periods
  for insert to authenticated with check ((select private.is_admin()));
create policy opening_periods_admin_update on public.opening_periods
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy opening_periods_admin_delete on public.opening_periods
  for delete to authenticated using ((select private.is_admin()));

create policy schedule_exceptions_select on public.schedule_exceptions
  for select to authenticated using ((select private.is_staff()));
create policy schedule_exceptions_admin_insert on public.schedule_exceptions
  for insert to authenticated with check ((select private.is_admin()));
create policy schedule_exceptions_admin_update on public.schedule_exceptions
  for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy schedule_exceptions_admin_delete on public.schedule_exceptions
  for delete to authenticated using ((select private.is_admin()));

-- --- Períodos e bloqueios efetivos de uma data ---

-- Períodos de atendimento da data: nenhum se houver "fechado"; os do "horário especial" se
-- houver; senão, os do horário semanal.
create function private.day_periods(p_date date)
returns table (opens_at time, closes_at time)
language sql
stable
security definer
set search_path = ''
as $$
  with exceptions as (
    select e.kind, e.opens_at, e.closes_at
    from public.schedule_exceptions e
    where p_date between e.starts_on and e.ends_on
  )
  select x.opens_at, x.closes_at
  from exceptions x
  where x.kind = 'horario_especial'
    and not exists (select 1 from exceptions c where c.kind = 'fechado')
  union all
  select op.opens_at, op.closes_at
  from public.opening_periods op
  where op.weekday = extract(dow from p_date)
    and not exists (select 1 from exceptions c where c.kind in ('fechado', 'horario_especial'));
$$;

-- Trechos bloqueados da data (exceção "bloqueio"), como instantes no fuso da barbearia.
create function private.day_blocks(p_date date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select public.shop_local_ts(p_date, e.opens_at), public.shop_local_ts(p_date, e.closes_at)
  from public.schedule_exceptions e
  where e.kind = 'bloqueio'
    and p_date between e.starts_on and e.ends_on;
$$;

revoke execute on function private.day_periods(date), private.day_blocks(date) from public, anon, authenticated;
