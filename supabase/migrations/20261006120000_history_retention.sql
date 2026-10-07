-- Retenção do histórico do painel: 6 meses.
--
-- O painel só consulta de hoje − 6 meses em diante, no fuso da barbearia
-- (historyRules em app/data/painel.ts; 06/10 → 06/04, 31/08 → 28/02, igual a
-- `date - interval '6 months'`). Esta migração guarda o prazo em shop_settings e apaga,
-- todo dia de madrugada, o histórico operacional mais velho que ele:
--
--   appointments     atendimentos que começaram antes do corte (nenhuma tabela aponta para eles)
--   schedule_blocks  bloqueios de agenda que terminaram antes do corte
--
-- Nunca apaga cadastros nem dinheiro: customers, customer_subscriptions (definem
-- ex-assinante, "assinante desde" e a lista subscriber_accounts), subscription_payments
-- (comprovante e "último pagamento"; as pendentes ainda são dívida), planos, serviços,
-- profissionais, equipe e configurações.
--
-- Efeitos esperados:
--   - customer_profiles.visit_count e last_visit_at ("Última visita" na tela Clientes)
--     passam a contar só os atendimentos dentro do prazo;
--   - o limite semanal dos planos e o fechamento não mudam: olham a semana atual e
--     períodos que o painel já limita aos 6 meses.
--
-- Como aplicar (SQL Editor, como o supabase/README.md orienta):
--   1. Rode a conferência abaixo, sozinha, para ver o que sairia hoje.
--   2. Rode o arquivo inteiro de uma vez.
--   3. Registre a migração (último bloco, comentado).

-- 1) Conferência (só leitura; descomente e rode separado):
-- select
--   (public.shop_today() - interval '6 months')::date as corte,
--   (select count(*) from public.appointments
--     where starts_at < public.shop_local_ts((public.shop_today() - interval '6 months')::date, time '00:00')
--   ) as atendimentos_a_apagar,
--   (select count(*) from public.schedule_blocks
--     where ends_at <= public.shop_local_ts((public.shop_today() - interval '6 months')::date, time '00:00')
--   ) as bloqueios_a_apagar;

begin;

-- --- Prazo configurável (mesmo valor de historyRules.months no front) ---

alter table public.shop_settings
  add column if not exists history_retention_months integer not null default 6
    check (history_retention_months between 1 and 60);

comment on column public.shop_settings.history_retention_months is
  'Meses de histórico (atendimentos e bloqueios) mantidos e consultáveis no painel. Espelhado em historyRules (app/data/painel.ts).';

-- A limpeza dos bloqueios procura por ends_at; atendimentos já têm appointments_starts_at_idx.
create index if not exists schedule_blocks_ends_at_idx on public.schedule_blocks (ends_at);

-- --- Corte e limpeza ---

-- Primeiro dia mantido: hoje na barbearia menos o prazo.
create or replace function private.history_cutoff()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (
    public.shop_today()
    - make_interval(months => coalesce((select history_retention_months from public.shop_settings where id = 1), 6))
  )::date;
$$;

-- Apaga o que ficou antes do corte e devolve o que saiu. Idempotente: pode rodar várias
-- vezes no mesmo dia (as rodadas seguintes não acham nada).
create or replace function private.purge_expired_history()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
$$;

-- Só o banco (pg_cron, como postgres) executa; nada disso é exposto pela API.
revoke execute on function private.history_cutoff(), private.purge_expired_history()
  from public, anon, authenticated;

-- --- Agendamento ---
-- 03:30 em São Paulo = 06:30 UTC (o pg_cron usa UTC), depois da geração de mensalidades
-- das 06:00 (…120900_billing_cron). Mesmo nome substitui o job: reaplicar não duplica.
select cron.schedule(
  'purge-expired-history',
  '30 6 * * *',
  $$select private.purge_expired_history()$$
);

commit;

-- Para limpar já, sem esperar a madrugada (opcional):
-- select private.purge_expired_history();

-- 3) Registro (o SQL Editor não grava histórico de migrações):
-- insert into supabase_migrations.schema_migrations (version, name)
-- values ('20261006120000', 'history_retention');
