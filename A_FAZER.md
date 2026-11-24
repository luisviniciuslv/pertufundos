# Backlog & Próximos Passos (`A FAZER`)

Este documento registra as evoluções futuras planejadas para expandir o **Pertufundos** além da rede BNB Chain (EVM), permitindo operar **tokens nativos e memecoins da rede Solana** (como `CYBERLEEK`), além de melhorias opcionais de segurança e rendimento.

---

## 1. Módulo Solana: Cofre Multisig Squads + Memecoins SPL

Atualmente, a **Safe (Gnosis Safe)** opera exclusivamente em redes EVM (`0x...`, como BNB Chain e Base). Para investir coletivamente em tokens nativos da **Solana** (padrão SPL, ex: `CYBERLEEK`, tokens da Raydium / Meteora / Pump.fun) mantendo **um único valor de cota (`NAV`)** para o grupo:

- [ ] **Custódia Multisig na Solana (`Squads Protocol v4`):**
  - Integrar SDK `@sqds/multisig` como novo adaptador de cofre ao lado da Safe.
  - Configurar os mesmos amigos com suas carteiras Solana (**Phantom** / **Solflare** / **Backpack**) e o mesmo quórum (ex: 3 de 5).
- [ ] **Conexão Dual de Carteiras no Frontend:**
  - Adicionar `@solana/wallet-adapter-react` no `apps/web` permitindo que cada membro vincule, no seu cadastro, seu endereço EVM (`0x...`) + seu endereço Solana (`Base58`).
- [ ] **Motor de Swap Solana (OKX DEX `chainIndex: "501"` + Jupiter):**
  - Estender `OkxDexGateway` para suportar `chainIndex: "501"` (Solana Mainnet) usando `USDC` SPL (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, 6 decimais) como caixa na Solana.
  - Importação dinâmica de qualquer *Mint Address* SPL no modal de ativos do frontend.
- [ ] **Cálculo Unificado do `NAV` Cross-Chain:**
  - Atualizar `PortfolioValuationService` para somar:
    $$\text{Patrimônio Total (USD)} = \text{Saldo Safe (BNB Chain)} + \text{Saldo Squads (Solana)}$$
  - Assim, a contabilidade de cotas e o relatório de Imposto de Renda continuam unificados sem precisar dividir o fundo em dois clubes.
- [ ] **Ponte Automática (`USDC` BNB $\leftrightarrow$ Solana $\leftrightarrow$ Base):**
  - Usar o endpoint Cross-Chain da OKX DEX (`/api/v5/dex/cross-chain/build-tx`) para transferir parte do caixa da Safe (BNB) para o cofre Squads (Solana) quando uma proposta na Solana for aprovada, e de volta para a **Base** nos resgates via P2P.me.

---

## 2. Modo "Aposta / Memecoin" com Checagem Anti-Golpe (*Honeypot*)

Moedas muito novas ou *memecoins* costumam exigir *slippage* maior (3% a 10%) e apresentam risco de contratos maliciosos (*honeypot*, onde é possível comprar mas o contrato bloqueia a venda):

- [ ] **Perfil de Risco na Proposta (`CONSERVADOR` vs. `ALTO_RISCO`):**
  - Manter o teto rígido (`0.5%` slippage / `1.5%` price impact) por padrão para Ações Ondo e Criptos grandes (`BTC`, `ETH`, `SOL`).
  - Permitir que propostas marcadas explicitamente como **`ALTO_RISCO / MEMECOIN`** aceitem slippage configurável (ex: até `8%`), exibindo alerta vermelho claro para os votantes.
- [ ] **Scanner Automático de Segurança de Contrato antes de Votar:**
  - Integrar **GoPlus Security API** (gratuita) ou auditoria de token da OKX ao colar um contrato desconhecido no modal, bloqueando automaticamente tokens detectados como `is_honeypot`, `cannot_sell_all` ou com taxa de venda abusiva (`sell_tax > 10%`).
- [ ] **Teto de Alocação em Memecoins:**
  - Trava opcional impedindo que ativos marcados como `MEMECOIN` ultrapassem, por exemplo, `5%` ou `10%` do patrimônio total do fundo em uma única ordem.

---

## 3. Evoluções Extras de Produto para o Grupo

- [ ] **Suporte Multi-EVM para Mais Ações Ondo (`Ethereum` / `Arbitrum` / `Base`):**
  - Algumas ações/ETFs específicos da Ondo (como `SPYon`, `GOOGLon` e `AMZNon` nativos) possuem maior liquidez em outras redes EVM suportadas pela Safe; permitir escolher a rede do cofre EVM por proposta.
- [ ] **Rendimento sobre Caixa Parado (`USDC Yield`):**
  - Opção para o grupo alocar o `USDC` ocioso da Safe em um protocolo auditado de liquidez imediata (ex: Aave v3) para render juros em dólar enquanto aguardam oportunidades de compra.
- [ ] **Aprovação Rápida de Voto pelo Bot do Telegram / Discord:**
  - Permitir visualizar o resumo da proposta direto no grupo do Telegram/Discord com link direto para assinar o voto e a fila da Safe no celular.
