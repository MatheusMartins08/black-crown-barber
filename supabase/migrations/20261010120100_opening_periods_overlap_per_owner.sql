-- Horário semanal: a restrição de sobreposição passa a valer por dono (barbearia ou cada
-- profissional). Antes, um período do Rafael na segunda colidiria com o da barbearia na
-- segunda. Só recria a restrição; nenhuma linha muda (as atuais são todas da barbearia e já
-- respeitam a regra).

set search_path = public, extensions;

alter table public.opening_periods drop constraint opening_periods_no_overlap;
alter table public.opening_periods add constraint opening_periods_no_overlap exclude using gist (
  (coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  weekday with =,
  tsrange(date '2000-01-01' + opens_at, date '2000-01-01' + closes_at, '[)') with &&
);
