-- Gera as mensalidades do dia todas as manhãs (03:00 em São Paulo = 06:00 UTC; o
-- pg_cron usa UTC). Separado da migração de mensalidades porque depende do pg_cron.

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- cron.schedule com o mesmo nome substitui o job, então reaplicar não duplica.
select cron.schedule(
  'generate-subscription-payments',
  '0 6 * * *',
  $$select private.generate_subscription_payments()$$
);
