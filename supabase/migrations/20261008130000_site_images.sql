-- Edição do site (etapa 3): imagens editáveis da landing.
--
-- Uma linha por posição fixa: as 8 da galeria (gallery-1 … gallery-8, na ordem do site;
-- o formato de cada uma no layout fica no código) e a foto da seção "A barbearia"
-- (about). Não se cria nem apaga posição: o painel só troca imagem, legenda e texto
-- alternativo. image_url aceita o caminho local atual (/gallery-corte-01.jpg) ou a URL
-- pública do bucket site-media. Fundos (hero, agendamento) e o comparador Antes/Depois
-- não entram aqui.
--
-- Aditivo: tabela nova com o conteúdo atual do site; as políticas do bucket passam a
-- aceitar também as pastas gallery/ e barbershop/ (alter policy, nada é apagado).

create table public.site_images (
  slot text primary key check (slot ~ '^(gallery-[1-8]|about)$'),
  label text not null check (char_length(btrim(label)) between 1 and 40),
  alt text not null check (char_length(btrim(alt)) between 1 and 200),
  image_url text not null,
  image_position text not null default '50% 50%',
  sort_order smallint not null,
  updated_at timestamptz not null default now()
);

comment on table public.site_images is
  'Imagens da landing editáveis pelo painel (galeria e foto da barbearia). Posições fixas.';

create trigger set_updated_at before update on public.site_images
  for each row execute function public.set_updated_at();

insert into public.site_images (slot, label, alt, image_url, sort_order) values
  ('about', 'A barbearia', 'Interior de barbearia com cadeiras de barbeiro e quadros nas paredes', '/gallery-interior-01.jpg', 0),
  ('gallery-1', 'Acabamento', 'Barbeiro refinando um corte masculino com tesoura e pente', '/gallery-corte-01.jpg', 1),
  ('gallery-2', 'Barba', 'Barbeiro aparando o cabelo e a barba de um cliente com navalha', '/gallery-barba-01.jpg', 2),
  ('gallery-3', 'Corte', 'Barbeiro trabalhando o corte de um cliente na cadeira com tesoura', '/gallery-corte-02.jpg', 3),
  ('gallery-4', 'Ambiente', 'Barbearia com cadeiras de barbeiro e quadros nas paredes', '/gallery-interior-01.jpg', 4),
  ('gallery-5', 'Estilo', 'Barbeiro finalizando o penteado de um cliente com secador', '/gallery-corte-03.jpg', 5),
  ('gallery-6', 'Precisão', 'Barbeiro aparando o cabelo de um cliente com máquina', '/gallery-corte-04.jpg', 6),
  ('gallery-7', 'Barbearia', 'Interior de barbearia com clientes sendo atendidos nas cadeiras', '/gallery-interior-02.jpg', 7),
  ('gallery-8', 'Finalização', 'Barbeiros atendendo clientes em uma barbearia contemporânea', '/gallery-corte-05.jpg', 8);

-- --- Grants e RLS (mesmo padrão de …120400_rls_policies) ---

revoke all on public.site_images from anon, authenticated;
grant select on public.site_images to anon, authenticated;
grant update (label, alt, image_url, image_position) on public.site_images to authenticated;

alter table public.site_images enable row level security;

create policy site_images_select on public.site_images
  for select to anon, authenticated using (true);

create policy site_images_admin_update on public.site_images
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- --- Bucket site-media: pastas da galeria e da foto da barbearia ---

alter policy site_media_admin_select on storage.objects
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
    and (select private.is_admin())
  );

alter policy site_media_admin_insert on storage.objects
  with check (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
    and (select private.is_admin())
  );

alter policy site_media_admin_update on storage.objects
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
    and (select private.is_admin())
  )
  with check (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
    and (select private.is_admin())
  );

alter policy site_media_admin_delete on storage.objects
  using (
    bucket_id = 'site-media'
    and (storage.foldername(name))[1] = any (array['barbers', 'gallery', 'barbershop'])
    and (select private.is_admin())
  );
