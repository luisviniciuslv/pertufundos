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

  if (typeof window !== "undefined") {
    const cache = (globalForWagmi.__pertufundosWagmiConfigs ??= new Map());
    const existing = cache.get(projectId);
    if (existing) {
      return existing;
    }

    const config = buildWagmiConfig(projectId);
    cache.set(projectId, config);
    return config;
  }

  return buildWagmiConfig(projectId);
}

function buildWagmiConfig(projectId: string) {
  const connectors = projectId
    ? [
        injected(),
        walletConnect({
          projectId,
          showQrModal: false,
          metadata: {
            name: "Pertufundos",
            description: "Clube Web3 de Ações Tokenizadas",
            url:
              typeof window !== "undefined"
                ? window.location.origin
                : "https://pertufundos.squareweb.app",
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
