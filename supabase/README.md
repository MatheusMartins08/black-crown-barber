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
  | `ex_assinante` | sem assinatura vigente, mas já assinou | não |
  | `avulso` | nunca assinou | não |

- **Snapshot:** um atendimento concluído durante o atraso fica registrado como avulso mesmo que o cliente pague depois. Para mudar, o admin reabre e conclui de novo.
- **Privacidade:** as RPCs do site não revelam a situação de ninguém. Quem digita um telefone no agendamento não descobre se aquela pessoa é assinante.
- A mesma regra está em `app/data/painel.ts` (`getMembership`), que alimenta o painel com dados de exemplo até ele ler o Supabase.

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
| 23P01 | — | sobreposição de horário ou de assinatura (inserções diretas do painel) |
| 42501 | — | sem permissão (RLS, grant ou coluna protegida) |

## Ao criar novas tabelas

O Supabase concede tudo a `anon` e `authenticated` em tabelas novas de `public`. Em toda migration futura, revogue esse acesso, conceda só o necessário e habilite a RLS, como em `…120400_rls_policies.sql`.
