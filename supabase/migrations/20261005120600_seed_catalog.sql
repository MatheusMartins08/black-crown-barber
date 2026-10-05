-- Catálogo inicial, igual ao que o site usa hoje (app/data/site.ts, booking.ts e
-- painel.ts). Clientes e agendamentos ilustrativos do painel não entram.
--
-- Primeiro administrador (rodar uma vez no SQL Editor, depois de criar o usuário
-- em Authentication > Users):
--   insert into public.staff_members (user_id, role, display_name)
--   values ('<uuid do usuário>', 'admin', '<nome>');
--
-- Barbeiro com login (professional_id é obrigatório para o papel "barbeiro"):
--   insert into public.staff_members (user_id, role, professional_id, display_name)
--   select '<uuid do usuário>', 'barbeiro', id, name from public.professionals where slug = 'julia';

insert into public.shop_settings (id, name, description, address, city, phone, whatsapp, instagram)
values (
  1,
  'Black Crown Barber',
  'Cortes masculinos, barba e cuidado em uma barbearia de estilo clássico e contemporâneo.',
  'Rua Exemplo, 123',
  'Belo Horizonte - MG',
  '(31) 99999-9999',
  '(31) 99999-9999',
  '@blackcrownbarber'
);

insert into public.payroll_settings (id, walk_in_commission_rate) values (1, 0.5);

insert into public.opening_hours (weekday, opens_at, closes_at) values
  (0, null, null),
  (1, '09:00', '20:00'),
  (2, '09:00', '20:00'),
  (3, '09:00', '20:00'),
  (4, '09:00', '20:00'),
  (5, '09:00', '21:00'),
  (6, '09:00', '18:00');

insert into public.services (slug, name, description, duration_minutes, price, icon, is_popular, sort_order) values
  ('corte', 'Corte masculino', 'Corte personalizado, acabamento e finalização.', 30, 55, 'scissors', false, 1),
  ('barba', 'Barba', 'Modelagem, toalha quente e acabamento preciso.', 30, 45, 'mustache', false, 2),
  ('corte-barba', 'Corte + barba', 'Cuidado completo para cabelo e barba.', 50, 90, 'razor', true, 3),
  ('sobrancelha', 'Sobrancelha', 'Design e limpeza para um acabamento natural.', 15, 25, 'eyebrow', false, 4);

insert into public.service_payouts (service_id, plan_payout_amount)
select s.id, v.amount
from (values ('corte', 22), ('barba', 18), ('corte-barba', 35), ('sobrancelha', 10)) as v (slug, amount)
join public.services s on s.slug = v.slug;

insert into public.professionals (slug, name, specialty, description, image_url, image_alt, image_position, sort_order) values
  (
    'julia', 'Júlia Andrade', 'Fades e cortes modernos',
    'Transições suaves, texturas e cortes atuais pensados para o seu tipo de cabelo.',
    '/barber-julia.jpg', 'Retrato da barbeira Júlia Andrade, de avental, no salão', '50% 43%', 1
  ),
  (
    'rafael', 'Rafael Martins', 'Barba e acabamento clássico',
    'Navalha, toalha quente e contornos precisos para uma barba sempre alinhada.',
    '/barber-rafael.jpg', 'Barbeiro Rafael Martins segurando máquina e pente na barbearia', '50% 32%', 2
  ),
  (
    'joao', 'João Almeida', 'Cortes tradicionais e tesoura',
    'Cortes clássicos feitos na tesoura, com atenção ao caimento e ao acabamento.',
    '/barber-joao.jpg', 'Retrato do barbeiro João Almeida', '50% 36%', 3
  );

-- Hoje todos os profissionais atendem todos os serviços.
insert into public.professional_services (professional_id, service_id)
select p.id, s.id from public.professionals p cross join public.services s;

insert into public.subscription_plans (slug, name, monthly_price, sort_order) values
  ('plano-corte', 'Plano Corte', 99, 1),
  ('plano-barba', 'Plano Barba', 89, 2),
  ('plano-coroa', 'Plano Coroa', 169, 3);

insert into public.plan_services (plan_id, service_id)
select sp.id, s.id
from (values
  ('plano-corte', 'corte'),
  ('plano-barba', 'barba'),
  ('plano-coroa', 'corte'),
  ('plano-coroa', 'barba'),
  ('plano-coroa', 'corte-barba')
) as v (plan_slug, service_slug)
join public.subscription_plans sp on sp.slug = v.plan_slug
join public.services s on s.slug = v.service_slug;
