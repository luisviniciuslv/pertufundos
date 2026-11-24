import {
  BNB_USDC_TOKEN,
  buildSafeQueueUrl,
  calculateCapitalGainOnRedemption,
  calculateProportionalSellPlan,
  calculateRedemptionValueUsd,
  getUsMarketSessionStatus,
  P2P_ME_CONFIG,
  roundFinancial,
  type CastVoteInput,
  type ConfirmExecutionInput,
  type CreateRedemptionInput,
  type CreateTradeProposalInput,
  type LinkSafeTxInput,
  type PreparedSafeBatch,
  type Proposal,
  type ProposalStatus,
  type RedemptionPlan,
  type SafeMetaTx,
} from "@pertufundos/shared";
import type { AppConfig } from "../../config/env.js";
import {
  ConflictError,
  ForbiddenOperationError,
  GuardrailError,
  NotFoundError,
  ValidationError,
} from "../../domain/errors.js";
import type { IDexGateway } from "../ports/dex-gateway.port.js";
import type { IFundRepository } from "../ports/fund-repository.port.js";
import type { INotificationGateway } from "../ports/notification-gateway.port.js";
import type { AssetCatalogService } from "./asset-catalog.service.js";
import type { PortfolioValuationService } from "./portfolio-valuation.service.js";

const PROPOSAL_TTL_HOURS = 48;
const QUOTE_TTL_MINUTES = 4;

export class GovernanceService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IFundRepository,
    private readonly valuationService: PortfolioValuationService,
    private readonly assetCatalog: AssetCatalogService,
    private readonly dexGateway: IDexGateway,
    private readonly notifications: INotificationGateway,
  ) {}

  async listProposals(status?: ProposalStatus): Promise<Proposal[]> {
    return this.repository.listProposals(status);
  }

  async getProposal(id: string): Promise<Proposal> {
    const proposal = await this.repository.findProposalById(id);
    if (!proposal) {
      throw new NotFoundError(`Proposta ${id} não encontrada`);
    }
    return proposal;
  }

  async createTradeProposal(input: CreateTradeProposalInput): Promise<Proposal> {
    const creator = await this.repository.findMemberByWallet(input.createdByAddress);
    if (!creator || !creator.isSafeOwner) {
      throw new ForbiddenOperationError(
        "Apenas membros cadastrados como owners da Safe podem criar propostas de trade.",
      );
    }

    if (input.maxSlippagePercent > this.config.MAX_SLIPPAGE_PERCENT * 2) {
      throw new GuardrailError(
        `Slippage solicitado (${input.maxSlippagePercent}%) excede o teto de segurança configurado.`,
      );
    }

    // Garante que o ativo existe (Ondo Stock, Cripto ou Contrato Importado) e passa a ser rastreado na carteira
    const resolvedAsset = await this.assetCatalog.resolveAndEnsureTracked({
      symbol: input.assetSymbol,
      address: input.assetAddress,
    });

    const summary = await this.valuationService.getPortfolioSummary();
    if (input.type === "BUY_ASSET" && input.amount > summary.liquidUsdcBalance + 0.01) {
      throw new ValidationError(
        `Saldo de USDC livre na Safe (US$ ${summary.liquidUsdcBalance.toFixed(2)}) insuficiente para compra de US$ ${input.amount.toFixed(2)}.`,
      );
    }

    if (input.type === "SELL_ASSET") {
      const holding = summary.holdings.find(
        (h) => h.address.toLowerCase() === resolvedAsset.address.toLowerCase(),
      );
      if (!holding || input.amount > holding.balance + 1e-8) {
        throw new ValidationError(
          `Saldo de ${resolvedAsset.symbol} na Safe (${holding?.balance.toFixed(6) ?? 0}) insuficiente para venda de ${input.amount}.`,
        );
      }
    }

    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_HOURS * 3600 * 1000).toISOString();
    const created = await this.repository.createProposal({
      title: input.title,
      description: input.description,
      type: input.type,
      createdByAddress: creator.walletAddress,
      assetSymbol: resolvedAsset.symbol,
      amount: input.amount,
      maxSlippagePercent: input.maxSlippagePercent,
      requiredApprovals: this.config.SAFE_THRESHOLD,
      expiresAt,
    });

    // Registra automaticamente o voto favorável do autor da proposta
    const withCreatorVote = await this.repository.upsertVoteAndRefreshStatus({
      proposalId: created.id,
      voterAddress: creator.walletAddress,
      decision: "APPROVE",
      comment: "Proposta criada pelo membro",
    });

    await this.notifications.notifyGroup({
      title: `Nova Proposta: ${withCreatorVote.title}`,
      message: `${creator.nickname} propôs ${input.type === "BUY_ASSET" ? "comprar" : "vender"} ${input.assetSymbol} (${input.amount}). Votação aberta no painel!`,
      fields: [
        {
          label: "Quórum",
          value: `${withCreatorVote.approvalsCount}/${withCreatorVote.requiredApprovals}`,
        },
      ],
    });

    return withCreatorVote;
  }

  async previewRedemptionPlan(input: CreateRedemptionInput): Promise<RedemptionPlan> {
    const member = await this.repository.findMemberByWallet(input.memberWallet);
    if (!member) {
      throw new NotFoundError("Membro não encontrado para o endereço informado.");
    }
    if (input.sharesToRedeem > member.sharesBalance + 1e-8) {
      throw new ValidationError(
        `Saldo de cotas insuficiente: você possui ${member.sharesBalance.toFixed(4)} cotas e solicitou resgate de ${input.sharesToRedeem.toFixed(4)}.`,
      );
    }

    const summary = await this.valuationService.getPortfolioSummary();
    const grossPayoutUsd = calculateRedemptionValueUsd({
      sharesToRedeem: input.sharesToRedeem,
      navPerShareUsd: summary.navPerShareUsd,
    });

    const { costBasisDisposedUsd, realizedGainUsd } = calculateCapitalGainOnRedemption({
      sharesRedeemed: input.sharesToRedeem,
      redemptionNavUsd: summary.navPerShareUsd,
      avgCostPerShareUsd: member.avgCostPerShareUsd,
    });

    const usdcDeficitToSwap = Math.max(
      0,
      roundFinancial(grossPayoutUsd - summary.liquidUsdcBalance, 4),
    );

    const liquidationLegs =
      usdcDeficitToSwap > 0
        ? calculateProportionalSellPlan({
            deficitUsd: usdcDeficitToSwap,
            holdings: summary.holdings,
            slippageBufferPercent: input.maxSlippagePercent,
          })
        : [];

    const receiveBaseAddress = input.receiveBaseAddress ?? member.baseReceiveAddress;

    return {
      memberId: member.id,
      memberWallet: member.walletAddress,
      receiveBaseAddress,
      sharesToRedeem: input.sharesToRedeem,
      navPerShareUsd: summary.navPerShareUsd,
      grossPayoutUsd,
      costBasisUsd: costBasisDisposedUsd,
      estimatedCapitalGainUsd: realizedGainUsd,
      availableLiquidUsdc: summary.liquidUsdcBalance,
      usdcDeficitToSwap,
      liquidationLegs,
      p2pMeUrl: P2P_ME_CONFIG.appUrl,
    };
  }

  async createRedemptionProposal(input: CreateRedemptionInput): Promise<{
    proposal: Proposal;
    plan: RedemptionPlan;
  }> {
    const plan = await this.previewRedemptionPlan(input);
    const member = await this.repository.findMemberById(plan.memberId);
    if (!member) {
      throw new NotFoundError("Membro não encontrado.");
    }

    const expiresAt = new Date(Date.now() + PROPOSAL_TTL_HOURS * 3600 * 1000).toISOString();
    const created = await this.repository.createProposal({
      title: `Resgate de ${input.sharesToRedeem.toFixed(4)} cotas (${member.nickname})`,
      description: `Pagamento estimado de US$ ${plan.grossPayoutUsd.toFixed(2)} em USDC na rede Base (${plan.receiveBaseAddress}) para conversão via P2P.me.`,
      type: "REDEEM_SHARES",
      createdByAddress: member.walletAddress,
      assetSymbol: "USDC",
      amount: input.sharesToRedeem,
      maxSlippagePercent: input.maxSlippagePercent,
      recipientBaseAddress: plan.receiveBaseAddress,
      requiredApprovals: this.config.SAFE_THRESHOLD,
      expiresAt,
    });

    const proposal = member.isSafeOwner
      ? await this.repository.upsertVoteAndRefreshStatus({
          proposalId: created.id,
          voterAddress: member.walletAddress,
          decision: "APPROVE",
          comment: "Solicitação de resgate pelo titular das cotas",
        })
      : created;

    await this.notifications.notifyGroup({
      title: `Solicitação de Resgate: ${member.nickname}`,
      message: `${member.nickname} solicitou resgate de ${input.sharesToRedeem.toFixed(4)} cotas (~US$ ${plan.grossPayoutUsd.toFixed(2)} na rede Base).`,
      fields: [
        { label: "Déficit a liquidar em DEX", value: `US$ ${plan.usdcDeficitToSwap.toFixed(2)}` },
        { label: "Destino Base (P2P.me)", value: plan.receiveBaseAddress },
      ],
    });

    return { proposal, plan };
  }

  async castVote(proposalId: string, input: CastVoteInput): Promise<Proposal> {
    const proposal = await this.getProposal(proposalId);
    if (proposal.status !== "OPEN" && proposal.status !== "APPROVED") {
      throw new ConflictError(
        `Não é possível votar em proposta com status ${proposal.status}.`,
      );
    }

    const voter = await this.repository.findMemberByWallet(input.voterAddress);
    if (!voter || !voter.isSafeOwner) {
      throw new ForbiddenOperationError("Apenas owners cadastrados da Safe podem votar.");
    }

    const updated = await this.repository.upsertVoteAndRefreshStatus({
      proposalId,
      voterAddress: voter.walletAddress,
      decision: input.decision,
      comment: input.comment,
    });

    if (proposal.status === "OPEN" && updated.status === "APPROVED") {
      await this.notifications.notifyGroup({
        title: `Proposta Aprovada Off-chain: ${updated.title}`,
        message: `Quórum atingido (${updated.approvalsCount}/${updated.requiredApprovals})! Gere o payload OKX DEX e assine na fila da Safe.`,
        actionUrl: buildSafeQueueUrl(this.config.SAFE_ADDRESS, this.config.PRIMARY_CHAIN_ID),
      });
    }

    return updated;
  }

  /**
   * Somente após a aprovação off-chain, consulta a OKX DEX API em tempo real para gerar o calldata fresco
   * (evitando expiração de cotação durante a votação) e monta o batch MultiSend para a Safe.
   */
  async prepareSafeTransactionBatch(
    proposalId: string,
    options: { forceOffHours?: boolean } = {},
  ): Promise<PreparedSafeBatch> {
    const proposal = await this.getProposal(proposalId);
    if (proposal.status !== "APPROVED" && proposal.status !== "PROPOSED_ON_SAFE") {
      throw new ConflictError(
        `A proposta precisa estar APPROVED antes de gerar calldata on-chain (status atual: ${proposal.status}).`,
      );
    }

    const warnings: string[] = [];
    const market = getUsMarketSessionStatus();

    const allTransactions: SafeMetaTx[] = [];
    let primaryQuote = undefined;

    if (proposal.type === "BUY_ASSET" || proposal.type === "SELL_ASSET") {
      const targetToken = await this.assetCatalog.resolveAndEnsureTracked({
        symbol: proposal.assetSymbol,
      });

      // A trava de horário da bolsa americana aplica-se APENAS a ações/ETFs Ondo (Cripto negocia 24/7!)
      if (targetToken.category === "ONDO_STOCK" && !market.isOpen) {
        if (this.config.ENFORCE_US_MARKET_HOURS && !options.forceOffHours) {
          throw new GuardrailError(
            market.warningMessage ??
              "Pregão regular dos EUA fechado para ações tokenizadas. Aguarde a abertura ou confirme override explícito.",
          );
        }
        if (market.warningMessage) {
          warnings.push(market.warningMessage);
        }
      }

      const fromToken = proposal.type === "BUY_ASSET" ? BNB_USDC_TOKEN : targetToken;
      const toToken = proposal.type === "BUY_ASSET" ? targetToken : BNB_USDC_TOKEN;

      const swapBundle = await this.dexGateway.buildSwapTransactions({
        safeAddress: this.config.SAFE_ADDRESS,
        fromToken,
        toToken,
        humanAmount: proposal.amount,
        slippagePercent: Math.min(proposal.maxSlippagePercent, this.config.MAX_SLIPPAGE_PERCENT),
        currentAllowance: 0n,
      });

      this.assertPriceImpactSafe(swapBundle.quote.priceImpactPercent);
      allTransactions.push(...swapBundle.transactions);
      primaryQuote = swapBundle.quote;
    } else if (proposal.type === "REDEEM_SHARES") {
      const plan = await this.previewRedemptionPlan({
        memberWallet: proposal.createdByAddress,
        sharesToRedeem: proposal.amount,
        receiveBaseAddress: proposal.recipientBaseAddress,
        maxSlippagePercent: proposal.maxSlippagePercent,
      });

      // 1. Liquida proporcionalmente ativos investidos (Ações Ondo e/ou Cripto) para cobrir déficit de USDC
      for (const leg of plan.liquidationLegs) {
        if (leg.sellAmountTokens <= 0) continue;
        const assetToken = await this.assetCatalog.resolveAndEnsureTracked({
          symbol: leg.symbol,
          address: leg.tokenAddress,
        });

        if (assetToken.category === "ONDO_STOCK" && !market.isOpen) {
          if (this.config.ENFORCE_US_MARKET_HOURS && !options.forceOffHours) {
            throw new GuardrailError(
              `O resgate exige venda proporcional de ações tokenizadas (${assetToken.symbol}), mas o pregão americano está fechado. ${market.warningMessage ?? ""}`,
            );
          }
          if (market.warningMessage && warnings.length === 0) warnings.push(market.warningMessage);
        }

        const legSwap = await this.dexGateway.buildSwapTransactions({
          safeAddress: this.config.SAFE_ADDRESS,
          fromToken: assetToken,
          toToken: BNB_USDC_TOKEN,
          humanAmount: leg.sellAmountTokens,
          slippagePercent: Math.min(proposal.maxSlippagePercent, this.config.MAX_SLIPPAGE_PERCENT),
          currentAllowance: 0n,
        });

        this.assertPriceImpactSafe(legSwap.quote.priceImpactPercent);
        allTransactions.push(...legSwap.transactions);
      }

      // 2. Faz Bridge Cross-Chain do USDC (BNB Chain -> Base) direto para a carteira pessoal do amigo
      const bridgeTxs = await this.dexGateway.buildCrossChainUsdcExitTransactions({
        safeAddress: this.config.SAFE_ADDRESS,
        recipientBaseAddress: plan.receiveBaseAddress,
        usdcAmount: plan.grossPayoutUsd,
        slippagePercent: Math.min(proposal.maxSlippagePercent, this.config.MAX_SLIPPAGE_PERCENT),
      });

      allTransactions.push(...bridgeTxs);
    }

    const now = Date.now();
    return {
      proposalId: proposal.id,
      safeAddress: this.config.SAFE_ADDRESS,
      chainId: this.config.PRIMARY_CHAIN_ID,
      transactions: allTransactions,
      quoteSummary: primaryQuote,
      generatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
      warnings,
    };
  }

  async linkSafeTransaction(proposalId: string, input: LinkSafeTxInput): Promise<Proposal> {
    const proposal = await this.getProposal(proposalId);
    if (proposal.status !== "APPROVED" && proposal.status !== "PROPOSED_ON_SAFE") {
      throw new ConflictError("Proposta precisa estar aprovada para vincular um safeTxHash.");
    }
    return this.repository.markProposalSafeLinked(proposalId, input.safeTxHash.toLowerCase());
  }

  async confirmProposalExecution(
    proposalId: string,
    input: ConfirmExecutionInput,
  ): Promise<Proposal> {
    const proposal = await this.getProposal(proposalId);
    if (proposal.status === "EXECUTED") {
      return proposal;
    }

    const normalizedTxHash = input.executionTxHash.toLowerCase();

    // Caso seja um resgate de cotas, queima as cotas do participante e apura Ganho de Capital no Ledger
    if (proposal.type === "REDEEM_SHARES") {
      const existingLedger = await this.repository.findLedgerEntryByTxHash(normalizedTxHash);
      if (!existingLedger) {
        const member = await this.repository.findMemberByWallet(proposal.createdByAddress);
        if (!member) {
          throw new NotFoundError("Membro titular do resgate não encontrado.");
        }
        const summary = await this.valuationService.getPortfolioSummary();
        const { grossPayoutUsd, realizedGainUsd } = (() => {
          const cap = calculateCapitalGainOnRedemption({
            sharesRedeemed: proposal.amount,
            redemptionNavUsd: summary.navPerShareUsd,
            avgCostPerShareUsd: member.avgCostPerShareUsd,
          });
          return {
            grossPayoutUsd: cap.grossProceedsUsd,
            realizedGainUsd: cap.realizedGainUsd,
          };
        })();

        const remainingShares = Math.max(0, roundFinancial(member.sharesBalance - proposal.amount));
        // Regra fiscal: venda parcial mantém o PM unitário; zerar posição reseta PM para 0
        const newAvgCostUsd = remainingShares > 0 ? member.avgCostPerShareUsd : 0;

        await this.repository.applyLedgerMutation({
          memberId: member.id,
          type: "REDEMPTION",
          amountUsd: grossPayoutUsd,
          sharesDelta: -proposal.amount,
          navAtExecutionUsd: summary.navPerShareUsd,
          newSharesBalance: remainingShares,
          newAvgCostUsd,
          realizedGainDeltaUsd: realizedGainUsd,
          txHash: normalizedTxHash,
          chainId: this.config.EXIT_CHAIN_ID,
        });

        await this.notifications.notifyGroup({
          title: `Resgate Liquidado na Base: ${member.nickname}`,
          message: `US$ ${grossPayoutUsd.toFixed(2)} enviados para ${proposal.recipientBaseAddress} na rede Base. ${proposal.amount.toFixed(4)} cotas queimadas. Pronto para saque Pix no P2P.me!`,
          actionUrl: P2P_ME_CONFIG.appUrl,
        });
      }
    }

    const executed = await this.repository.markProposalExecuted(proposalId, normalizedTxHash);
    await this.valuationService.recordNavSnapshot(`EXECUTED:${proposal.type}:${proposal.assetSymbol}`);
    return executed;
  }

  private assertPriceImpactSafe(priceImpactPercent: number): void {
    if (Math.abs(priceImpactPercent) > this.config.MAX_PRICE_IMPACT_PERCENT) {
      throw new GuardrailError(
        `Price impact retornado pela OKX DEX (${priceImpactPercent.toFixed(2)}%) excede o limite de segurança (${this.config.MAX_PRICE_IMPACT_PERCENT}%). Divida a ordem ou aguarde maior liquidez.`,
      );
    }
  }
}
