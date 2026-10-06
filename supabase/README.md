# Banco de dados (Supabase)

Schema da Black Crown Barber: agenda, clientes, planos e repasse da equipe. As migrações ficam em `migrations/` e rodam em ordem.

| arquivo | conteúdo |
| --- | --- |
| `…120000_extensions_and_types` | `btree_gist`, schema `private`, enums, `set_updated_at` |
| `…120100_catalog` | configuração, expediente, serviços, profissionais, planos e repasses |
| `…120200_people` | equipe, clientes, assinaturas, helpers de fuso e de papel |
| `…120300_scheduling` | bloqueios, agendamentos, triggers e a view `appointment_details` |
| `…120400_rls_policies` | grants e RLS |
| `…120500_booking_rpc` | RPCs do agendamento público |
| `…120600_seed_catalog` | catálogo atual do site (sem clientes nem agendamentos) |
| `…120700_harden_helper_functions` | tira os helpers da API (só as RPCs do agendamento ficam públicas) |
| `…120800_memberships` | mensalidades, situação do assinante, perfil do cliente e consentimento do WhatsApp |
| `…120900_billing_cron` | job diário do pg_cron que gera as mensalidades |
| `…121000_subscriber_accounts` | planos Bronze/Prata/Ouro com limite semanal, situação manual (ativo, congelado, inativo), login do assinante e RPCs do assinante e do painel |

## Como aplicar

Este projeto aplica as migrações **pelo MCP do Supabase** (`apply_migration`, configurado em `.mcp.json`), em ordem e uma vez cada. Os arquivos daqui são a fonte; o nome passado ao `apply_migration` é o nome do arquivo sem o prefixo de data.

O MCP registra cada migração com a data e hora em que ela foi aplicada, não com o prefixo do arquivo. Por isso, **não use `supabase db push` neste projeto**: a CLI acharia que nada rodou e tentaria aplicar tudo de novo.

Migrações com trecho destrutivo (por exemplo, `drop function`) podem ser rodadas pelo dono do projeto no **SQL Editor**, arquivo inteiro de uma vez. O SQL Editor não grava histórico: depois de rodar, registre a migração em `supabase_migrations.schema_migrations` (versão e nome) para a pasta e o banco continuarem batendo.

Depois de aplicar:

1. **Desative o cadastro público** em Authentication → Sign In / Providers ("Allow new users to sign up"). As políticas já tratam um usuário logado sem vínculo como visitante, mas não há motivo para deixar o cadastro aberto.
2. **Cadastre o primeiro admin:** crie o usuário em Authentication → Users e rode no SQL Editor:

   ```sql
   insert into public.staff_members (user_id, role, display_name)
   values ('<uuid do usuário>', 'admin', '<nome>');
   ```

   Barbeiros usam `role = 'barbeiro'` e precisam de `professional_id`.

## Regras principais

- **Agenda travada no executor** (`performed_by_id`): o mesmo profissional nunca tem dois atendimentos `agendado`/`concluido` sobrepostos. `faltou` e `cancelado` liberam o horário.
- **Toda inserção é validada no banco**, venha do site, do painel ou do balcão. O banco exige expediente aberto, ausência de bloqueio e profissional habilitado no serviço. O preço é copiado do serviço e `ends_at` é calculado pela duração. A antecedência mínima de 60 min vale só para o site.
- **Liquidação:** ao marcar `concluido`, o banco grava `covered_by_plan`, `charged_amount` e `payout_amount`. O fechamento usa esses valores; a view expõe `covered_live` para a agenda em aberto.
- **Equipe (não admin):** altera apenas `status` e `performed_by_id`, e não reabre um atendimento concluído.
- **Repasse** (`payroll_settings`, `service_payouts`): visível só para a equipe.
- **Fuso:** "hoje" e os horários locais usam `shop_settings.timezone` (America/Sao_Paulo), nunca o fuso da sessão.

## Assinantes e mensalidades

- **Perfil do cliente:** é a linha de `customers`, sem login. O telefone é o WhatsApp. `whatsapp_opt_in` guarda o consentimento (LGPD) para lembretes; a reserva pelo site pode dar o consentimento, mas não retirar.
- **Mensalidades** (`subscription_payments`): uma por mês de cada assinatura, ancorada no dia de início e vencendo no começo do período (pré-paga). São geradas na criação da assinatura, ao concluir um atendimento e todo dia às 03:00 (pg_cron). A geração completa meses que faltaram, por exemplo depois de uma pausa do projeto. O pagamento é registrado manualmente pelo admin (Pix, cartão ou dinheiro); a equipe só consulta.
- **Situação do cliente** (`private.membership_status`, exposta em `customer_profiles` e `appointment_details`):

  | situação | regra | o plano cobre? |
  | --- | --- | --- |
  | `ativo` | assinatura vigente e nenhuma mensalidade vencida em aberto | sim |
  | `pendente` | mensalidade vencida em aberto, dentro de `shop_settings.subscription_grace_days` (5) | sim |
  | `atrasado` | em aberto há mais dias que a tolerância | não: o atendimento é cobrado como avulso |
  | `congelado` | período vigente com status `suspensa` (congelado pela barbearia) | não |
  | `ex_assinante` | sem assinatura vigente, mas já assinou (assinante inativo) | não |
  | `avulso` | nunca assinou | não |

- **Snapshot:** um atendimento concluído durante o atraso fica registrado como avulso mesmo que o cliente pague depois. Para mudar, o admin reabre e conclui de novo.
- **Privacidade:** as RPCs do site não revelam a situação de ninguém. Quem digita um telefone no agendamento não descobre se aquela pessoa é assinante.
- A mesma regra está em `app/data/painel.ts` (`getMembership`), que alimenta o painel com dados de exemplo até ele ler o Supabase.

## Assinantes e login

- **Planos:** Bronze (corte), Prata (corte) e Ouro (corte, barba e sobrancelha), cada benefício 1× por semana (`plan_services.weekly_limit`). Valores provisórios: R$ 99, R$ 129 e R$ 189. O catálogo do front é `app/data/plans.ts`; mantenha os dois iguais.
- **Situação manual** (painel → Assinantes): cada linha de `customer_subscriptions` é um período com plano e situação fixos.

  | painel | período | o plano cobre? | gera mensalidade? |
  | --- | --- | --- | --- |
  | Ativo | `ativa` | sim, se em dia e dentro do limite semanal | sim |
  | Congelado | `suspensa` | não | não |
  | Inativo | nenhum período vigente | não | não |

  `set_subscription` encerra o período atual na véspera e abre outro hoje; a mensalidade passa a vencer na data da mudança, sem rateio. No dia em que o período começou, ele é ajustado no lugar (`cancelada` = período anulado no mesmo dia).
- **Limite semanal** (segunda a domingo, fuso da barbearia): contam os agendamentos feitos antes e os concluídos cobertos pelo plano; faltas e cancelamentos liberam o benefício. A mesma regra vale na prévia do site (`get_plan_coverage`), na reserva (`create_subscriber_reservation`) e na liquidação (`appointments_settle`), via `private.plan_coverage`.
- **Login:** o telefone é o login e a senha fica **só no Supabase Auth** (bcrypt). `customers.user_id` liga o cliente ao usuário do Auth. Nenhuma tabela do projeto guarda senha.
- **Integração (rotina de servidor, com a service role, nunca no navegador):**
  1. Cadastrar: `auth.admin.createUser` com o telefone como identificador e a senha inicial, depois `save_subscriber(null, nome, telefone, user_id)` e `set_subscription(id, plano, status)`. Se uma das RPCs falhar, apague o usuário criado.
  2. Editar telefone: atualizar o identificador no Auth e chamar `save_subscriber(id, nome, telefone)`.
  3. Redefinir senha: `auth.admin.updateUserById(user_id, { password })`.
  4. Identificador: com o provider **Phone** ligado, use `phone` (+55…) em `createUser` e `signInWithPassword({ phone, password })`. Sem provedor de SMS configurado, use um e-mail sintético derivado do telefone (ex.: `5531999999999@assinante.invalid`, com `email_confirm: true`) e faça o login com ele: para o cliente, o login continua sendo o telefone.
- O painel lista os assinantes pela view `subscriber_accounts` (só equipe). As funções `save_subscriber` e `set_subscription` aceitam o admin logado ou a service role.
- **Primeira mensalidade:** o cadastro gera a mensalidade do período como `pendente`; registre o pagamento feito no balcão em Clientes → Receber, ou o plano entra em atraso depois da tolerância.
- Equivalência com o front: `app/lib/subscribers-api.ts` lista, função por função, a chamada que cada uma vira.

## Login do assinante

O assinante entra com telefone e senha, sem SMS. Por baixo, o Supabase Auth usa um e-mail interno gerado do telefone: `<dígitos>@assinantes.blackcrown.app` (`getSubscriberLoginEmail` em `app/data/subscribers.ts`). Esse e-mail nunca é mostrado nem recebe mensagens. Criar o login, trocar o telefone e redefinir a senha são Server Actions do painel (`app/painel/actions.ts`), que conferem que quem chama é admin e usam a `SUPABASE_SECRET_KEY`.

## RPCs do site

Equivalentes às funções de `app/agendamento/lib/booking-api.ts`. O visitante (anon) acessa os agendamentos só por elas.

| RPC | substitui |
| --- | --- |
| `get_day_availability(p_service, p_professional, p_date)` | `fetchDayAvailability` |
| `get_day_summaries(p_service, p_professional, p_start, p_days)` | `fetchDaySummaries` |
| `find_next_available(p_service, p_professional, p_from)` | `findNextAvailable` |
| `create_reservation(p_service, p_professional, p_date, p_time, p_assigned_professional, p_name, p_phone, p_email, p_notes, p_whatsapp_opt_in)` | `createReservation` (retorna o JSON de `Reservation`) |
| `get_reservation(p_code, p_phone)` | remarcar (ainda desativado no site) |
| `cancel_reservation(p_code, p_phone)` | cancelar (ainda desativado no site); exige 120 min de antecedência |
| `get_subscriber_session()` | `getSubscriberSession` (assinante logado; formato de `SubscriberSession`) |
| `get_plan_coverage(p_service, p_date)` | `fetchPlanCoverage` (formato de `PlanCoverage`) |
| `create_subscriber_reservation(p_service, p_professional, p_date, p_time, p_assigned_professional)` | `createSubscriberReservation` (usa o cadastro do assinante logado) |
| `save_subscriber(p_customer_id, p_name, p_phone, p_user_id)` | `createSubscriber` / `updateSubscriber` (admin ou service role) |
| `set_subscription(p_customer_id, p_plan, p_status)` | `changeSubscriberPlan` / `changeSubscriberStatus` (admin ou service role) |

Os serviços e profissionais são identificados pelos mesmos slugs do front (`corte`, `julia`, `qualquer`…).

## Códigos de erro

O PostgREST devolve `code` (SQLSTATE), `message` (chave) e `hint` (texto em pt-BR para exibir).

| code | message | quando |
| --- | --- | --- |
| BC001 | `invalid_request` | dados inválidos, serviço ou profissional inexistente |
| BC002 | `slot_unavailable` | horário ocupado ou fora da janela (corresponde ao `slot_unavailable` do front) |
| BC003 | `outside_opening_hours` | fora do expediente |
| BC004 | `professional_blocked` | bloqueio na agenda do profissional |
| BC005 | `service_not_offered` | profissional não atende o serviço |
| BC007 | `cancel_too_late` | cancelamento pelo site sem a antecedência mínima |
| BC008 | `reservation_not_found` | código e telefone não conferem |
| BC009 | `not_cancellable` | reserva já concluída, cancelada ou com falta |
| BC010 | `phone_in_use` | telefone já é login de outro assinante (ou, na edição, de outro cliente) |
| BC011 | `subscriber_not_found` | assinante inexistente ou login sem cadastro de assinante |
| 23P01 | — | sobreposição de horário ou de assinatura (inserções diretas do painel) |
| 42501 | — | sem permissão (RLS, grant ou coluna protegida) |

## Ao criar novas tabelas

O Supabase concede tudo a `anon` e `authenticated` em tabelas novas de `public`. Em toda migration futura, revogue esse acesso, conceda só o necessário e habilite a RLS, como em `…120400_rls_policies.sql`.
