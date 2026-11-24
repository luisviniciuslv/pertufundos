import {
  castVoteSchema,
  confirmExecutionSchema,
  createRedemptionSchema,
  createTradeProposalSchema,
  evmAddressSchema,
  linkSafeTxSchema,
  recordDepositSchema,
  registerMemberSchema,
  requestAuthChallengeSchema,
  verifyAuthSignatureSchema,
  type EvmAddress,
  type ProposalStatus,
} from "@pertufundos/shared";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import type { AppContainer } from "../../container.js";
import { DomainError, ForbiddenOperationError } from "../../domain/errors.js";
import {
  extractSafeUsdcDeposits,
  verifyAlchemyWebhookSignature,
} from "../../infrastructure/webhooks/alchemy-signature.verifier.js";

export function createHttpApp(container: AppContainer): Hono {
  const app = new Hono();

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin:
        container.config.CORS_ORIGIN === "*"
          ? "*"
          : [container.config.CORS_ORIGIN, "http://localhost:3000"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Alchemy-Signature"],
    }),
  );

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      const message = err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return c.json({ error: { code: "VALIDATION_ERROR", message } }, 400);
    }
    if (err instanceof DomainError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.statusCode as 400 | 401 | 403 | 404 | 409 | 422 | 502,
      );
    }
    console.error("[API Unhandled Error]", err);
    return c.json(
      { error: { code: "INTERNAL_ERROR", message: "Erro interno inesperado no servidor." } },
      500,
    );
  });

  const requireAuthWallet = (c: Context): EvmAddress =>
    container.walletAuthService.authenticateBearerHeader(c.req.header("authorization"));

  const assertCallerMatchesWallet = (authWallet: EvmAddress, targetWallet: EvmAddress): void => {
    if (authWallet.toLowerCase() !== targetWallet.toLowerCase()) {
      throw new ForbiddenOperationError(
        "Operação bloqueada: você só pode executar esta ação em nome da sua própria carteira autenticada.",
      );
    }
  };

  const requireAuthenticatedSafeOwner = async (c: Context): Promise<EvmAddress> => {
    const authWallet = requireAuthWallet(c);
    const member = await container.repository.findMemberByWallet(authWallet);
    if (!member || !member.isSafeOwner) {
      throw new ForbiddenOperationError(
        "Apenas membros autenticados como owners da Safe podem executar esta ação.",
      );
    }
    return authWallet;
  };

  const api = new Hono();

  api.get("/health", (c) =>
    c.json({
      status: "ok",
      storageDriver: container.config.STORAGE_DRIVER,
      primaryChainId: container.config.PRIMARY_CHAIN_ID,
      exitChainId: container.config.EXIT_CHAIN_ID,
      safeAddress: container.config.SAFE_ADDRESS,
      okxLiveConfigured: Boolean(container.config.OKX_API_KEY),
      timestamp: new Date().toISOString(),
    }),
  );

  // --- Autenticação Criptográfica via Carteira (EIP-191 Sign-In, Zero Gás) ---
  api.post("/auth/challenge", async (c) => {
    const body = requestAuthChallengeSchema.parse(await c.req.json());
    const challenge = container.walletAuthService.createChallenge(body.walletAddress);
    return c.json(challenge);
  });

  api.post("/auth/verify", async (c) => {
    const body = verifyAuthSignatureSchema.parse(await c.req.json());
    const session = await container.walletAuthService.verifySignatureAndIssueSession({
      walletAddress: body.walletAddress,
      signature: body.signature as `0x${string}`,
    });
    return c.json(session);
  });

  api.get("/auth/me", async (c) => {
    const authWallet = requireAuthWallet(c);
    const member = await container.repository.findMemberByWallet(authWallet);
    return c.json({ walletAddress: authWallet, member });
  });

  // --- Visão Transparente do Grupo: Portfólio, Cap Table & NAV ---
  api.get("/portfolio", async (c) => {
    const summary = await container.valuationService.getPortfolioSummary();
    return c.json(summary);
  });

  api.get("/nav/snapshots", async (c) => {
    const limit = Number(c.req.query("limit") ?? 30);
    const snapshots = await container.repository.listNavSnapshots(limit);
    return c.json({ snapshots });
  });

  // --- Participantes (Amigos) ---
  api.get("/members", async (c) => {
    const members = await container.repository.listMembers();
    return c.json({ members });
  });

  api.post("/members", async (c) => {
    const authWallet = requireAuthWallet(c);
    const body = registerMemberSchema.parse(await c.req.json());
    const isDemoMode = container.vaultReader.isDemoSafe(container.config.SAFE_ADDRESS);

    let verifiedIsSafeOwner = body.isSafeOwner;

    if (!isDemoMode) {
      // Em produção, consulta diretamente `getOwners()` no contrato inteligente da Safe na BNB Chain!
      // Nenhum desconhecido da internet consegue se auto-cadastrar como owner sem estar na Safe real.
      const onChainOwners = await container.vaultReader.readSafeOwners(
        container.config.SAFE_ADDRESS,
      );
      const callerIsOnChainOwner = onChainOwners.includes(authWallet.toLowerCase() as EvmAddress);
      if (!callerIsOnChainOwner) {
        throw new ForbiddenOperationError(
          "Acesso negado: sua carteira não consta entre os signatários (owners) do contrato da Safe na BNB Chain.",
        );
      }
      verifiedIsSafeOwner = onChainOwners.includes(body.walletAddress.toLowerCase() as EvmAddress);
    } else {
      const isSelfRegistration = body.walletAddress.toLowerCase() === authWallet.toLowerCase();
      if (!isSelfRegistration) {
        const caller = await container.repository.findMemberByWallet(authWallet);
        if (!caller || !caller.isSafeOwner) {
          throw new ForbiddenOperationError(
            "Você só pode cadastrar sua própria carteira conectada (ou ser um owner já cadastrado adicionando um amigo).",
          );
        }
      }
    }

    const member = await container.repository.createMember({
      nickname: body.nickname,
      walletAddress: body.walletAddress,
      baseReceiveAddress: body.baseReceiveAddress ?? body.walletAddress,
      isSafeOwner: verifiedIsSafeOwner,
    });
    return c.json({ member }, 201);
  });

  // --- Ledger & Aportes ---
  api.get("/ledger", async (c) => {
    const memberId = c.req.query("memberId");
    const entries = await container.repository.listLedgerEntries(memberId);
    return c.json({ entries });
  });

  api.post("/deposits/record", async (c) => {
    const authWallet = requireAuthWallet(c);
    const body = recordDepositSchema.parse(await c.req.json());
    assertCallerMatchesWallet(authWallet, body.fromAddress);

    const isDemoMode = container.vaultReader.isDemoSafe(container.config.SAFE_ADDRESS);
    let verifiedAmountUsd = body.amountUsd;

    if (!isDemoMode) {
      // Em produção, NUNCA confia no valor informado pelo cliente: lê o recibo real na BNB Chain!
      const verifiedOnChain = await container.vaultReader.verifyUsdcDepositTx({
        txHash: body.txHash as `0x${string}`,
        safeAddress: container.config.SAFE_ADDRESS,
      });
      assertCallerMatchesWallet(authWallet, verifiedOnChain.fromAddress);
      verifiedAmountUsd = verifiedOnChain.amountUsd;
    }

    const result = await container.depositService.processConfirmedDeposit({
      fromAddress: authWallet,
      amountUsd: verifiedAmountUsd,
      txHash: body.txHash,
      alreadyInOnChainBalance: !isDemoMode,
    });
    return c.json(result, result.idempotentReplay ? 200 : 201);
  });

  // --- Webhook Oficial Alchemy (Address Activity — Autenticado via X-Alchemy-Signature) ---
  api.post("/webhooks/alchemy", async (c) => {
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header("x-alchemy-signature");

    verifyAlchemyWebhookSignature({
      rawBody,
      signatureHeader,
      signingKey: container.config.ALCHEMY_WEBHOOK_SIGNING_KEY,
    });

    const deposits = extractSafeUsdcDeposits({
      rawBody,
      safeAddress: container.config.SAFE_ADDRESS,
    });

    const processed = [];
    for (const dep of deposits) {
      try {
        const res = await container.depositService.processConfirmedDeposit({
          fromAddress: dep.fromAddress,
          amountUsd: dep.amountUsd,
          txHash: dep.txHash,
          alreadyInOnChainBalance: true,
        });
        processed.push({ txHash: dep.txHash, status: "CREDITED", entryId: res.entry.id });
      } catch (err) {
        processed.push({
          txHash: dep.txHash,
          status: "SKIPPED",
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return c.json({ received: deposits.length, processed });
  });

  // --- Governança Off-chain, OKX DEX & Fila Safe (Exige Assinatura do Titular) ---
  api.get("/proposals", async (c) => {
    const status = c.req.query("status") as ProposalStatus | undefined;
    const proposals = await container.governanceService.listProposals(status);
    return c.json({ proposals });
  });

  api.get("/proposals/:id", async (c) => {
    const proposal = await container.governanceService.getProposal(c.req.param("id"));
    return c.json({ proposal });
  });

  api.post("/proposals/trade", async (c) => {
    const authWallet = requireAuthWallet(c);
    const body = createTradeProposalSchema.parse(await c.req.json());
    assertCallerMatchesWallet(authWallet, body.createdByAddress);

    const proposal = await container.governanceService.createTradeProposal({
      ...body,
      createdByAddress: authWallet,
    });
    return c.json({ proposal }, 201);
  });

  api.post("/redemptions/preview", async (c) => {
    const authWallet = requireAuthWallet(c);
    const body = createRedemptionSchema.parse(await c.req.json());
    assertCallerMatchesWallet(authWallet, body.memberWallet);

    const plan = await container.governanceService.previewRedemptionPlan({
      ...body,
      memberWallet: authWallet,
    });
    return c.json({ plan });
  });

  api.post("/proposals/redemption", async (c) => {
    const authWallet = requireAuthWallet(c);
    const body = createRedemptionSchema.parse(await c.req.json());
    assertCallerMatchesWallet(authWallet, body.memberWallet);

    const result = await container.governanceService.createRedemptionProposal({
      ...body,
      memberWallet: authWallet,
    });
    return c.json(result, 201);
  });

  api.post("/proposals/:id/votes", async (c) => {
    const authWallet = requireAuthWallet(c);
    const body = castVoteSchema.parse(await c.req.json());
    assertCallerMatchesWallet(authWallet, body.voterAddress);

    const proposal = await container.governanceService.castVote(c.req.param("id"), {
      ...body,
      voterAddress: authWallet,
    });
    return c.json({ proposal });
  });

  api.post("/proposals/:id/prepare-safe-tx", async (c) => {
    await requireAuthenticatedSafeOwner(c);
    const raw = await c.req.json().catch(() => ({}));
    const forceOffHours = Boolean((raw as { forceOffHours?: boolean })?.forceOffHours);
    const batch = await container.governanceService.prepareSafeTransactionBatch(
      c.req.param("id"),
      { forceOffHours },
    );
    return c.json({ batch });
  });

  api.post("/proposals/:id/link-safe-tx", async (c) => {
    const authWallet = await requireAuthenticatedSafeOwner(c);
    const body = linkSafeTxSchema.parse(await c.req.json());
    assertCallerMatchesWallet(authWallet, body.proposerAddress);

    const proposal = await container.governanceService.linkSafeTransaction(c.req.param("id"), {
      ...body,
      proposerAddress: authWallet,
    });
    return c.json({ proposal });
  });

  api.post("/proposals/:id/confirm-execution", async (c) => {
    const authWallet = await requireAuthenticatedSafeOwner(c);
    const body = confirmExecutionSchema.parse(await c.req.json());

    // Em produção, valida on-chain o evento `ExecutionSuccess` no contrato da Safe antes de queimar cotas!
    await container.vaultReader.verifySafeExecutionTx({
      txHash: body.executionTxHash as `0x${string}`,
      safeAddress: container.config.SAFE_ADDRESS,
    });

    const proposal = await container.governanceService.confirmProposalExecution(
      c.req.param("id"),
      {
        executionTxHash: body.executionTxHash,
        executorAddress: authWallet,
      },
    );
    return c.json({ proposal });
  });

  // --- Relatórios de Imposto de Renda (IRPF / GCAP — ESTRITAMENTE PRIVADOS AO TITULAR) ---
  api.get("/tax/summary/:wallet", async (c) => {
    const authWallet = requireAuthWallet(c);
    const requestedWallet = evmAddressSchema.parse(c.req.param("wallet"));
    if (requestedWallet.toLowerCase() !== authWallet.toLowerCase()) {
      throw new ForbiddenOperationError(
        "Privacidade fiscal: cada participante só pode visualizar o seu próprio relatório de Imposto de Renda.",
      );
    }
    const summary = await container.taxReportService.getMemberTaxSummary(authWallet);
    return c.json({ summary });
  });

  api.get("/tax/export.csv", async (c) => {
    const authWallet = requireAuthWallet(c);
    const walletParam = c.req.query("wallet");
    if (walletParam) {
      const requested = evmAddressSchema.parse(walletParam);
      if (requested.toLowerCase() !== authWallet.toLowerCase()) {
        throw new ForbiddenOperationError(
          "Privacidade fiscal: você só pode exportar o CSV do seu próprio CPF/carteira.",
        );
      }
    }

    const { filename, csvContent } = await container.taxReportService.exportTaxCsv(authWallet);

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  app.route("/api/v1", api);
  return app;
}
