"use client";

import type { EvmAddress } from "@pertufundos/shared";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, type Connector } from "wagmi";
import { authTokenStore, fundApi } from "@/lib/api-client";

const MISSING_WALLET_MSG =
  "Nenhuma carteira Web3 detectada neste navegador. Instale a extensão Rabby Wallet ou MetaMask (no celular, abra pelo navegador interno da sua carteira).";

function formatConnectError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (raw.includes("Provider not found") || raw.includes("ConnectorNotFoundError")) {
    return MISSING_WALLET_MSG;
  }
  return raw || "Falha ao conectar carteira Web3.";
}

async function resolveWorkingConnectors(connectors: readonly Connector[]): Promise<Connector[]> {
  const checks = await Promise.all(
    connectors.map(async (connector) => {
      try {
        const provider = await connector.getProvider();
        return provider ? connector : null;
      } catch {
        return null;
      }
    }),
  );

  const ready = checks.filter((c): c is Connector => c !== null);
  const eip6963 = ready.filter((c) => c.id !== "injected");
  return eip6963.length > 0 ? eip6963 : ready;
}

export interface WalletAuthState {
  readonly connectedWallet: EvmAddress | undefined;
  readonly authenticatedWallet: EvmAddress | undefined;
  readonly isConnected: boolean;
  readonly isAuthenticated: boolean;
  readonly isSigningIn: boolean;
  readonly authError: string | null;
  readonly availableConnectors: readonly Connector[];
  readonly connectWallet: (connector?: Connector) => Promise<void>;
  readonly signInWithWallet: () => Promise<void>;
  readonly signOut: () => void;
}

export function useWalletAuth(): WalletAuthState {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const connectedWallet = address ? (address.toLowerCase() as EvmAddress) : undefined;

  const [authenticatedWallet, setAuthenticatedWallet] = useState<EvmAddress | undefined>(undefined);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [availableConnectors, setAvailableConnectors] = useState<readonly Connector[]>([]);

  useEffect(() => {
    let active = true;
    void resolveWorkingConnectors(connectors).then((ready) => {
      if (active) setAvailableConnectors(ready);
    });
    return () => {
      active = false;
    };
  }, [connectors]);

  // Sincroniza a sessão armazenada sempre que a carteira conectada mudar na extensão
  useEffect(() => {
    if (!isConnected || !connectedWallet) {
      setAuthenticatedWallet(undefined);
      return;
    }
    const stored = authTokenStore.loadForWallet(connectedWallet);
    if (stored) {
      setAuthenticatedWallet(stored.walletAddress);
    } else {
      setAuthenticatedWallet(undefined);
    }
  }, [isConnected, connectedWallet]);

  const connectWallet = useCallback(
    async (chosenConnector?: Connector) => {
      setAuthError(null);
      const target = chosenConnector ?? (await resolveWorkingConnectors(connectors))[0];
      if (!target) {
        setAuthError(MISSING_WALLET_MSG);
        return;
      }
      connect(
        { connector: target },
        {
          onError: (err) => setAuthError(formatConnectError(err)),
        },
      );
    },
    [connectors, connect],
  );

  const signInWithWallet = useCallback(async () => {
    if (!connectedWallet) {
      await connectWallet();
      return;
    }
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const challenge = await fundApi.requestAuthChallenge(connectedWallet);
      const signature = await signMessageAsync({ message: challenge.message });
      const session = await fundApi.verifyAuthSignature({
        walletAddress: connectedWallet,
        signature,
      });

      authTokenStore.save({
        token: session.token,
        walletAddress: session.walletAddress,
        expiresAt: session.expiresAt,
      });
      setAuthenticatedWallet(session.walletAddress);
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : "Assinatura cancelada ou falha na autenticação da carteira.",
      );
    } finally {
      setIsSigningIn(false);
    }
  }, [connectedWallet, connectWallet, signMessageAsync]);

  const signOut = useCallback(() => {
    authTokenStore.clear();
    setAuthenticatedWallet(undefined);
    setAuthError(null);
    disconnect();
  }, [disconnect]);

  return {
    connectedWallet,
    authenticatedWallet,
    isConnected,
    isAuthenticated: Boolean(authenticatedWallet && connectedWallet === authenticatedWallet),
    isSigningIn,
    authError,
    availableConnectors,
    connectWallet,
    signInWithWallet,
    signOut,
  };
}
