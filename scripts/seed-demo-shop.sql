-- Dados fictícios para uma barbearia de demonstração (depois de provision-shop.mjs ou da RPC
-- provision_shop): contato, serviços com um combo, barbeiros, planos, dois assinantes sem login
-- e algumas reservas nos próximos dias.
--
-- Uso: troque v_slug abaixo e rode o arquivo inteiro no SQL Editor (ou pelo MCP do Supabase).
-- Pode rodar de novo: o que já existe fica como está, e reserva em horário ocupado é pulada.
--
-- Telefones e endereço são falsos de propósito. As fotos dos barbeiros são as de exemplo do
-- template (/public); o admin troca pelo painel.

do $$
declare
  v_slug text := 'barbearia-demo';
  v_shop uuid := public.resolve_shop_slug(v_slug);
  v_customer uuid;
  v_day date;
  v_booking record;
  v_subscriber record;
begin
  if v_shop is null then
    raise exception 'Barbearia % não existe. Rode provision-shop.mjs (ou provision_shop) antes.', v_slug;
  end if;

  update public.shop_settings
  set description = 'Barbearia de demonstração: cortes, barba e planos mensais para testar a plataforma.',
      address = 'Rua Exemplo, 456 - Centro',
      city = 'São Paulo - SP',
      phone = '(11) 90000-0000',
      whatsapp = '(11) 90000-0000',
      instagram = '@barbeariademo'
  where shop_id = v_shop;

  insert into public.services (shop_id, slug, name, description, duration_minutes, price, icon, is_popular, sort_order) values
    (v_shop, 'corte', 'Corte masculino', 'Corte na máquina ou na tesoura, com lavagem e finalização.', 30, 50, 'scissors', false, 1),
    (v_shop, 'barba', 'Barba', 'Toalha quente, navalha e hidratação.', 30, 40, 'mustache', false, 2),
    (v_shop, 'corte-barba', 'Corte + barba', 'O combo completo para cabelo e barba.', 60, 80, 'razor', true, 3),
    (v_shop, 'sobrancelha', 'Sobrancelha', 'Limpeza e alinhamento na navalha.', 15, 20, 'eyebrow', false, 4)
  on conflict (shop_id, slug) do nothing;

  insert into public.service_components (shop_id, service_id, component_id)
  select v_shop, combo.id, part.id
  from public.services combo
  join public.services part on part.shop_id = v_shop and part.slug in ('corte', 'barba')
  where combo.shop_id = v_shop and combo.slug = 'corte-barba'
  on conflict do nothing;

  insert into public.service_payouts (shop_id, service_id, plan_payout_amount)
  select v_shop, s.id, v.amount
  from (values ('corte', 20), ('barba', 16), ('corte-barba', 32), ('sobrancelha', 8)) as v (slug, amount)
  join public.services s on s.shop_id = v_shop and s.slug = v.slug
  on conflict do nothing;

  insert into public.professionals (shop_id, slug, name, specialty, description, image_url, image_alt, image_position, sort_order) values
    (
      v_shop, 'carlos', 'Carlos Souza', 'Degradê e cortes modernos',
      'Especialista em degradê, risquinho e cortes atuais.',
      '/barber-joao.jpg', 'Retrato do barbeiro Carlos Souza', '50% 36%', 1
    ),
    (
      v_shop, 'bianca', 'Bianca Lima', 'Tesoura e visagismo',
      'Cortes na tesoura pensados para o formato do rosto.',
      '/barber-julia.jpg', 'Retrato da barbeira Bianca Lima, de avental, no salão', '50% 43%', 2
    ),
    (
      v_shop, 'diego', 'Diego Rocha', 'Barba e navalha',
      'Barba desenhada na navalha, com toalha quente e acabamento preciso.',
      '/barber-rafael.jpg', 'Barbeiro Diego Rocha segurando máquina e pente', '50% 32%', 3
    )
  on conflict (shop_id, slug) do nothing;

  insert into public.professional_services (shop_id, professional_id, service_id)
  select v_shop, p.id, s.id
  from public.professionals p
  join public.services s on s.shop_id = v_shop
  where p.shop_id = v_shop
  on conflict do nothing;

  insert into public.subscription_plans (shop_id, slug, name, description, monthly_price, sort_order) values
    (v_shop, 'plano-essencial', 'Plano Essencial', 'Dois cortes por mês.', 89, 1),
    (v_shop, 'plano-completo', 'Plano Completo', 'Corte + barba toda semana e sobrancelha duas vezes por mês.', 189, 2)
  on conflict (shop_id, slug) do nothing;

  insert into public.plan_services (shop_id, plan_id, service_id, weekly_limit, period)
  select v_shop, sp.id, s.id, v.qty, v.period
  from (values
    ('plano-essencial', 'corte', 2, 'mes'),
    ('plano-completo', 'corte-barba', 1, 'semana'),
    ('plano-completo', 'sobrancelha', 2, 'mes')
  ) as v (plan_slug, service_slug, qty, period)
  join public.subscription_plans sp on sp.shop_id = v_shop and sp.slug = v.plan_slug
  join public.services s on s.shop_id = v_shop and s.slug = v.service_slug
  on conflict do nothing;

  -- Reservas pela mesma RPC do site (valida expediente, conflito e serviço do profissional).
  -- day = n-ésimo dia de segunda a sábado a partir de amanhã.
  for v_booking in
    select * from (values
      (1, '10:00', 'carlos', array['corte'], 'Lucas Pereira', '11900000101'),
      (1, '14:30', 'diego', array['corte-barba'], 'Rafael Gomes', '11900000102'),
      (2, '09:30', 'bianca', array['corte', 'sobrancelha'], 'André Santos', '11900000103'),
      (3, '16:00', 'diego', array['barba'], 'Marcos Oliveira', '11900000104'),
      (4, '11:00', 'carlos', array['corte-barba'], 'Felipe Costa', '11900000105')
    ) as b (day, at, professional, services, name, phone)
  loop
    select d into v_day
    from generate_series(current_date + 1, current_date + 14, interval '1 day') as g (d)
    where extract(dow from d) <> 0
    order by d
    offset v_booking.day - 1
    limit 1;

    begin
      perform public.create_reservation(
        v_shop, v_booking.services, v_booking.professional, v_day, v_booking.at, null,
        v_booking.name, v_booking.phone
      );
    exception when others then
      raise notice 'Reserva de % em % às % pulada: %', v_booking.name, v_day, v_booking.at, sqlerrm;
    end;
  end loop;

  -- Assinantes sem login (o admin cria o login no painel). save_subscriber e set_subscription
  -- aceitam o admin logado ou a service role; aqui a sessão se apresenta como service role.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  for v_subscriber in
    select * from (values
      ('Gustavo Ribeiro', '11900000201', 'plano-essencial'),
      ('Thiago Martins', '11900000202', 'plano-completo')
    ) as s (name, phone, plan)
  loop
    if not exists (select 1 from public.customers where shop_id = v_shop and phone = v_subscriber.phone) then
      v_customer := public.save_subscriber(v_shop, null, v_subscriber.name, v_subscriber.phone, null);
      perform public.set_subscription(v_shop, v_customer, v_subscriber.plan, 'ativo');
    end if;
  end loop;
end;
$$;
