# Pertufundos — Fundo Coletivo Web3 de Ações Tokenizadas

Monorepo TypeScript em **Clean Architecture (Ports & Adapters)** para gestão não-custodial de um clube de investimentos entre amigos usando **Safe Multisig (BNB Chain)**, **Ondo Tokenized Stocks (`NVDAon`, `AAPLon`, `MSFTon`, `QQQon`)**, **OKX Onchain OS (DEX v6 & Cross-Chain v5)**, **Alchemy Webhooks** e saída individual em **Pix via P2P.me (Rede Base)**.

## Estrutura do Monorepo (Zero Duplicação)

```text
pertufundos/
├── packages/
│   └── shared/          # @pertufundos/shared — Fonte única da verdade: tipos, schemas Zod,
│                        # registro de tokens (18 dec BNB vs 6 dec Base), matemática NAV/PM,
│                        # janela NYSE/Nasdaq (DST-aware) e gerador CSV de Imposto de Renda
├── apps/
│   ├── api/             # @pertufundos/api — Backend Hono + Viem + OKX DEX + PostgreSQL/SQLite
│   │   ├── src/application/     # Portas (Interfaces) e Serviços de Domínio puros
│   │   ├── src/infrastructure/  # Repositórios (Postgres & SQLite), OKX HMAC, Viem, Alchemy
│   │   └── src/presentation/    # Rotas HTTP REST (/api/v1) e tratamento global de erros
│   └── web/             # @pertufundos/web — Frontend Next.js 15 + Tailwind + Wagmi + Safe SDK
├── docker-compose.yml   # PostgreSQL 16 pronto para produção/staging local
├── .env.example         # Todas as variáveis documentadas
└── GUIA_DO_GRUPO_DE_AMIGOS.md  # Manual completo de setup, operação e IRPF para o grupo
```

## Quickstart (Modo Demo Local em 1 Comando)

```bash
pnpm install
cp .env.example .env
pnpm dev
```

* **Dashboard Web:** `http://localhost:3000`
* **API Healthcheck:** `http://localhost:4000/api/v1/health`

## Comandos Úteis

* `pnpm test` — Executa toda a suíte de testes unitários (matemática NAV/IR/horário NYSE) e de integração E2E (API + Webhook HMAC + Resgate).
* `pnpm typecheck` — Validação estrita do TypeScript em todos os pacotes.
* `pnpm build` — Build de produção completo (`shared` $\rightarrow$ `api` $\rightarrow$ `web`).
* `docker compose up -d` — Sobe banco PostgreSQL 16 local caso queira usar `STORAGE_DRIVER=postgres`.

Consulte **[GUIA_DO_GRUPO_DE_AMIGOS.md](./GUIA_DO_GRUPO_DE_AMIGOS.md)** para o passo a passo completo de criação da Safe, chaves da OKX/Alchemy, operação no pregão americano e saque via Pix no P2P.me.
