import { SUPPORTED_CHAINS } from "./chains.js";

export type TokenCategory = "STABLECOIN" | "ONDO_STOCK";

export interface TokenMetadata {
  readonly symbol: string;
  readonly name: string;
  readonly underlyingTicker?: string;
  readonly address: `0x${string}`;
  readonly chainId: number;
  readonly decimals: number;
  readonly category: TokenCategory;
  readonly referencePriceUsd: number; // Usado apenas como fallback caso RPC/DEX offline em modo demo
}

/**
 * ATENÇÃO CRÍTICA DE ARQUITETURA:
 * - Na BNB Chain (56), o Binance-Peg USDC possui 18 casas decimais!
 * - Na Base (8453), o USDC nativo da Circle possui 6 casas decimais!
 * Todos os cálculos do sistema normalizam valores brutos usando `token.decimals`.
 */
export const BNB_USDC_TOKEN: TokenMetadata = {
  symbol: "USDC",
  name: "USD Coin (BNB Chain)",
  address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
  chainId: SUPPORTED_CHAINS.BNB.id,
  decimals: 18,
  category: "STABLECOIN",
  referencePriceUsd: 1.0,
};

export const BASE_USDC_TOKEN: TokenMetadata = {
  symbol: "USDC",
  name: "USD Coin (Base Native)",
  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  chainId: SUPPORTED_CHAINS.BASE.id,
  decimals: 6,
  category: "STABLECOIN",
  referencePriceUsd: 1.0,
};

export const ONDO_STOCK_TOKENS: readonly TokenMetadata[] = [
  {
    symbol: "NVDAon",
    name: "NVIDIA Ondo Tokenized",
    underlyingTicker: "NVDA",
    address: "0xa9ee28c80f960b889dfbd1902055218cba016f75",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 142.5,
  },
  {
    symbol: "AAPLon",
    name: "Apple Ondo Tokenized",
    underlyingTicker: "AAPL",
    address: "0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 228.4,
  },
  {
    symbol: "MSFTon",
    name: "Microsoft Ondo Tokenized",
    underlyingTicker: "MSFT",
    address: "0x6Bfe75D1ad432050eA973C3A3DcD88F02e2444C3",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 435.2,
  },
  {
    symbol: "QQQon",
    name: "Invesco QQQ Ondo Tokenized",
    underlyingTicker: "QQQ",
    address: "0x0cdE6936d305d5B34667fC46425E852efd73559a",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 512.8,
  },
] as const;

export const BNB_VAULT_TOKENS: readonly TokenMetadata[] = [
  BNB_USDC_TOKEN,
  ...ONDO_STOCK_TOKENS,
] as const;

export function getBnbTokenBySymbol(symbol: string): TokenMetadata | undefined {
  return BNB_VAULT_TOKENS.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
}

export function getBnbTokenByAddress(address: string): TokenMetadata | undefined {
  return BNB_VAULT_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}
