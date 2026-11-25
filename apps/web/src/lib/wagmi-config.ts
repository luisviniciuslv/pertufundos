import { cookieStorage, createConfig, createStorage, http, injected } from "wagmi";
import { base, bsc } from "wagmi/chains";

export const wagmiConfig = createConfig({
  chains: [bsc, base],
  connectors: [injected()],
  storage: createStorage({
    storage: cookieStorage,
  }),
  transports: {
    [bsc.id]: http(),
    [base.id]: http(),
  },
  ssr: true,
});
