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
| `20261006120000_history_retention` | prazo de 6 meses do histórico e limpeza diária (pg_cron) |
| `20261007120000_site_media_storage` | bucket público `site-media` (fotos editáveis pelo painel) e políticas: só o admin envia, troca ou apaga, por enquanto na pasta `barbers/` |
| `20261008120000_professionals_soft_delete` | `professionals.deleted_at` (exclusão lógica de quem tem histórico) |
| `20261008130000_site_images` | `site_images` (8 posições da galeria e a foto da barbearia, editáveis pelo admin) e pastas `gallery/` e `barbershop/` no bucket |
| `20261008140000_services_editing` | `services.deleted_at`, `appointments.service_name` (nome copiado na reserva, trigger `appointments_25_service_name`) e `appointment_details` lendo a cópia |
| `20261008150000_plans_editing` | planos editáveis: `description` e `deleted_at`, `plan_services.period` (semanal ou mensal), leitura de planos inativos não excluídos, `plan_coverage` com janela mensal (ciclo da mensalidade) e `set_subscription` aceitando o plano atual do cliente mesmo inativo |
| `20261008160000_opening_periods_and_exceptions` | `opening_periods` (horário semanal com vários períodos por dia, preenchida com `opening_hours`), `schedule_exceptions` (fechado, horário especial, bloqueio de um trecho) e os helpers `private.day_periods` / `private.day_blocks` |
| `20261008170000_schedule_uses_periods` | `free_slots`, `get_day_summaries` e `appointments_prepare` passam a usar os períodos e as exceções (mesmas assinaturas; resultado idêntico sem exceções); a checagem de expediente não roda mais só por trocar quem executa |
| `20261009120000_appointment_services_and_combos` | `appointment_services` (serviços de cada agendamento, com cópia da reserva e liquidação por serviço; 1 item por atendimento antigo) e `service_components` (combos: `corte-barba` = `corte` + `barba`). Só aditiva |
| `20261009130000_multi_service_booking` | vários serviços no mesmo agendamento: RPCs com `p_services text[]` (as de `p_service text` ficam como atalho), horários pela duração somada, reserva grava os itens, cobertura e liquidação por serviço, gatilhos `appointments_50_sync_items` e `appointments_60_check_items`, `reservation_json` com `services` e `appointment_details` com `service_ids` e `items` |
| `20261009140000_subscriber_reservation_grant` | tira do `anon` o execute de `create_subscriber_reservation(text[], …)` (só assinante logado) |
| `20261010120000_staff_access_and_professional_hours` | papéis admin × barbeiro: `staff_members.login` e `is_active` (helpers de papel exigem acesso ativo); dados financeiros (atendimentos com valores, clientes, assinaturas, mensalidades, repasses) só para o admin; RPCs `get_team_agenda` e `update_team_appointment` (agenda operacional da equipe, sem valores); horário por profissional (`professional_id` em `opening_periods` e `schedule_exceptions`) limitado ao da barbearia, usado pela agenda pública e por `appointments_prepare` (BC014) |
| `20261010120100_opening_periods_overlap_per_owner` | a restrição de sobreposição do horário semanal passa a valer por dono (barbearia ou cada profissional) |

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
- **Toda inserção é validada no banco**, venha do site, do painel ou do balcão. O banco exige expediente aberto (períodos e exceções da barbearia), ausência de bloqueio e profissional habilitado no serviço. O preço é copiado do serviço e `ends_at` é calculado pela duração. A antecedência mínima de 60 min vale só para o site.
- **Liquidação:** ao marcar `concluido`, o banco grava `covered_by_plan`, `charged_amount` e `payout_amount`. O fechamento usa esses valores; a view expõe `covered_live` para a agenda em aberto.
- **Vários serviços (1 a 5) no mesmo agendamento:** 1 cliente → 1 profissional → 1 agendamento → N serviços.
  - `appointment_services` guarda cada serviço com nome, preço e duração da reserva.
  - `appointments` guarda os totais: `price` e `ends_at` são somas, `service_name` é "Corte masculino + Sobrancelha", `service_id` é o 1º serviço.
  - O intervalo inteiro fica reservado, e a exclusão `appointments_no_overlap` cobre o bloco todo. Cancelar libera o bloco todo.
  - `private.resolve_services` recusa repetição e combos em conflito (`BC012`). Um serviço simples conta como ele mesmo, um combo conta como as suas partes, e uma parte não pode aparecer duas vezes.
  - A reserva recalcula tudo no servidor e grava os itens antes do agendamento (FK adiada). `appointments_prepare` tira os totais dos itens, e `appointments_60_check_items` confere no commit que os totais batem com os itens.
  - Uma inserção ou troca de serviço direta, de um item só, é espelhada em `appointment_services` por `appointments_50_sync_items`. Trocar o serviço de um agendamento com vários serviços é recusado.
- **Plano com vários serviços:** cada serviço é avaliado no plano com o próprio limite.
  - O combo só é coberto se o próprio combo estiver no plano. Não existe rateio.
  - Ao concluir, cada item recebe a cobertura, o valor cobrado e o repasse (serviço coberto: R$ 0 e repasse fixo; fora do plano: preço e comissão de avulso). O agendamento recebe as somas, e `covered_by_plan` só é verdadeiro se todos os itens foram cobertos.
  - No fechamento, "Atendidos" conta agendamentos. As colunas por serviço, planos, avulsos e repasses contam itens.
- **Papéis** (`staff_members.role`): `admin` (dono, painel completo) e `barbeiro` (painel dos barbeiros, sempre ligado a um `professional_id`). Um login só (`/painel/entrar`); o papel decide para onde ir. `is_active = false` corta o acesso na hora (`private.is_staff` / `is_admin` / `current_professional_id` exigem ativo) sem apagar nada.
- **Dados financeiros só para o admin:** `appointments`, `appointment_services`, `customers`, `customer_subscriptions`, `subscription_payments`, `payroll_settings` e `service_payouts` (e as views `appointment_details`, `customer_profiles`, `subscriber_accounts`). O barbeiro vê a agenda pela RPC `get_team_agenda` (toda a equipe, só colunas operacionais: horário, cliente, serviços, duração, profissionais, status e o plano quando vale no dia) e altera status/executor dos próprios horários pela RPC `update_team_appointment`. O gatilho `appointments_guard` continua limitando as colunas e impedindo reabrir um concluído.
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

- **Planos:** editados no painel (Edição do site > Planos): nome, descrição, mensalidade e serviços incluídos, cada um com quantidade por **semana** (segunda a domingo, 1–7) ou por **mês** (1–31, no ciclo da mensalidade: dia de início da assinatura + k meses, a mesma âncora das mensalidades). `plan_services.weekly_limit` guarda a quantidade e `period` o período. O front lê tudo do banco (nada fixo em `app/data/plans.ts`).
- **Mudanças em planos:** a mensalidade nova vale para os ciclos gerados depois (cada `subscription_payments.amount` guarda o valor do ciclo). Mudar os serviços incluídos vale na hora para quem assina; atendimentos concluídos guardam a cobertura gravada. Inativo = não aceita novos assinantes (quem já assina continua, e `set_subscription` aceita o plano atual do cliente para congelar/reativar). Excluir é bloqueado enquanto houver assinante com período em aberto; com histórico, a exclusão é lógica (`deleted_at`).
- **Situação manual** (painel → Clientes → aba Assinantes): cada linha de `customer_subscriptions` é um período com plano e situação fixos.

  | painel | período | o plano cobre? | gera mensalidade? |
  | --- | --- | --- | --- |
  | Ativo | `ativa` | sim, se em dia e dentro do limite semanal | sim |
  | Congelado | `suspensa` | não | não |
  | Inativo | nenhum período vigente | não | não |

  `set_subscription` encerra o período atual na véspera e abre outro hoje; a mensalidade passa a vencer na data da mudança, sem rateio. No dia em que o período começou, ele é ajustado no lugar (`cancelada` = período anulado no mesmo dia).
- **Limite do benefício** (semana de segunda a domingo ou ciclo mensal da assinatura, fuso da barbearia): contam os agendamentos feitos antes e os concluídos cobertos pelo plano; faltas e cancelamentos liberam o benefício. A mesma regra vale na prévia do site (`get_plan_coverage`), na reserva (`create_subscriber_reservation`) e na liquidação (`appointments_settle`), via `private.plan_coverage`.
- **Login:** o telefone é o login e a senha fica **só no Supabase Auth** (bcrypt). `customers.user_id` liga o cliente ao usuário do Auth. Nenhuma tabela do projeto guarda senha.
- **Integração (rotina de servidor, com a service role, nunca no navegador):**
  1. Cadastrar: `auth.admin.createUser` com o telefone como identificador e a senha inicial, depois `save_subscriber(null, nome, telefone, user_id)` e `set_subscription(id, plano, status)`. Se uma das RPCs falhar, apague o usuário criado.
  2. Editar telefone: atualizar o identificador no Auth e chamar `save_subscriber(id, nome, telefone)`.
  3. Redefinir senha: `auth.admin.updateUserById(user_id, { password })`.
  4. Identificador: com o provider **Phone** ligado, use `phone` (+55…) em `createUser` e `signInWithPassword({ phone, password })`. Sem provedor de SMS configurado, use um e-mail sintético derivado do telefone (ex.: `5531999999999@assinante.invalid`, com `email_confirm: true`) e faça o login com ele: para o cliente, o login continua sendo o telefone.
- O painel lista os assinantes pela view `subscriber_accounts` (só equipe). As funções `save_subscriber` e `set_subscription` aceitam o admin logado ou a service role.
- **Primeira mensalidade:** o cadastro gera a mensalidade do período como `pendente`; registre o pagamento feito no balcão em Clientes → aba Clientes → Receber, ou o plano entra em atraso depois da tolerância.
- Equivalência com o front: `app/lib/subscribers-api.ts` lista, função por função, a chamada que cada uma vira.

## Login do assinante

O assinante entra com telefone e senha, sem SMS. Por baixo, o Supabase Auth usa um e-mail interno gerado do telefone: `<dígitos>@assinantes.blackcrown.app` (`getSubscriberLoginEmail` em `app/data/subscribers.ts`). Esse e-mail nunca é mostrado nem recebe mensagens. Criar o login, trocar o telefone e redefinir a senha são Server Actions do painel (`app/painel/actions.ts`), que conferem que quem chama é admin e usam a `SUPABASE_SECRET_KEY`.

## RPCs do site

Equivalentes às funções de `app/agendamento/lib/booking-api.ts`. O visitante (anon) acessa os agendamentos só por elas. As de agenda e reserva recebem a lista de serviços (`p_services text[]`, de 1 a 5, na ordem da escolha); as versões antigas com `p_service text` continuam como atalho para a lista de um item.

| RPC | substitui |
| --- | --- |
| `get_day_availability(p_services, p_professional, p_date)` | `fetchDayAvailability` |
| `get_day_summaries(p_services, p_professional, p_start, p_days)` | `fetchDaySummaries` |
| `find_next_available(p_services, p_professional, p_from)` | `findNextAvailable` |
| `create_reservation(p_services, p_professional, p_date, p_time, p_assigned_professional, p_name, p_phone, p_email, p_notes, p_whatsapp_opt_in)` | `createReservation` (retorna o JSON de `Reservation`, com `services`) |
| `get_reservation(p_code, p_phone)` | remarcar (ainda desativado no site) |
| `cancel_reservation(p_code, p_phone)` | cancelar (ainda desativado no site); exige 120 min de antecedência |
| `get_subscriber_session()` | `getSubscriberSession` (assinante logado; formato de `SubscriberSession`) |
| `get_plan_coverage(p_service, p_date)` | `fetchPlanCoverage` (formato de `PlanCoverage`) |
| `create_subscriber_reservation(p_services, p_professional, p_date, p_time, p_assigned_professional)` | `createSubscriberReservation` (usa o cadastro do assinante logado; `services[].covered` diz o que o plano cobre) |
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
| BC012 | `conflicting_services` | serviços escolhidos que cobrem o mesmo serviço simples (ex.: Corte + "Corte + barba") |
| BC013 | `appointment_items_mismatch` | preço ou duração do agendamento diferente da soma dos serviços (proteção interna) |
| BC014 | `professional_unavailable` | fora do horário próprio do profissional (folga, ausência, horário especial ou bloqueio dele) |
| 23P01 | — | sobreposição de horário ou de assinatura (inserções diretas do painel) |
| 42501 | — | sem permissão (RLS, grant ou coluna protegida) |

## Edição do site (painel)

- **Barbeiros:** a landing, o agendamento e o painel leem `professionals` (nada fixo no front). O site lê como visitante e só vê os ativos; o painel lê todos com a sessão da equipe. Identificador: `id` (uuid) no painel e nas FKs; `slug` nos links públicos e nas RPCs, fixo depois de criado.
- **Inativar × excluir:**
  - **Inativar:** sai do site e de novos agendamentos, continua na lista do painel e pode voltar.
  - **Excluir:** sai também do painel.
    - Sem histórico, a linha é apagada.
    - Com histórico (as FKs `restrict` de `appointments` impedem apagar), a exclusão é lógica: `deleted_at` preenchido e `is_active = false`. O check `professionals_deleted_inactive_check` impede reativar.
    - O excluído continua nos atendimentos e aparece no fechamento só nos períodos em que atendeu.
    - Login de barbeiro ligado a ele perde o acesso; admin ligado só perde o vínculo.
    - Horários futuros nunca são cancelados.
- **Serviços** (`services`, `service_payouts`): editados no painel (nome, descrição, duração, preço, ícone de uma coleção fixa, selo "Mais pedido" e repasse do plano). Cada atendimento guarda preço (`price`), duração (`ends_at`), nome (`service_name`) e, ao concluir, cobrado e repasse: mudar o catálogo vale só para novos agendamentos. Serviço novo é atendido por todos os profissionais ativos. Inativar e excluir seguem a mesma regra dos profissionais; serviço que está em algum plano não pode ser excluído. Um serviço com histórico em qualquer posição de um agendamento (`appointment_services`) é excluído só logicamente.
- **Combos** (`service_components`): no formulário do serviço, "Este serviço é um combo de:" marca os serviços simples que ele inclui. Não há aninhamento: uma parte não pode ser combo, e um serviço que é parte não pode virar combo (gatilho `service_components_check`). O agendamento oferece "Substituir" quando o cliente escolhe um combo junto com uma das partes.
- **Horários** (`opening_periods`, `schedule_exceptions`): horário geral da barbearia, editado no painel. Dia sem período = fechado. Exceções valem numa data ou intervalo: "fechado" (nenhum horário), "horário especial" (substitui o semanal) e "bloqueio" (tira um trecho). A agenda (`private.day_periods` / `day_blocks`) aplica: fechado > horário especial > semanal, menos os bloqueios. `opening_hours` ficou só como histórico e não é mais lida. Nada cancela agendamentos: ao salvar, o painel lista os agendamentos que ficariam fora do expediente e só grava com confirmação; eles continuam na agenda.
- **Horário de cada profissional** (as mesmas tabelas, com `professional_id`): editado pelo admin (Edição do site > Horários, escolhendo o barbeiro) e pelo próprio barbeiro (Meu horário); a RLS deixa o barbeiro escrever só nas linhas do próprio `professional_id`. Sem semanal próprio, o profissional segue o da barbearia. O horário efetivo (`private.professional_day_periods` / `professional_day_blocks`) é o próprio (folga/ausência > horário especial > semanal) ∩ o da barbearia, menos os bloqueios dos dois. Vale para `free_slots`, `get_day_summaries` e `appointments_prepare`. `schedule_blocks` continua valendo (sem tela).
- **Acesso dos barbeiros** (Edição do site > Barbeiros > Editar > Acesso ao painel): Server Actions em `app/painel/staff-access-actions.ts` (admin + `SUPABASE_SECRET_KEY`). O usuário (`staff_members.login`) vira o e-mail interno `<login>@equipe.blackcrown.app` no Auth. A senha fica só no Auth (redefinir, nunca ver). Desativar = `is_active = false` + usuário banido no Auth; reativar desfaz os dois.
- **Imagens do site** (`site_images`): uma linha por posição fixa (`gallery-1` … `gallery-8`, `about`). O admin troca imagem, legenda, descrição e enquadramento; não cria nem apaga posições. O formato de cada posição no layout fica em `app/data/site-images.ts`. Fundos (topo e agendamento) e o comparador Antes/Depois não são editáveis.
- **Fotos** (`site-media`): o navegador reduz a imagem e envia como `<pasta>/<uuid>.<ext>` (`barbers/`, `gallery/` ou `barbershop/`) com a sessão do admin; a Server Action grava a URL e só depois apaga a foto antiga (se for do bucket). Fotos em `/public` nunca são apagadas.

## Ao criar novas tabelas

O Supabase concede tudo a `anon` e `authenticated` em tabelas novas de `public`. Em toda migration futura, revogue esse acesso, conceda só o necessário e habilite a RLS, como em `…120400_rls_policies.sql`.
