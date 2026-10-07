-- Edição do site (etapa 2): bucket de imagens editáveis pelo painel.
--
-- Aditivo: nenhuma tabela, coluna, função ou trigger muda. As fotos atuais continuam em
-- /public e professionals.image_url passa a aceitar também a URL pública deste bucket.
--
-- Bucket público: qualquer um lê pela URL (a landing e o agendamento precisam). Enviar,
-- trocar e apagar exige admin (private.is_admin, a mesma regra das tabelas de catálogo).
-- Nomes de arquivo são uuid + extensão (sem sobrescrever: cada troca gera um objeto novo).
-- Por enquanto só a pasta barbers/ é liberada; as próximas etapas acrescentam as suas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-media',
  'site-media',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

-- Remover um objeto pela API exige SELECT além de DELETE. O SELECT aqui não afeta a
-- leitura pública (bucket público dispensa política para baixar pela URL).
create policy site_media_admin_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = 'barbers'
    and (select private.is_admin())
  );

create policy site_media_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = 'barbers'
    and (select private.is_admin())
  );

create policy site_media_admin_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = 'barbers'
    and (select private.is_admin())
  )
  with check (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = 'barbers'
    and (select private.is_admin())
  );

create policy site_media_admin_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = 'barbers'
    and (select private.is_admin())
  );
