import crypto from "node:crypto";
import { BNB_USDC_TOKEN } from "@pertufundos/shared";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config/env.js";
import { createContainer, type AppContainer } from "../container.js";
import { SqliteFundRepository } from "../infrastructure/persistence/sqlite/sqlite-fund.repository.js";
import { createHttpApp } from "../presentation/http/app.js";

const WEBHOOK_SECRET = "test_alchemy_signing_secret_key_12345";
const SAFE_DEMO = "0x1111111111111111111111111111111111111111";

// Contas de teste determinísticas com chaves reais para assinar desafios EIP-191
const ACCOUNT_1 = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);
const ACCOUNT_2 = privateKeyToAccount(
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
);
const ACCOUNT_3 = privateKeyToAccount(
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
);

describe("Pertufundos API End-to-End Cryptographic Auth & Fund Flow", () => {
  let container: AppContainer;
  let app: ReturnType<typeof createHttpApp>;

  beforeEach(() => {
    const config = loadConfig({
      STORAGE_DRIVER: "sqlite",
      SQLITE_PATH: ":memory:",
      SAFE_ADDRESS: SAFE_DEMO,
      SAFE_THRESHOLD: "2",
      ALCHEMY_WEBHOOK_SIGNING_KEY: WEBHOOK_SECRET,
      AUTH_SESSION_SECRET: "test_session_secret_with_at_least_16_chars",
      ENFORCE_US_MARKET_HOURS: "false",
    });

    const repo = new SqliteFundRepository(":memory:");
    container = createContainer(config, { repository: repo });
    app = createHttpApp(container);
  });

  afterEach(async () => {
    await container.repository.close();
  });

  async function signInAccount(account: ReturnType<typeof privateKeyToAccount>): Promise<string> {
    const challengeRes = await app.request("/api/v1/auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: account.address }),
    });
    expect(challengeRes.status).toBe(200);
    const { message } = await challengeRes.json();

    const signature = await account.signMessage({ message });

    const verifyRes = await app.request("/api/v1/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress: account.address,
        signature,
      }),
    });
    expect(verifyRes.status).toBe(200);
    const { token } = await verifyRes.json();
    return token as string;
  }

  it("enforces EIP-191 wallet signatures, blocks impersonation & cross-member IRPF access, and runs full fund lifecycle", async () => {
    // 0. Bloqueia cadastro sem assinatura criptográfica (401)
    const unauthMemberRes = await app.request("/api/v1/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: "Invasor",
        walletAddress: ACCOUNT_1.address,
        isSafeOwner: true,
      }),
    });
    expect(unauthMemberRes.status).toBe(401);

    // 1. Cada amigo autentica com sua própria assinatura EIP-191 e vincula sua carteira
    const token1 = await signInAccount(ACCOUNT_1);
    const token2 = await signInAccount(ACCOUNT_2);
    const token3 = await signInAccount(ACCOUNT_3);

    for (const [idx, item] of [
      { acc: ACCOUNT_1, tok: token1 },
      { acc: ACCOUNT_2, tok: token2 },
      { acc: ACCOUNT_3, tok: token3 },
    ].entries()) {
      const res = await app.request("/api/v1/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${item.tok}`,
        },
        body: JSON.stringify({
          nickname: `Amigo${idx + 1}`,
          walletAddress: item.acc.address,
          isSafeOwner: true,
        }),
      });
      expect(res.status).toBe(201);
    }

    // 2. Webhook Alchemy validado via X-Alchemy-Signature
    const webhookPayload = JSON.stringify({
      id: "whevt_1",
      type: "ADDRESS_ACTIVITY",
      event: {
        network: "BNB_MAINNET",
        activity: [
          {
            hash: "0x1111000000000000000000000000000000000000000000000000000000000001",
            category: "erc20",
            fromAddress: ACCOUNT_1.address,
            toAddress: SAFE_DEMO,
            value: 1000,
            asset: "USDC",
            rawContract: {
              address: BNB_USDC_TOKEN.address,
              decimal: "0x12",
            },
          },
        ],
      },
    });

    const validSig = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(webhookPayload, "utf8")
      .digest("hex");

    const okWebhookRes = await app.request("/api/v1/webhooks/alchemy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Alchemy-Signature": validSig,
      },
      body: webhookPayload,
    });
    expect(okWebhookRes.status).toBe(200);

    // Amigo 2 registra aporte próprio autenticado
    const dep2Res = await app.request("/api/v1/deposits/record", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        fromAddress: ACCOUNT_2.address,
        amountUsd: 500,
        txHash: "0x2222000000000000000000000000000000000000000000000000000000000002",
      }),
    });
    expect(dep2Res.status).toBe(201);

    // Cap table permanece transparente para o grupo
    const port1 = await (await app.request("/api/v1/portfolio")).json();
    expect(port1.totalSharesIssued).toBe(1500);
    expect(port1.members).toHaveLength(3);

    // 3. Amigo 1 tenta criar proposta fingindo ser Amigo 2 -> BLOQUEADO (403)!
    const spoofPropRes = await app.request("/api/v1/proposals/trade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        title: "Tentativa de Spoof",
        type: "BUY_ASSET",
        assetSymbol: "NVDAon",
        amount: 100,
        maxSlippagePercent: 0.5,
        createdByAddress: ACCOUNT_2.address,
      }),
    });
    expect(spoofPropRes.status).toBe(403);

    // 4. Amigo 1 cria proposta legitimamente -> Amigo 1 tenta votar como Amigo 2 (403) -> Amigo 2 vota com seu próprio token (200)
    const propRes = await app.request("/api/v1/proposals/trade", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        title: "Comprar US$ 600 de NVDAon",
        type: "BUY_ASSET",
        assetSymbol: "NVDAon",
        amount: 600,
        maxSlippagePercent: 0.5,
        createdByAddress: ACCOUNT_1.address,
      }),
    });
    expect(propRes.status).toBe(201);
    const { proposal } = await propRes.json();

    const spoofVoteRes = await app.request(`/api/v1/proposals/${proposal.id}/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        voterAddress: ACCOUNT_2.address,
        decision: "APPROVE",
      }),
    });
    expect(spoofVoteRes.status).toBe(403);

    const vote2Res = await app.request(`/api/v1/proposals/${proposal.id}/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        voterAddress: ACCOUNT_2.address,
        decision: "APPROVE",
      }),
    });
    expect((await vote2Res.json()).proposal.status).toBe("APPROVED");

    // 5. Gera batch OKX DEX e executa
    const batchRes = await app.request(`/api/v1/proposals/${proposal.id}/prepare-safe-tx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({ forceOffHours: true }),
    });
    expect(batchRes.status).toBe(200);

    await app.request(`/api/v1/proposals/${proposal.id}/confirm-execution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        executionTxHash: "0x3333000000000000000000000000000000000000000000000000000000000003",
      }),
    });

    // 6. Resgate parcial de 200 cotas do Amigo 1 -> aprovação do Amigo 3 -> execução
    const redRes = await app.request("/api/v1/proposals/redemption", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        memberWallet: ACCOUNT_1.address,
        sharesToRedeem: 200,
      }),
    });
    expect(redRes.status).toBe(201);
    const { proposal: redProposal } = await redRes.json();

    await app.request(`/api/v1/proposals/${redProposal.id}/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token3}`,
      },
      body: JSON.stringify({ voterAddress: ACCOUNT_3.address, decision: "APPROVE" }),
    });

    await app.request(`/api/v1/proposals/${redProposal.id}/confirm-execution`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        executionTxHash: "0x4444000000000000000000000000000000000000000000000000000000000004",
      }),
    });

    // 7. Privacidade estrita do Imposto de Renda:
    // - Sem token -> 401
    // - Amigo 2 tentando ler ou exportar IR do Amigo 1 -> 403
    // - Amigo 1 lendo e exportando o PRÓPRIO IR -> 200!
    expect((await app.request(`/api/v1/tax/summary/${ACCOUNT_1.address}`)).status).toBe(401);

    const snoopingTaxRes = await app.request(`/api/v1/tax/summary/${ACCOUNT_1.address}`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    expect(snoopingTaxRes.status).toBe(403);

    const snoopingCsvRes = await app.request(
      `/api/v1/tax/export.csv?wallet=${ACCOUNT_1.address}`,
      { headers: { Authorization: `Bearer ${token2}` } },
    );
    expect(snoopingCsvRes.status).toBe(403);

    const ownTaxRes = await app.request(`/api/v1/tax/summary/${ACCOUNT_1.address}`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    expect(ownTaxRes.status).toBe(200);
    const { summary } = await ownTaxRes.json();
    expect(summary.endingSharesBalance).toBe(800);

    const ownCsvRes = await app.request("/api/v1/tax/export.csv", {
      headers: { Authorization: `Bearer ${token1}` },
    });
    expect(ownCsvRes.status).toBe(200);
    const csvText = await ownCsvRes.text();
    expect(csvText).toContain("Amigo1");
    expect(csvText).not.toContain("Amigo2");
  });

  it("blocks unauthorized outsiders and unverified txHashes when running in production Safe mode", async () => {
    const prodSafe = "0x2222222222222222222222222222222222222222" as const;
    const prodConfig = loadConfig({
      STORAGE_DRIVER: "sqlite",
      SQLITE_PATH: ":memory:",
      SAFE_ADDRESS: prodSafe,
      SAFE_THRESHOLD: "2",
      AUTH_SESSION_SECRET: "prod_session_secret_with_at_least_16_chars",
    });

    const prodRepo = new SqliteFundRepository(":memory:");
    const prodContainer = createContainer(prodConfig, {
      repository: prodRepo,
      vaultReader: {
        isDemoSafe: () => false,
        readSafeOwners: async () => [ACCOUNT_1.address.toLowerCase() as `0x${string}`],
        readTokenMetadataOnChain: async () => ({ symbol: "MOCK", name: "Mock", decimals: 18 }),
        readVaultBalances: async () => [],
        readAllowance: async () => 0n,
        verifyUsdcDepositTx: async () => {
          throw new (await import("../domain/errors.js")).GuardrailError(
            "Transação falsa ou inexistente na BNB Chain.",
          );
        },
        verifySafeExecutionTx: async () => true,
      },
    });
    const prodApp = createHttpApp(prodContainer);

    // ACCOUNT_2 (não é owner na Safe real on-chain) tenta se auto-cadastrar -> 403!
    const ch2 = await (
      await prodApp.request("/api/v1/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: ACCOUNT_2.address }),
      })
    ).json();
    const sig2 = await ACCOUNT_2.signMessage({ message: ch2.message });
    const { token: outsiderToken } = await (
      await prodApp.request("/api/v1/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: ACCOUNT_2.address, signature: sig2 }),
      })
    ).json();

    const outsiderJoinRes = await prodApp.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${outsiderToken}`,
      },
      body: JSON.stringify({
        nickname: "Stranger",
        walletAddress: ACCOUNT_2.address,
        isSafeOwner: true,
      }),
    });
    expect(outsiderJoinRes.status).toBe(403);

    // ACCOUNT_1 (owner real on-chain) consegue se cadastrar, mas depósito com txHash falso é bloqueado (422)!
    const ch1 = await (
      await prodApp.request("/api/v1/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: ACCOUNT_1.address }),
      })
    ).json();
    const sig1 = await ACCOUNT_1.signMessage({ message: ch1.message });
    const { token: ownerToken } = await (
      await prodApp.request("/api/v1/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: ACCOUNT_1.address, signature: sig1 }),
      })
    ).json();

    const ownerJoinRes = await prodApp.request("/api/v1/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        nickname: "OwnerReal",
        walletAddress: ACCOUNT_1.address,
        isSafeOwner: true,
      }),
    });
    expect(ownerJoinRes.status).toBe(201);

    const fakeDepRes = await prodApp.request("/api/v1/deposits/record", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        fromAddress: ACCOUNT_1.address,
        amountUsd: 999999,
        txHash: "0xdead00000000000000000000000000000000000000000000000000000000beef",
      }),
    });
    expect(fakeDepRes.status).toBe(422);

    await prodRepo.close();
  });
});
