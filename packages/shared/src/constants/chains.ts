export const SUPPORTED_CHAINS = {
  BNB: {
    id: 56,
    okxChainIndex: "56",
    safeShortName: "bnb",
    name: "BNB Smart Chain",
    nativeSymbol: "BNB",
    explorerBaseUrl: "https://bscscan.com",
    defaultRpcUrl: "https://bsc-dataseed.binance.org",
  },
  BASE: {
    id: 8453,
    okxChainIndex: "8453",
    safeShortName: "base",
    name: "Base",
    nativeSymbol: "ETH",
    explorerBaseUrl: "https://basescan.org",
    defaultRpcUrl: "https://mainnet.base.org",
  },
} as const;

export type SupportedChainKey = keyof typeof SUPPORTED_CHAINS;

export const P2P_ME_CONFIG = {
  appUrl: "https://app.p2p.me",
  docsUrl: "https://p2p-me.gitbook.io/p2p.me-docs/getting-started/quickstart",
  requiredChainId: SUPPORTED_CHAINS.BASE.id,
  requiredAssetSymbol: "USDC",
  notes: [
    "Conecte a MESMA carteira pessoal que recebeu o USDC na rede Base.",
    "O P2P.me converte USDC (Base) diretamente para Pix no seu próprio CPF.",
    "Novas contas possuem limite inicial por operação baseado em Reputation Points (RP); saques maiores podem ser fatiados.",
  ],
} as const;

export function buildSafeQueueUrl(safeAddress: string, chainId: number = SUPPORTED_CHAINS.BNB.id): string {
  const prefix = chainId === SUPPORTED_CHAINS.BASE.id ? SUPPORTED_CHAINS.BASE.safeShortName : SUPPORTED_CHAINS.BNB.safeShortName;
  return `https://app.safe.global/transactions/queue?safe=${prefix}:${safeAddress}`;
}

export function buildExplorerTxUrl(txHash: string, chainId: number = SUPPORTED_CHAINS.BNB.id): string {
  const base =
    chainId === SUPPORTED_CHAINS.BASE.id
      ? SUPPORTED_CHAINS.BASE.explorerBaseUrl
      : SUPPORTED_CHAINS.BNB.explorerBaseUrl;
  return `${base}/tx/${txHash}`;
}
