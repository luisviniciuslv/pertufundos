import { SUPPORTED_CHAINS } from "./chains.js";

export type TokenCategory = "STABLECOIN" | "ONDO_STOCK" | "CRYPTO";

export interface TokenMetadata {
  readonly symbol: string;
  readonly name: string;
  readonly underlyingTicker?: string;
  readonly address: `0x${string}`;
  readonly chainId: number;
  readonly decimals: number;
  readonly category: TokenCategory;
  readonly logoUrl?: string;
  readonly referencePriceUsd: number; // Fallback apenas em modo demo sem chaves OKX
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
    name: "Invesco QQQ (Nasdaq-100) Ondo",
    underlyingTicker: "QQQ",
    address: "0x0cdE6936d305d5B34667fC46425E852efd73559a",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 512.8,
  },
  {
    symbol: "METAon",
    name: "Meta Platforms Ondo Tokenized",
    underlyingTicker: "META",
    address: "0xd7df5863a3e742f0c767768cdfcb63f09e0422f6",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 595.0,
  },
  {
    symbol: "TLTon",
    name: "iShares 20+ Year US Treasury ETF Ondo",
    underlyingTicker: "TLT",
    address: "0xf69e40069aC227C11459E3f4e8a446b3401616b6",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 91.2,
  },
  {
    symbol: "GLDon",
    name: "SPDR Gold Shares ETF Ondo",
    underlyingTicker: "GLD",
    address: "0xfa9a1e901085e269f6d428f79cd5252d8b919344",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "ONDO_STOCK",
    referencePriceUsd: 248.6,
  },
] as const;

export const CURATED_CRYPTO_TOKENS: readonly TokenMetadata[] = [
  {
    symbol: "BTCB",
    name: "Bitcoin (BNB Chain BTCB)",
    underlyingTicker: "BTC",
    address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 94_500.0,
  },
  {
    symbol: "ETH",
    name: "Ethereum (BNB Chain Peg)",
    underlyingTicker: "ETH",
    address: "0x2170Ed0880ac9A757fd29B218898b397959f933f",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 3_350.0,
  },
  {
    symbol: "WBNB",
    name: "Wrapped BNB",
    underlyingTicker: "BNB",
    address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 640.0,
  },
  {
    symbol: "PAXG",
    name: "PAX Gold (Ouro Físico 24/7)",
    underlyingTicker: "PAXG",
    address: "0x7950865a9140cB519342433146Ed5b40c6F210f7",
    chainId: SUPPORTED_CHAINS.BNB.id,
    decimals: 18,
    category: "CRYPTO",
    referencePriceUsd: 2_690.0,
  },
] as const;

export const CURATED_INVESTABLE_TOKENS: readonly TokenMetadata[] = [
  ...ONDO_STOCK_TOKENS,
  ...CURATED_CRYPTO_TOKENS,
] as const;

export const BNB_VAULT_TOKENS: readonly TokenMetadata[] = [
  BNB_USDC_TOKEN,
  ...CURATED_INVESTABLE_TOKENS,
] as const;

export function inferTokenCategory(symbol: string, name: string = ""): TokenCategory {
  if (symbol.toUpperCase() === "USDC" || symbol.toUpperCase() === "USDT") {
    return "STABLECOIN";
  }
  const looksLikeOndoStock =
    (symbol.length >= 4 && symbol.endsWith("on") && symbol.slice(0, -2) === symbol.slice(0, -2).toUpperCase()) ||
    name.toLowerCase().includes("ondo tokenized");
  return looksLikeOndoStock ? "ONDO_STOCK" : "CRYPTO";
}

export function getBnbTokenBySymbol(symbol: string): TokenMetadata | undefined {
  return BNB_VAULT_TOKENS.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());
}

export function getBnbTokenByAddress(address: string): TokenMetadata | undefined {
  return BNB_VAULT_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}
