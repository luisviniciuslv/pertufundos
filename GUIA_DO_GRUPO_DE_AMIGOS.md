# Guia Prático de Operação: Como Colocar o Pertufundos Funcionando entre o Grupo de Amigos

Este guia passo a passo foi feito para vocês tirarem o clube coletivo do papel com segurança, **sem deixar o dinheiro parado no CPF de uma única pessoa**, investindo em ações tokenizadas de Big Techs (`NVDAon`, `AAPLon`, `MSFTon`, `QQQon`) e permitindo que cada amigo saque sua parte direto via **Pix** na própria conta bancária.

---

## 1. Resumo de Como o Dinheiro Flui (Sem Risco de CPF Único)

1. **Custódia Coletiva (Safe Multisig na BNB Chain):** Vocês criam um cofre inteligente onde as carteiras pessoais dos amigos são donas (*owners*), exigindo quórum mínimo (por exemplo, **3 de 5 assinaturas**) para movimentar qualquer centavo.
2. **Cotas Justas (Matemática de Fundo Real — NAV):** Quem entra no Dia 1 paga **US\$ 1,00 por cota**. Se o fundo valorizar +20% (cota vai a US\$ 1,20) e outro amigo aportar depois, ele compra cotas a US\$ 1,20 — **ninguém dilui o lucro de quem já estava dentro**.
3. **Compras e Vendas (OKX DEX + Ondo Stocks):** Um amigo abre uma proposta no painel (ex: *"Comprar US\$ 500 de NVDAon"*). O grupo vota off-chain (grátis). Atingido o quórum, o app gera a rota na **OKX DEX** na hora e manda para a fila de assinaturas da Safe.
4. **Resgate Individual em Pix (Rede Base + P2P.me):** Quando um amigo quer sacar, ele pede o resgate das suas cotas. A Safe envia o **USDC** correspondente via *bridge* direto para a **carteira pessoal daquele amigo na rede Base**, e ele converte sozinho para **Pix no próprio CPF** usando o **P2P.me**.

---

## 2. Passo a Passo Inicial do Grupo (Faz Uma Única Vez)

### Passo 2.1 — Carteira Individual de Cada Amigo
1. Cada participante instala a carteira **Rabby Wallet** (recomendada para PC) ou **MetaMask** / **OKX Wallet**.
2. **Regra de ouro:** Cada amigo anota suas 12/24 palavras (*seed phrase*) no papel e **nunca** compartilha no grupo.
3. Cada amigo copia seu endereço público EVM (`0x...`) — o mesmo endereço funciona tanto na **BNB Chain** quanto na **Base**.

### Passo 2.2 — Criar o Cofre Multisig na Safe (`BNB Smart Chain`)
1. Um dos amigos acessa **[app.safe.global](https://app.safe.global)**, conecta a carteira e seleciona a rede **BNB Smart Chain**.
2. Clique em **Create Safe Account**:
   * **Name:** `Pertufundos Clube`
   * **Signers (Owners):** Adicione os endereços `0x...` de todos os amigos do grupo.
   * **Threshold (Quórum):** Escolha quantas assinaturas são necessárias para aprovar uma transação:
     * Grupo de 3 amigos $\rightarrow$ **2 de 3**
     * Grupo de 5 amigos $\rightarrow$ **3 de 5**
     * Grupo de 7 amigos $\rightarrow$ **4 de 7**
3. Pague a pequena taxa de criação em `BNB` (~US\$ 0,20) e copie o **endereço da Safe criada (`0x...`)**.
4. Envie cerca de **US\$ 3 a US\$ 5 em `BNB`** para uma carteira dos amigos (quem clicar em "Executar" na Safe paga centavos de gás em BNB; vocês também podem deixar um pequeno saldo de BNB na própria Safe para reembolso).

---

## 3. Mapa Completo de Todas as Chaves e Onde Pegar Cada Uma (Clique a Clique)

Antes de sair criando contas, veja o resumo do que realmente exige chave no `.env` e do que **não** exige:

| Plataforma / Serviço | Variáveis no `.env` | Obrigatória em Produção? | Custo |
| :--- | :--- | :--- | :--- |
| **Sessão Interna do App** | `AUTH_SESSION_SECRET` | **Sim** (gerada por vocês no terminal) | Grátis |
| **Safe Multisig** | `SAFE_ADDRESS`, `NEXT_PUBLIC_SAFE_ADDRESS`, `SAFE_THRESHOLD`, `NEXT_PUBLIC_SAFE_API_KEY` | **Sim** (`API_KEY` recomendada contra *rate-limit*) | Grátis (~US\$ 0,20 de gás única vez) |
| **OKX Onchain OS** | `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_API_PASSPHRASE`, `OKX_PROJECT_ID` | **Sim** (para cotações reais, swaps e bridge) | Grátis |
| **Alchemy (Webhook + RPC)** | `ALCHEMY_WEBHOOK_SIGNING_KEY`, `BSC_RPC_URL`, `BASE_RPC_URL` | **Sim** (detecta depósitos de USDC em tempo real) | Grátis (Free Tier) |
| **Banco PostgreSQL (Neon)** | `DATABASE_URL` (`STORAGE_DRIVER=postgres`) | **Sim** em nuvem (local pode usar `sqlite`) | Grátis (Free Tier) |
| **Discord / Telegram** | `DISCORD_WEBHOOK_URL` / `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Opcional (avisos no grupo) | Grátis |
| **Ondo Finance** | *(Nenhuma chave necessária!)* | **Não precisa de conta/API Key** | — |
| **P2P.me (Pix)** | *(Nenhuma chave no servidor!)* | **Não vai no `.env`** (uso individual no site deles) | — |

---

### 3.1 — Segredo de Autenticação do Próprio Sistema (`AUTH_SESSION_SECRET`)
Usado pelo backend para assinar os tokens de login quando cada amigo assina a mensagem gratuita na Rabby/MetaMask.
* Rode este comando no terminal para gerar uma chave forte exclusiva de vocês:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
* Cole o resultado de 64 caracteres em `AUTH_SESSION_SECRET` no `.env`.

---

### 3.2 — OKX Onchain OS (`OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_API_PASSPHRASE`, `OKX_PROJECT_ID`)
Responsável por buscar o melhor preço das ações tokenizadas (`NVDAon`, `AAPLon`, `MSFTon`, `QQQon`) e montar a *bridge* de USDC da BNB Chain para a Base.
1. Acesse **[web3.okx.com/build](https://web3.okx.com/build)** (OKX Web3 Developer Portal).
2. Clique em **Connect Wallet** no canto superior direito e assine a mensagem de login com sua carteira (se for o primeiro acesso, clique em **Get started** e valide seu e-mail/telefone).
3. Na tela inicial do painel de desenvolvedor, um projeto padrão já aparece criado (ou clique em **Create project**):
   * Copie o identificador do projeto e cole em **`OKX_PROJECT_ID`**.
4. Dentro do projeto, vá em **API Management / Home** e clique no botão **Create API key**:
   * **API Key Name:** `pertufundos-dex`
   * **Passphrase:** Crie uma senha forte para a API e **anote imediatamente** — ela vai em **`OKX_API_PASSPHRASE`**.
5. Clique em **Create** e depois em **View details**:
   * Copie a **API Key** $\rightarrow$ cole em **`OKX_API_KEY`**.
   * Copie a **Secret Key** $\rightarrow$ cole em **`OKX_SECRET_KEY`**.
   * ⚠️ **Atenção:** A OKX exibe a `Secret Key` **apenas uma única vez** no momento da criação! Guarde em local seguro.

---

### 3.3 — Safe Developer Portal (`NEXT_PUBLIC_SAFE_API_KEY`)
Permite que o frontend envie e leia propostas na fila oficial da Safe (`SafeApiKit`) sem cair em bloqueios de limite de requisições (*rate-limit*).
1. Acesse **[developer.safe.global](https://developer.safe.global)** e crie sua conta gratuita / faça login.
2. No menu lateral, clique em **API Keys** $\rightarrow$ **Create New API Key**.
3. Copie o token gerado (formato JWT `eyJ...`) e cole em **`NEXT_PUBLIC_SAFE_API_KEY`** (e `SAFE_API_KEY`) no `.env`.
4. Também preencha **`SAFE_ADDRESS`** e **`NEXT_PUBLIC_SAFE_ADDRESS`** com o endereço `0x...` do cofre criado no Passo 2.2, e **`SAFE_THRESHOLD`** com o número mínimo de assinaturas (ex: `3`).

---

### 3.4 — Alchemy: RPCs Estáveis + Webhook de Depósitos (`BSC_RPC_URL`, `BASE_RPC_URL`, `ALCHEMY_WEBHOOK_SIGNING_KEY`)
Na mesma conta gratuita da Alchemy vocês pegam tanto os links RPC rápidos quanto o monitoramento automático de aportes em USDC:

**Parte A — Pegar `BSC_RPC_URL` e `BASE_RPC_URL`:**
1. Crie uma conta gratuita em **[dashboard.alchemy.com](https://dashboard.alchemy.com)**.
2. No menu lateral, clique em **Apps $\rightarrow$ Create new app** (nome: `Pertufundos`).
3. Habilite as redes **BNB Smart Chain** e **Base**.
4. Na aba **Networks** do seu app:
   * Copie a URL HTTPS da **BNB Smart Chain Mainnet** (`https://bnb-mainnet.g.alchemy.com/v2/...`) $\rightarrow$ cole em **`BSC_RPC_URL`**.
   * Copie a URL HTTPS da **Base Mainnet** (`https://base-mainnet.g.alchemy.com/v2/...`) $\rightarrow$ cole em **`BASE_RPC_URL`**.

**Parte B — Pegar `ALCHEMY_WEBHOOK_SIGNING_KEY`:**
1. Ainda no painel da Alchemy, vá no menu lateral em **Data $\rightarrow$ Webhooks $\rightarrow$ Create Webhook**.
2. Escolha o tipo **Address Activity**:
   * **Chain:** `BNB Smart Chain` / **Network:** `Mainnet`
   * **Webhook URL:** `https://SEU-BACKEND.up.railway.app/api/v1/webhooks/alchemy`
     *(Dica: se quiser testar o webhook no seu PC antes de subir na nuvem, rode `npx ngrok http 4000` e use a URL HTTPS gerada pelo ngrok + `/api/v1/webhooks/alchemy`)*.
   * **Addresses to track:** Cole o endereço `0x...` da **Safe do grupo** e clique em **Create Webhook**.
3. Na listagem de Webhooks, clique nos três pontinhos (`...`) ou em **Signing Key** ao lado do webhook criado, copie o código (`whsec_...` ou hex) e cole em **`ALCHEMY_WEBHOOK_SIGNING_KEY`**.

---

### 3.5 — Banco PostgreSQL Gratuito (`DATABASE_URL` no Neon.tech)
Para produção (em dev local o sistema já usa SQLite automático sem precisar configurar nada):
1. Crie uma conta gratuita em **[neon.tech](https://neon.tech)** e clique em **New Project** (nome: `pertufundos`).
2. Na tela **Dashboard** do projeto, clique em **Connect** e copie a **Connection string** (começa com `postgresql://neondb_owner:...`).
3. No `.env` de produção do backend, defina:
   * `STORAGE_DRIVER=postgres`
   * `DATABASE_URL=postgresql://...` (o backend cria todas as tabelas sozinho ao iniciar!).

---

### 3.6 — Notificações no Discord ou Telegram (Opcional, Muito Recomendado!)
* **Discord (`DISCORD_WEBHOOK_URL`):**
  1. No servidor dos amigos, clique na engrenagem ao lado do canal de texto (*Editar Canal*).
  2. Vá em **Integrações $\rightarrow$ Webhooks $\rightarrow$ Novo Webhook $\rightarrow$ Copiar URL do Webhook**.
  3. Cole em `DISCORD_WEBHOOK_URL`.
* **Telegram (`TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`):**
  1. No Telegram, chame o bot oficial **`@BotFather`**, envie `/newbot`, escolha um nome e copie o token (`123456:ABC-...`) para **`TELEGRAM_BOT_TOKEN`**.
  2. Adicione o seu novo bot no grupo do Telegram dos amigos e mande qualquer mensagem lá dentro (ex: `"oi bot"`).
  3. Abra no navegador `https://api.telegram.org/botSEU_TOKEN_AQUI/getUpdates`, procure por `"chat":{"id":-100...}` e copie esse número (incluindo o sinal de menos `-`) para **`TELEGRAM_CHAT_ID`**.

---

### 3.7 — E quanto à Ondo Finance e ao P2P.me? (Não precisam de API Key!)
* **Ondo Finance:** As ações tokenizadas (`NVDAon`, `AAPLon`, `MSFTon`, `QQQon`) são tokens BEP-20 negociados diretamente nos pools de liquidez via OKX DEX na BNB Chain. Vocês **não** precisam abrir conta institucional na Ondo nem preencher `ONDO_SHARES_ORACLE_ADDRESS` (deixe em branco).
* **P2P.me:** O servidor do fundo nunca toca no Pix de ninguém. Cada amigo acessa **[app.p2p.me](https://app.p2p.me)** diretamente no celular/navegador quando recebe o USDC na sua própria carteira na rede **Base**, conecta a carteira e informa o próprio Pix.

---

## 4. Como Rodar o Sistema

### Opção A — Testar Agora Mesmo no Computador (Modo Demo Zero-Config)
Vocês podem testar todos os fluxos imediatamente (com 5 amigos simulados, cotas, votação, swap e relatório de IR) sem precisar de chaves externas nem Docker:

```bash
# 1. Na pasta raiz do projeto, instale os pacotes
pnpm install

# 2. Copie o arquivo de variáveis de ambiente
cp .env.example .env

# 3. Suba Backend (porta 4000) + Frontend (porta 3000) juntos
pnpm dev
```

Abra **http://localhost:3000** no navegador! Conecte sua extensão (**Rabby** ou **MetaMask**), clique em **Assinar Login** (assinatura criptográfica EIP-191 sem custo de gás) e vincule seu apelido para operar como você mesmo. Para testar múltiplos votos localmente, basta alternar de conta (`Account 1` $\rightarrow$ `Account 2`) dentro da própria Rabby/MetaMask.

### Opção B — Subir em Produção para o Grupo Usar 24/7 (Custo ~US\$ 0 a US\$ 5/mês)

1. **Banco de Dados PostgreSQL (Neon.tech ou Supabase — Plano Gratuito):**
   * Crie um banco Postgres gratuito no [Neon](https://neon.tech) e copie a `DATABASE_URL`.
   * No `.env` do backend, mude `STORAGE_DRIVER=postgres` e cole a `DATABASE_URL` (o servidor cria todas as tabelas automaticamente na inicialização!).
2. **Backend (`apps/api` no Railway ou Render):**
   * Conecte o repositório GitHub no Railway/Render.
   * Build Command: `pnpm --filter @pertufundos/shared build && pnpm --filter @pertufundos/api build`
   * Start Command: `pnpm --filter @pertufundos/api start`
   * Configure as variáveis do `.env` (`SAFE_ADDRESS`, `SAFE_THRESHOLD`, `OKX_*`, `ALCHEMY_WEBHOOK_SIGNING_KEY`, `DATABASE_URL`).
3. **Frontend (`apps/web` na Vercel — Plano Gratuito):**
   * Importe o repositório na Vercel apontando Root Directory para `apps/web` (ou mantendo raiz com Build Command `pnpm build`).
   * Configure:
     * `NEXT_PUBLIC_API_URL=https://sua-api.up.railway.app/api/v1`
     * `NEXT_PUBLIC_SAFE_ADDRESS=0xEnderecoDaSafeDeVoces`
     * `NEXT_PUBLIC_PRIMARY_CHAIN_ID=56`
     * `NEXT_PUBLIC_EXIT_CHAIN_ID=8453`

---

## 5. Rito Operacional do Grupo no Dia a Dia

### 1) Cadastro Inicial dos Amigos
Na aba **Aportes & Cotistas**, cadastre o apelido e o endereço `0x...` da carteira pessoal de cada amigo.

### 2) Como Fazer um Aporte
1. O amigo compra **USDC** (ou faz swap para USDC na **BNB Chain** — contrato `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`).
   * *Atenção:* Sempre confira se está enviando **USDC na rede BNB Smart Chain** para o endereço da Safe!
2. Transfira da sua carteira pessoal para a Safe (pelo botão da aba **Aportes** ou direto pela Rabby/MetaMask).
3. Em poucos segundos, a Alchemy avisa o backend, que calcula o NAV do momento, emite suas cotas proporcionais e avisa no Discord/Telegram do grupo.

### 3) Como Comprar ou Vender Ações Tokenizadas (`NVDAon`, `AAPLon`, `MSFTon`, `QQQon`)
1. **Horário Recomendado:** Opere sempre com o selo **NYSE/Nasdaq: Aberto** no topo do app (09h30 às 16h00 de Nova York — equivale a **10h30–17h00 de Brasília** no verão americano ou **11h30–18h00 de Brasília** entre novembro e março). Nesse horário o *spread* das ações Ondo é mínimo!
2. Na aba **Governança & OKX**, um amigo cria a proposta (ex: *"Comprar US\$ 500 de NVDAon"*).
3. Os amigos entram no painel e clicam em **Aprovar** (sem custo de gás).
4. Assim que bater o quórum (ex: 3/5), qualquer amigo conectado clica em:
   * **1. Gerar Calldata OKX DEX** (o backend valida que o *price impact* é seguro e monta o pacote `Approve + Swap` fresco).
   * **2. Propor na Fila da Safe** (assina na carteira).
5. Os demais amigos assinam na fila da Safe e o último assinante clica em **Executar**!

### 4) Como Sacar Sua Parte em Reais via Pix (Sem Depender de Ninguém)
1. Vá na aba **Resgate & Pix (P2P.me)**, digite quantas cotas deseja resgatar e clique em **Simular Plano de Resgate**.
   * Se houver USDC livre suficiente no cofre, o sistema usa o caixa.
   * Se faltar caixa, o sistema calcula automaticamente a **venda proporcional** das ações tokenizadas para levantar o USDC exato sem distorcer a carteira de quem fica!
2. Clique em **Criar Proposta de Resgate na Safe**.
3. O grupo aprova e assina na Safe. A transação faz a *bridge* do seu USDC da BNB Chain direto para a **sua carteira pessoal na rede Base**.
4. Com o USDC na sua carteira na rede **Base**, abra **[app.p2p.me](https://app.p2p.me)**:
   * Conecte sua carteira na rede **Base**;
   * Informe sua chave **Pix (do seu próprio CPF)**;
   * Converta o USDC em Reais direto na sua conta!
   * *Dica de Limites (RP):* Contas novas no P2P.me começam com limite menor por operação baseado em *Reputation Points (RP)*. Para resgates maiores, basta dividir em 2 ou 3 vendas no P2P.me ou transferir o USDC da sua carteira Base para sua própria conta em uma corretora com Pix.

---

## 6. Declaração de Imposto de Renda (IRPF Individual)

Como o cofre multisig é uma comunhão descentralizada de ativos onde cada participante detém fração ideal auditável on-chain:

1. Na aba **Meu Imposto de Renda**, conecte sua carteira, assine o login gratuito e clique em **Exportar Meu CSV (IRPF)** (protegido criptograficamente: nenhum outro amigo do grupo consegue visualizar ou baixar o seu relatório fiscal).
2. O relatório já entrega mastigado:
   * **Ficha "Bens e Direitos" (31/12):** Utilize o campo **Custo Total de Aquisição (USD)** convertido pela cotação do dólar das datas dos seus aportes (nunca pelo valor de mercado, conforme regra da Receita Federal), informando sua participação em ativos virtuais/cotas sob custódia multisig.
   * **Ganho de Capital nos Resgates:** O sistema calcula automaticamente o **Preço Médio Ponderado** das suas cotas em cada aporte e apura o `Ganho_Capital_Realizado_USD` exclusivamente quando você faz um resgate. Consulte seu contador com o CSV em mãos para verificar o enquadramento vigente de aplicações financeiras/ativos virtuais no exterior (Lei 14.754 / IN RFB).

---

## 7. Regras de Segurança Inegociáveis do Grupo

* **Zero Chaves Privadas no Servidor:** Nosso código **jamais** pede ou armazena chaves privadas. Se qualquer site pedir suas 12 palavras, feche na hora.
* **Conferência Visual na Safe:** Antes de assinar na Rabby/MetaMask, confira sempre se o contrato chamado corresponde ao pacote exibido no painel.
* **Carteira Reserva de Emergência:** Se um amigo perder o celular/computador, os outros *owners* (ex: 3 de 5) conseguem aprovar uma transação na Safe trocando a carteira antiga dele por uma nova — por isso um quórum como **3 de 5** (e nunca 5 de 5!) protege o grupo contra perda de acesso individual.
