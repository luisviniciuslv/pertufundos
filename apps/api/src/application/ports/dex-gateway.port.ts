import type {
  BaseBridgeBundle,
  DexQuoteSummary,
  EvmAddress,
  SafeMetaTx,
  TokenMetadata,
} from "@pertufundos/shared";

export interface TokenPriceResult {
  readonly unitPriceUsd: number;
  readonly source: "OKX_LIVE" | "FALLBACK_DEMO";
}

export interface SwapBundleResult {
  readonly transactions: SafeMetaTx[];
  readonly quote: DexQuoteSummary;
}

export interface IDexGateway {
  /** Lista todos os tokens negociáveis na rede principal via OKX DEX (/all-tokens) */
  listAllChainTokens(): Promise<TokenMetadata[]>;

  /** Obtém preço em USD de um ativo via cotação DEX (ou referência em modo demo) */
  getUnitPriceUsd(token: TokenMetadata): Promise<TokenPriceResult>;

  /** Monta transações Safe (ERC-20 Approve se necessário + Swap na OKX DEX v6) */
  buildSwapTransactions(params: {
    safeAddress: EvmAddress;
    fromToken: TokenMetadata;
    toToken: TokenMetadata;
    humanAmount: number;
    slippagePercent: number;
    currentAllowance: bigint;
  }): Promise<SwapBundleResult>;

  /** Monta transação Cross-Chain (OKX DEX v5) para enviar USDC da BNB Chain -> carteira pessoal na Base */
  buildCrossChainUsdcExitTransactions(params: {
    safeAddress: EvmAddress;
    recipientBaseAddress: EvmAddress;
    usdcAmount: number;
    slippagePercent: number;
  }): Promise<SafeMetaTx[]>;

  /** Monta transações Cross-Chain (OKX DEX v5) para trazer USDC da Base -> carteira pessoal na BNB Chain */
  buildCrossChainBaseToBscBridgeTransactions(params: {
    fromBaseAddress: EvmAddress;
    recipientBscAddress: EvmAddress;
    usdcAmount: number;
    slippagePercent: number;
    getBaseAllowance: (spenderAddress: EvmAddress) => Promise<bigint>;
  }): Promise<BaseBridgeBundle>;
}
