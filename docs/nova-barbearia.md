# Nova barbearia na plataforma

Todas as barbearias usam o mesmo banco (Supabase) e, por padrão, o mesmo deploy. Detalhes do banco em [`supabase/README.md`](../supabase/README.md#várias-barbearias-multi-tenant).

## Como o site sabe qual barbearia mostrar

1. O app lê o header `Host` da requisição (`app/lib/shop.ts`).
2. Procura o host na tabela `shop_domains` (RPC `resolve_shop_host`).
3. Se não encontrar, mostra "Página não encontrada". Um domínio desconhecido nunca cai numa loja padrão.

Com `SHOP_SLUG=<slug>` no ambiente, o domínio é ignorado e o deploy inteiro fica preso a essa loja.

O app guarda host → loja em cache por 60 s e o perfil da loja (nome, contato) por 5 min. Um domínio cadastrado agora pode levar cerca de 1 minuto para abrir.

## Lojas cadastradas hoje

| loja | slug | domínios |
| --- | --- | --- |
| Black Crown Barber | `black-crown` | `black-crown-barber-five.vercel.app` (principal), `blackcrown.localhost` |
| Barbearia Demo | `barbearia-demo` | `demo.localhost` (+ o `*.vercel.app` que você adicionar) |
| Barbearia Teste | `barbearia-teste` | `teste.localhost` |

## No seu computador

`npm run dev` e abra a loja pelo subdomínio de `localhost`:

- http://blackcrown.localhost:3000
- http://demo.localhost:3000

O navegador já resolve `*.localhost` para a sua máquina, e o dev server do Next aceita esses hosts sem configuração. O `localhost` puro não funciona, porque o banco exige um ponto no host. Para uma loja nova, cadastre `<algo>.localhost` com `--host`, como no passo 2 abaixo.

Cada subdomínio tem os próprios cookies, então dá para ficar logado no painel de duas lojas ao mesmo tempo, uma em cada aba.

## Cadastrar uma barbearia (mesmo site, domínio próprio)

Este é o caminho recomendado: um deploy só, uma linha em `shop_domains` por domínio.

### 1. Domínio na Vercel

No projeto da Vercel, abra **Settings → Domains → Add** e escolha uma das opções:

- **Subdomínio grátis:** um `<nome>.vercel.app` livre, como `barbearia-silva.vercel.app`.
- **Domínio do cliente:** `barbeariasilva.com.br`. A Vercel mostra o registro de DNS a criar no registrador (normalmente um `A` para `76.76.21.21` no domínio raiz e um `CNAME` para `cname.vercel-dns.com` no `www`). Cadastre no banco exatamente os hosts que vão abrir o site: se `www` e o domínio raiz abrem, rode o script uma vez para cada.

### 2. Loja, admin e domínio no banco

Na raiz do projeto, com `SUPABASE_SECRET_KEY` no `.env.local`:

```bash
node --env-file=.env.local scripts/provision-shop.mjs \
  --slug barbearia-silva --name "Barbearia Silva" \
  --admin-email dono@exemplo.com --admin-name "João Silva" \
  --host barbearia-silva.vercel.app
```

O script cria, nesta ordem:
1. A loja, as configurações, as fotos de exemplo, o expediente padrão (segunda a sábado, 9h às 19h) e o domínio.
2. O login do admin no Supabase Auth (a senha é digitada no terminal, sem aparecer).
3. O vínculo do admin com a loja.

Para ter mais domínios (por exemplo `barbearia-silva.localhost` para testar local), rode o mesmo comando trocando só o `--host`. O que já existe fica como está.

- **`--slug`:** letras minúsculas, números e hífens, até 40 caracteres. Não muda depois.
- **`--timezone`:** opcional, padrão `America/Sao_Paulo`. Use, por exemplo, `America/Manaus` para lojas em outro fuso.
- **Um e-mail = uma loja:** um login pertence a uma barbearia só. Para testar várias lojas com o seu Gmail, use apelidos: `voce+silva@gmail.com`, `voce+demo@gmail.com`. Todos chegam na mesma caixa.

### 3. Dados de contato

O painel ainda não tem tela para nome, descrição, endereço, telefone, WhatsApp, Instagram e mapa. Rode no SQL Editor do Supabase:

```sql
update public.shop_settings
set description = 'Cortes e barba no centro da cidade.',
    address = 'Rua das Flores, 100 - Centro',
    city = 'Belo Horizonte - MG',
    phone = '(31) 99999-0000',
    whatsapp = '(31) 99999-0000',
    instagram = '@barbeariasilva',
    maps_url = 'https://maps.app.goo.gl/...'
where shop_id = public.resolve_shop_slug('barbearia-silva');
```

O site mostra os dados novos em até 5 minutos.

### 4. O dono configura o resto pelo painel

O dono entra em `https://<domínio>/painel/entrar` com o e-mail e a senha do passo 2. Em **Edição do site**, ele cadastra:
- serviços (e combos) e repasses;
- barbeiros e o acesso deles ao painel;
- planos;
- horários e exceções;
- fotos da galeria.

Enquanto não houver serviços e barbeiros, o agendamento não oferece horários.

### Atalho para demonstração

Para uma loja de vitrine já preenchida (serviços, combo, barbeiros, planos, dois assinantes e cinco reservas nos próximos dias), troque `v_slug` em [`scripts/seed-demo-shop.sql`](../scripts/seed-demo-shop.sql) e rode o arquivo no SQL Editor depois do passo 2. Pode rodar de novo sem duplicar nada.

## Previews da Vercel

Cada deploy de preview ganha uma URL própria (`black-crown-barber-<hash>-....vercel.app`), que não está em `shop_domains` e daria 404. Para testar previews, defina `SHOP_SLUG=black-crown` em **Settings → Environment Variables** marcando **só o ambiente Preview**. Nunca marque Production: o deploy de produção ficaria preso a uma loja.

## "Template" com visual diferente

Hoje todas as lojas do mesmo deploy têm o mesmo layout. O que muda por loja vem do banco: nome, contato, serviços, barbeiros, planos, horários e fotos. Também são iguais para todas, porque estão no código (`app/data/site.ts`): a foto do topo, os depoimentos, o FAQ e o comparador antes/depois.

Para um cliente com visual próprio, use uma cópia do repositório:

1. Crie um repositório novo a partir deste (fork, ou "Use this template" no GitHub).
2. Mude o visual:
   - cores e fontes: `app/globals.css` e `app/layout.tsx`;
   - seções e ordem: `app/page.tsx` e `app/components/`;
   - textos fixos: `app/data/site.ts`;
   - fotos: `public/`.
3. Crie um projeto novo na Vercel apontando para esse repositório, com as mesmas variáveis do Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) e mais `SHOP_SLUG=<slug da loja>`.
4. Cadastre a loja pelo script do passo 2. Com `SHOP_SLUG`, o `--host` é opcional, mas cadastrar o domínio deixa o registro completo.

**Cuidados com cópias:**
- O banco é um só. Toda migration nova vale para todas as cópias ao mesmo tempo, então cada cópia precisa receber as mudanças de código que acompanham a migration. Senão, o site daquela cópia quebra.
- Cada cópia é mais um projeto para atualizar, testar e fazer deploy.
- Use cópias só quando o visual realmente precisar ser outro. Para cores e textos por loja, o caminho mais barato no longo prazo é guardar essas escolhas no banco, num único deploy (ainda não existe).

## Operação

- **Remover um domínio:**
  ```sql
  delete from public.shop_domains where host = 'barbearia-silva.vercel.app';
  ```
  Remova também o domínio na Vercel.
- **Suspender** (site fora do ar, painel só para consulta) ou **cancelar** uma loja:
  ```sql
  update public.shops set status = 'suspensa' where slug = 'barbearia-silva';  -- ou 'cancelada' / 'ativa'
  ```
- **Ver as lojas e os domínios:**
  ```sql
  select s.slug, s.name, s.status, d.host, d.is_primary
  from public.shops s left join public.shop_domains d on d.shop_id = s.id
  order by s.slug, d.is_primary desc;
  ```
