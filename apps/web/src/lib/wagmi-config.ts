import { defineChain } from "viem";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";

const bscChain = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: { decimals: 18, name: "BNB", symbol: "BNB" },
  rpcUrls: { default: { http: ["https://bsc-dataseed.binance.org"] } },
  blockExplorers: { default: { name: "BscScan", url: "https://bscscan.com" } },
});

const baseChain = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "BaseScan", url: "https://basescan.org" } },
});

const globalForWagmi = globalThis as typeof globalThis & {
  __pertufundosWagmiConfigs?: Map<string, ReturnType<typeof createConfig>>;
};

export function createWagmiConfig(walletConnectProjectId?: string) {
  const projectId = walletConnectProjectId?.trim() ?? "";
  const isBrowser = typeof window !== "undefined";
  const cacheKey = `${isBrowser ? "browser" : "ssr"}:${projectId}`;

  const cache = (globalForWagmi.__pertufundosWagmiConfigs ??= new Map());
  const existing = cache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const config = buildWagmiConfig(projectId, isBrowser);
  cache.set(cacheKey, config);
  return config;
}

function buildWagmiConfig(projectId: string, isBrowser: boolean) {
  // WalletConnect Core nunca deve inicializar durante SSR no Node.js (evita leak de listeners no servidor)
  const connectors =
    isBrowser && projectId
      ? [
          injected(),
          walletConnect({
            projectId,
            showQrModal: false,
            metadata: {
              name: "Pertufundos",
              description: "Clube Web3 de Ações Tokenizadas",
              url: window.location.origin,
              icons: [],
            },
          }),
        ]
      : [injected()];

  return createConfig({
    chains: [bscChain, baseChain],
    connectors,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: {
      [bscChain.id]: http(),
      [baseChain.id]: http(),
    },
    ssr: true,
  });
}
