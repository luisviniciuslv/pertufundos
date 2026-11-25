import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { base, bsc } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";

export function createWagmiConfig(walletConnectProjectId?: string) {
  const projectId = walletConnectProjectId?.trim();
  const connectors = projectId
    ? [
        injected(),
        walletConnect({
          projectId,
          showQrModal: true,
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
    chains: [bsc, base],
    connectors,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: {
      [bsc.id]: http(),
      [base.id]: http(),
    },
    ssr: true,
  });
}
