import { createConfig, http, injected } from "wagmi";
import { base, bsc } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [bsc, base],
  connectors: [injected()],
  transports: {
    [bsc.id]: http(),
    [base.id]: http(),
  },
  ssr: true,
});
