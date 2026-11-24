export type EvmAddress = `0x${string}`;

export type LedgerEntryType = "DEPOSIT" | "REDEMPTION";

export type ProposalType = "BUY_ASSET" | "SELL_ASSET" | "REDEEM_SHARES";

export type ProposalStatus =
  | "OPEN"
  | "APPROVED"
  | "REJECTED"
  | "PROPOSED_ON_SAFE"
  | "EXECUTED"
  | "EXPIRED";

export type VoteDecision = "APPROVE" | "REJECT";

export interface Member {
  readonly id: string;
  readonly nickname: string;
  readonly walletAddress: EvmAddress;
  readonly baseReceiveAddress: EvmAddress;
  readonly isSafeOwner: boolean;
  readonly sharesBalance: number;
  readonly avgCostPerShareUsd: number;
  readonly totalDepositedUsd: number;
  readonly totalRedeemedUsd: number;
  readonly realizedGainUsd: number;
  readonly createdAt: string;
}

export interface MemberPosition extends Member {
  readonly ownershipPercent: number;
  readonly currentValueUsd: number;
  readonly unrealizedGainUsd: number;
  readonly unrealizedGainPercent: number;
}

export interface AssetHolding {
  readonly symbol: string;
  readonly name: string;
  readonly address: EvmAddress;
  readonly category: "STABLECOIN" | "ONDO_STOCK";
  readonly rawBalance: string;
  readonly decimals: number;
  readonly balance: number;
  /** Multiplicador Ondo (sValue) representando dividendos reinvestidos (1.0 para USDC) */
  readonly sharesMultiplier: number;
  /** Quantidade econômica equivalente em ações subjacentes (balance * sharesMultiplier) */
  readonly economicShares: number;
  readonly unitPriceUsd: number;
  readonly marketValueUsd: number;
  readonly allocationPercent: number;
  readonly priceSource: "OKX_LIVE" | "FALLBACK_DEMO";
}

export interface MarketSessionStatus {
  readonly isOpen: boolean;
  readonly currentTimeNy: string;
  readonly currentTimeBrt: string;
  readonly windowDescriptionBrt: string;
  readonly warningMessage: string | null;
}

export interface PortfolioSummary {
  readonly safeAddress: EvmAddress;
  readonly primaryChainId: number;
  readonly exitChainId: number;
  readonly safeThreshold: number;
  readonly navPerShareUsd: number;
  readonly totalPortfolioUsd: number;
  readonly totalSharesIssued: number;
  readonly liquidUsdcBalance: number;
  readonly holdings: readonly AssetHolding[];
  readonly members: readonly MemberPosition[];
  readonly marketSession: MarketSessionStatus;
  readonly updatedAt: string;
}

export interface NavSnapshot {
  readonly id: string;
  readonly triggerEvent: string;
  readonly totalPortfolioUsd: number;
  readonly totalShares: number;
  readonly navPerShareUsd: number;
  readonly createdAt: string;
}

export interface LedgerEntry {
  readonly id: string;
  readonly memberId: string;
  readonly memberNickname: string;
  readonly memberWallet: EvmAddress;
  readonly type: LedgerEntryType;
  readonly amountUsd: number;
  readonly sharesDelta: number;
  readonly navAtExecutionUsd: number;
  readonly avgCostAfterUsd: number;
  readonly realizedGainUsd: number;
  readonly txHash: string;
  readonly chainId: number;
  readonly createdAt: string;
}

export interface SafeMetaTx {
  readonly to: EvmAddress;
  readonly value: string;
  readonly data: `0x${string}`;
  readonly operation: 0 | 1; // 0 = Call, 1 = DelegateCall
  readonly description: string;
}

export interface DexQuoteSummary {
  readonly fromSymbol: string;
  readonly toSymbol: string;
  readonly fromAmount: string;
  readonly expectedToAmount: string;
  readonly priceImpactPercent: number;
  readonly slippagePercent: number;
  readonly estimatedGas: string;
  readonly routerAddress: EvmAddress;
  readonly source: "OKX_LIVE" | "SIMULATED";
}

export interface PreparedSafeBatch {
  readonly proposalId: string;
  readonly safeAddress: EvmAddress;
  readonly chainId: number;
  readonly transactions: readonly SafeMetaTx[];
  readonly quoteSummary?: DexQuoteSummary;
  readonly generatedAt: string;
  readonly expiresAt: string;
  readonly warnings: readonly string[];
}

export interface ProposalVote {
  readonly id: string;
  readonly proposalId: string;
  readonly voterAddress: EvmAddress;
  readonly voterNickname: string;
  readonly decision: VoteDecision;
  readonly comment?: string;
  readonly createdAt: string;
}

export interface Proposal {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly type: ProposalType;
  readonly status: ProposalStatus;
  readonly createdByAddress: EvmAddress;
  readonly createdByNickname: string;
  /** Ex: NVDAon em BUY_ASSET/SELL_ASSET, ou USDC em REDEEM_SHARES */
  readonly assetSymbol: string;
  /** Em BUY_ASSET: valor em USDC; em SELL_ASSET: qtd de tokens; em REDEEM_SHARES: qtd de cotas */
  readonly amount: number;
  readonly maxSlippagePercent: number;
  readonly recipientBaseAddress?: EvmAddress;
  readonly requiredApprovals: number;
  readonly approvalsCount: number;
  readonly rejectionsCount: number;
  readonly votes: readonly ProposalVote[];
  readonly safeTxHash?: string;
  readonly executionTxHash?: string;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface ProportionalLiquidationLeg {
  readonly symbol: string;
  readonly tokenAddress: EvmAddress;
  readonly sellAmountTokens: number;
  readonly estimatedProceedsUsd: number;
}

export interface RedemptionPlan {
  readonly memberId: string;
  readonly memberWallet: EvmAddress;
  readonly receiveBaseAddress: EvmAddress;
  readonly sharesToRedeem: number;
  readonly navPerShareUsd: number;
  readonly grossPayoutUsd: number;
  readonly costBasisUsd: number;
  readonly estimatedCapitalGainUsd: number;
  readonly availableLiquidUsdc: number;
  readonly usdcDeficitToSwap: number;
  readonly liquidationLegs: readonly ProportionalLiquidationLeg[];
  readonly p2pMeUrl: string;
}

export interface TaxReportRow {
  readonly dateIso: string;
  readonly memberNickname: string;
  readonly walletAddress: EvmAddress;
  readonly operationType: LedgerEntryType;
  readonly amountUsd: number;
  readonly sharesDelta: number;
  readonly navPerShareUsd: number;
  readonly avgCostPerShareAfterUsd: number;
  readonly costBasisDisposedUsd: number;
  readonly realizedCapitalGainUsd: number;
  readonly txHash: string;
}

export interface MemberTaxSummary {
  readonly member: Member;
  readonly currentNavUsd: number;
  readonly endingSharesBalance: number;
  readonly totalAcquisitionCostUsd: number; // Para Ficha "Bens e Direitos" no IRPF
  readonly currentMarketValueUsd: number;
  readonly totalRealizedGainUsd: number; // Para apuração de Ganho de Capital (GCAP)
  readonly entries: readonly TaxReportRow[];
}
