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

export function createWagmiConfig(walletConnectProjectId?: string) {
  const projectId = walletConnectProjectId?.trim();
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
