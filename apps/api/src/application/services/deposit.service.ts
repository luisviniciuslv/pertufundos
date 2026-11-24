import {
  buildExplorerTxUrl,
  calculateSharesToIssue,
  calculateUpdatedAverageCost,
  roundFinancial,
  type EvmAddress,
  type LedgerEntry,
} from "@pertufundos/shared";
import type { AppConfig } from "../../config/env.js";
import { NotFoundError } from "../../domain/errors.js";
import type { IFundRepository } from "../ports/fund-repository.port.js";
import type { INotificationGateway } from "../ports/notification-gateway.port.js";
import type { PortfolioValuationService } from "./portfolio-valuation.service.js";

export interface ProcessDepositCommand {
  readonly fromAddress: EvmAddress;
  readonly amountUsd: number;
  readonly txHash: string;
  /** True quando acionado via Alchemy Webhook (o USDC já entrou no saldo on-chain da Safe) */
  readonly alreadyInOnChainBalance: boolean;
}

export class DepositService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: IFundRepository,
    private readonly valuationService: PortfolioValuationService,
    private readonly notifications: INotificationGateway,
  ) {}

  async processConfirmedDeposit(cmd: ProcessDepositCommand): Promise<{
    entry: LedgerEntry;
    idempotentReplay: boolean;
  }> {
    const normalizedTxHash = cmd.txHash.toLowerCase();

    // 1. Garantia de idempotência (retries de webhook nunca duplicam cotas)
    const existing = await this.repository.findLedgerEntryByTxHash(normalizedTxHash);
    if (existing) {
      return { entry: existing, idempotentReplay: true };
    }

    // 2. Identifica o amigo remetente
    const member = await this.repository.findMemberByWallet(cmd.fromAddress);
    if (!member) {
      throw new NotFoundError(
        `Remetente ${cmd.fromAddress} não está cadastrado entre os participantes do fundo. Cadastre a carteira antes de creditar cotas.`,
      );
    }

    // 3. Calcula o NAV imediatamente ANTES do novo depósito
    const preDepositSummary = await this.valuationService.getPortfolioSummary(
      cmd.alreadyInOnChainBalance ? cmd.amountUsd : 0,
    );
    const navAtExecutionUsd = preDepositSummary.navPerShareUsd;

    // 4. Calcula novas cotas e novo Preço Médio Ponderado (para Imposto de Renda)
    const sharesToIssue = calculateSharesToIssue({
      depositUsd: cmd.amountUsd,
      navPerShareUsd: navAtExecutionUsd,
    });

    const newSharesBalance = roundFinancial(member.sharesBalance + sharesToIssue);
    const newAvgCostUsd = calculateUpdatedAverageCost({
      currentShares: member.sharesBalance,
      currentAvgCostUsd: member.avgCostPerShareUsd,
      addedShares: sharesToIssue,
      navAtDepositUsd: navAtExecutionUsd,
    });

    // 5. Persiste mutação atômica no Ledger + Snapshot de NAV pós-emissão
    const entry = await this.repository.applyLedgerMutation({
      memberId: member.id,
      type: "DEPOSIT",
      amountUsd: roundFinancial(cmd.amountUsd, 4),
      sharesDelta: sharesToIssue,
      navAtExecutionUsd,
      newSharesBalance,
      newAvgCostUsd,
      realizedGainDeltaUsd: 0,
      txHash: normalizedTxHash,
      chainId: this.config.PRIMARY_CHAIN_ID,
    });

    await this.repository.saveNavSnapshot({
      triggerEvent: `DEPOSIT:${member.nickname}`,
      totalPortfolioUsd: roundFinancial(preDepositSummary.totalPortfolioUsd + cmd.amountUsd, 4),
      totalShares: roundFinancial(preDepositSummary.totalSharesIssued + sharesToIssue),
      navPerShareUsd: navAtExecutionUsd,
    });

    // 6. Notifica o grupo (Discord / Telegram)
    await this.notifications.notifyGroup({
      title: "Novo Aporte Confirmado na Safe",
      message: `${member.nickname} aportou US$ ${cmd.amountUsd.toFixed(2)} em USDC e recebeu ${sharesToIssue.toFixed(4)} cotas.`,
      fields: [
        { label: "NAV Vigente", value: `US$ ${navAtExecutionUsd.toFixed(4)}` },
        { label: "Saldo de Cotas do Membro", value: `${newSharesBalance.toFixed(4)} cotas` },
      ],
      actionUrl: buildExplorerTxUrl(normalizedTxHash, this.config.PRIMARY_CHAIN_ID),
    });

    return { entry, idempotentReplay: false };
  }
}
