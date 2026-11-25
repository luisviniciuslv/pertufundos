"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { createWagmiConfig } from "@/lib/wagmi-config";

interface ProvidersProps {
  children: ReactNode;
  walletConnectProjectId?: string;
}

export function Providers({ children, walletConnectProjectId }: ProvidersProps) {
  const [wagmiConfig] = useState(() => createWagmiConfig(walletConnectProjectId));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
