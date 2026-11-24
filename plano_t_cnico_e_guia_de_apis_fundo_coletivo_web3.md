# Plano Técnico: Fundo Coletivo de Ações Tokenizadas (Web3)

Este documento detalha a arquitetura, os fluxos operacionais, o roadmap de desenvolvimento e o guia de estudo de APIs para construir um aplicativo web de fundo coletivo para um grupo de amigos.

O objetivo central é **eliminar a custódia em um único CPF**: os ativos ficam em um cofre multi-assinatura (*multisig*), as compras de ações tokenizadas de Big Techs são executadas on-chain via **OKX DEX API**, e os saques individuais acontecem em **USDC na rede Base** para conversão em Pix via **P2P.me** na conta de cada participante.

---

## 1. Visão Geral da Arquitetura

Para unir taxas baixas, compatibilidade com a Safe e acesso a ações tokenizadas de Big Techs (como **Ondo Stocks**: `NVDAon`, `AAPLon`, `MSFTon`, `QQQon`), a recomendação é operar em uma rede EVM com gás barato (como **BNB Chain**) usando a **OKX DEX API** para swaps e ponte (*bridge*) para a rede **Base** na hora do resgate.

| Camada | Tecnologia | Responsabilidade |
| :--- | :--- | :--- |
| **Frontend** | Next.js + Tailwind + `wagmi` / `viem` | Dashboard de patrimônio, criação/votação de propostas, conexão de carteiras e assinatura multisig. |
| **Cofre (Custódia)** | **Safe (Gnosis Safe)** | Armazena os fundos coletivos. Exige quórum mínimo (ex: 3 de 5 assinaturas) para qualquer movimentação. |
| **Motor de Trade** | **OKX Onchain OS (DEX API)** | Roteamento inteligente de swaps (`USDC` $\leftrightarrow$ ações tokenizadas) e geração do `calldata` da transação. |
| **Ativos** | **Ondo Stocks** (Ondo Finance) | Tokens lastreados 1:1 em ações americanas reais com reinvestimento automático de dividendos (*total return*). |
| **Backend & Banco** | Node.js (TypeScript) + PostgreSQL | Controle do **Ledger de Cotas (NAV)**, votação off-chain, notificações (Discord/Telegram) e relatórios de IR. |
| **Monitoramento** | **Alchemy Webhooks** | Escuta depósitos de USDC no endereço da Safe em tempo real para emissão automática de cotas. |
| **Saída (Off-ramp)** | **P2P.me** (Rede Base) | Conversão individual de USDC (rede Base) para Pix diretamente no banco/CPF de cada amigo. |

---

## 2. Os 4 Módulos Principais do Sistema

### Módulo A: Cofre e Governança (Votação Off-chain + Execução Multisig)
Como cotações de DEX expiram em poucos minutos, a votação deve ser separada da geração da transação on-chain:

1. **Setup Inicial:** Criação de uma Safe na rede escolhida tendo como *owners* as carteiras pessoais de cada amigo e um *threshold* definido (ex: 3 de 5).
2. **Votação Off-chain:** Um amigo cria uma proposta no app (ex: *"Comprar US\$ 500 de NVDAon"*). O grupo vota no banco de dados (ou via bot no Discord/Telegram).
3. **Geração da Transação:** Somente após a aprovação off-chain, o backend consulta a **OKX DEX API** (`/swap`) passando o endereço da Safe como origem e recebe o `to`, `data` e `value`.
4. **Assinatura e Execução:** O app usa o **Safe Protocol Kit** + **API Kit** para propor a transação na fila da Safe. Os amigos assinam pela própria carteira e o último assinante que atingir o quórum dispara a execução na blockchain.

### Módulo B: Ledger de Cotas (Matemática do NAV)
Para permitir aportes em datas e valores diferentes sem diluir o lucro de quem já estava no fundo, o sistema calcula **cotas** (semelhante a um fundo de investimento real):

* **Dia 1:** Define-se o valor inicial da cota, por exemplo, $P_0 = \text{US\$ } 1{,}00$. Quem aporta US\$ 500 recebe $500$ cotas.
* **Cálculo do Valor Atual da Cota (NAV):** Antes de processar qualquer novo aporte ou resgate, o backend lê o saldo total da Safe on-chain (USDC + valor de mercado das ações tokenizadas) e calcula:

$$\text{NAV} = \frac{\text{Patrimônio Total da Safe (USD)}}{\text{Total de Cotas Emitidas}}$$

* **Emissão em Novo Aporte:** Se o amigo deposita um valor $V$ em USDC:

$$\text{Novas Cotas} = \frac{V}{\text{NAV}}$$

* **Valor no Resgate:** Se o amigo resgata $C$ cotas:

$$\text{Valor a Receber (USD)} = C \times \text{NAV}$$

### Módulo C: Fluxo de Aporte (Entrada)
1. O amigo transfere **USDC** da própria carteira pessoal para o endereço da Safe.
2. Um webhook (**Alchemy Address Activity**) notifica o backend assim que a transação é confirmada.
3. O backend identifica o remetente (`fromAddress`), calcula o $\text{NAV}$ vigente, credita as novas cotas no PostgreSQL e registra o preço médio para controle fiscal.

### Módulo D: Fluxo de Resgate (Saída Individual via P2P.me)
1. O amigo solicita o resgate de $C$ cotas no aplicativo.
2. O backend calcula o valor devido ($C \times \text{NAV}$) e monta a transação para a Safe:
   * Se não houver USDC livre suficiente no cofre, gera o *swap* proporcional das ações tokenizadas para USDC via **OKX DEX API**.
   * Envia o USDC (ou faz *bridge* cross-chain) diretamente para a **carteira pessoal do amigo na rede Base**.
3. O grupo assina a liberação na Safe e o sistema queima as cotas do amigo no PostgreSQL.
4. O amigo acessa o **P2P.me** com a própria carteira na rede Base e converte seu USDC para **Pix** na própria conta bancária.

> **Nota sobre limites do P2P.me:** O P2P.me utiliza um sistema de Pontos de Reputação (RP) onde o limite por transação começa baixo e cresce conforme o histórico/recomendações. Para saques grandes, o amigo pode fatiar a operação ou enviar o USDC da carteira dele para uma exchange regulada.

---

## 3. Roadmap de Desenvolvimento (4 Sprints)

| Sprint | Foco | Entregáveis |
| :--- | :--- | :--- |
| **Sprint 1** | **Base On-chain & Auth** | Subir Next.js + `wagmi`/`viem`; criar Safe em Testnet; exibir saldo em tempo real dos tokens da Safe no dashboard. |
| **Sprint 2** | **Ledger & Aportes** | Criar schema no PostgreSQL (`users`, `ledger_entries`, `nav_snapshots`); configurar Alchemy Webhook para detectar depósitos e emitir cotas automaticamente. |
| **Sprint 3** | **Votação + OKX DEX** | Implementar propostas off-chain; integrar OKX DEX API (`/quote`, `/approve-transaction`, `/swap`); conectar fila de assinatura via Safe Protocol Kit e API Kit. |
| **Sprint 4** | **Resgate, Bridge & IR** | Implementar fluxo de resgate + transferência para rede Base; link/guia para saque no P2P.me; exportação CSV com histórico de aportes, preço médio e ganho de capital individual para o IR. |

---

## 4. Boas Práticas de Segurança e Operação

* **Zero Private Keys no Backend:** O servidor nunca deve armazenar chaves privadas. Ele apenas monta os payloads das transações e lê o estado da blockchain; todas as assinaturas ocorrem no navegador de cada membro.
* **Proteção de Slippage e Price Impact:** Antes de enviar qualquer swap para a Safe, o backend deve validar o campo `priceImpactPercent` retornado pela OKX DEX API e travar um `slippage` máximo (ex: `0.5%` a `1%`).
* **Janela de Liquidez (Horário da Bolsa):** Embora tokens como Ondo Stocks sejam transferíveis 24/7, programe alertas ou travas no app para executar compras preferencialmente durante o pregão regular dos EUA (10h30 às 17h de Brasília), quando o *spread* é mínimo.
* **Controle de Multiplicador (Ondo):** Na BNB Chain e Solana, tokens da Ondo utilizam um *shares multiplier* para refletir o reinvestimento de dividendos. Leia a documentação da Ondo sobre o multiplicador para garantir que o cálculo do $\text{NAV}$ reflita o valor econômico real.

---

## 5. Guia de Estudo: Documentações Oficiais das APIs

Abaixo estão todas as documentações oficiais que o time deve estudar antes e durante a implementação:

### 1. OKX Web3 / Onchain OS (DEX Swap API)
Responsável por buscar cotações, liquidez e gerar o `calldata` de aprovação e troca de tokens.
* **Introdução e Fluxo de Swap:** [OKX DEX Swap API — Introduction](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap-api-introduction)
* **Referência do Endpoint `/swap` (parâmetros de slippage, price impact e tx data):** [OKX DEX Swap API Reference](https://web3.okx.com/onchainos/dev-docs/trade/dex-swap)
* **Configuração de Chaves e Acesso à API:** [OKX Onchain OS — API Access](https://web3.okx.com/onchainos/dev-docs/home/api-access)

> **O que estudar primeiro:** Fluxo sequencial `/supported/chain` $\rightarrow$ `/quote` $\rightarrow$ `/approve-transaction` $\rightarrow$ `/swap`.

### 2. Safe (Gnosis Safe) SDK
Responsável pela criação do cofre multisig, proposição de transações, coleta de assinaturas off-chain e execução on-chain.
* **Protocol Kit (criar Safe, assinar e executar transações via TypeScript):** [Safe Docs — Protocol Kit](https://docs.safe.global/sdk/protocol-kit)
* **API Kit (enviar propostas para a fila compartilhada e coletar assinaturas dos amigos):** [Safe Docs — API Kit](https://docs.safe.global/sdk/api-kit)

> **O que estudar primeiro:** Guias *"Propose and confirm transactions"* (API Kit) e *"Execute transactions"* (Protocol Kit).

### 3. Ondo Finance (Ações Tokenizadas de Big Techs)
Responsável por entender como funcionam os tokens de ações (`NVDAon`, `AAPLon`, etc.), horários de mercado, taxas e reinvestimento de dividendos.
* **Visão Geral de Ondo Stocks:** [Ondo Finance Docs — Ondo Stocks Overview](https://docs.ondo.finance/ondo-stocks/overview)
* **Hub de Documentação (inclui Guia de Shares Multiplier e API Reference):** [Ondo Finance Docs](https://docs.ondo.finance/)

> **O que estudar primeiro:** Regras de *Market Hours*, *Off-Hours Trading* e o *Shares Multiplier Integration Guide* (crucial para calcular o NAV corretamente na BNB Chain).

### 4. P2P.me (Off-ramp USDC Base $\rightarrow$ Pix)
Responsável pelo saque individual dos participantes sem envolver o CPF dos outros amigos.
* **Guia de Início, Rede Base e Limites (Reputation Points):** [P2P.me Docs — Getting Started](https://p2p-me.gitbook.io/p2p.me-docs/getting-started/quickstart)

> **O que estudar primeiro:** Requisitos obrigatórios de depósito/saque em **USDC exclusivamente na rede Base** e como funciona o aumento de limite via **Reputation Points (RP)**.

### 5. Frontend Web3 (Conexão de Carteiras e Interação EVM)
Responsável pela camada de conexão das carteiras dos amigos no Next.js e leitura de contratos ERC-20.
* **Wagmi (React Hooks para Web3):** [Wagmi Docs — React & Viem Guide](https://wagmi.sh/react/guides/viem)
* **Viem (Interface TypeScript para EVM):** [Viem Docs — Getting Started](https://viem.sh/docs/getting-started)

### 6. Monitoramento de Depósitos On-chain (Webhooks)
Responsável por notificar seu backend em tempo real quando um amigo deposita USDC na Safe.
* **Alchemy Address Activity Webhook:** [Alchemy Docs — Address Activity Webhook](https://www.alchemy.com/docs/reference/address-activity-webhook)

> **O que estudar primeiro:** Payload de eventos `ERC20` e validação de assinatura HMAC (`X-Alchemy-Signature`) para proteger o endpoint do seu webhook contra requisições falsas.