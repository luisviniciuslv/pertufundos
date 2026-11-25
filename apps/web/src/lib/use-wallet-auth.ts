"use client";

import type { EvmAddress } from "@pertufundos/shared";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, type Connector } from "wagmi";
import { authTokenStore, fundApi } from "@/lib/api-client";

const MISSING_WALLET_MSG =
  "Nenhuma carteira Web3 detectada neste navegador. Para conectar pelo celular via QR Code, configure NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (grátis em cloud.reown.com) no servidor, ou use Rabby/MetaMask.";

function formatConnectError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (raw.includes("Provider not found") || raw.includes("ConnectorNotFoundError")) {
    return MISSING_WALLET_MSG;
  }
  return raw || "Falha ao conectar carteira Web3.";
}

async function resolveWorkingConnectors(connectors: readonly Connector[]): Promise<Connector[]> {
  const walletConnectConnectors = connectors.filter((c) => c.id === "walletConnect");
  const injectedCandidates = connectors.filter((c) => c.id !== "walletConnect");

  const checks = await Promise.all(
    injectedCandidates.map(async (connector) => {
      try {
        const provider = await connector.getProvider();
        return provider ? connector : null;
      } catch {
        return null;
      }
    }),
  );

  const readyExtensions = checks.filter((c): c is Connector => c !== null);
  const eip6963 = readyExtensions.filter((c) => c.id !== "injected");
  const preferredExtensions = eip6963.length > 0 ? eip6963 : readyExtensions;

  return [...preferredExtensions, ...walletConnectConnectors];
}

export interface WalletAuthState {
  readonly connectedWallet: EvmAddress | undefined;
  readonly authenticatedWallet: EvmAddress | undefined;
  readonly isConnected: boolean;
  readonly isAuthenticated: boolean;
  readonly isSigningIn: boolean;
  readonly authError: string | null;
  readonly availableConnectors: readonly Connector[];
  readonly walletConnectUri: string | null;
  readonly dismissWalletConnectUri: () => void;
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
  const [walletConnectUri, setWalletConnectUri] = useState<string | null>(null);

  const dismissWalletConnectUri = useCallback(() => {
    setWalletConnectUri(null);
  }, []);

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
      setWalletConnectUri(null);
      const target = chosenConnector ?? (await resolveWorkingConnectors(connectors))[0];
      if (!target) {
        setAuthError(MISSING_WALLET_MSG);
        return;
      }

      type WcProviderEvents = {
        on?: (event: string, listener: (uri: string) => void) => void;
        off?: (event: string, listener: (uri: string) => void) => void;
        removeListener?: (event: string, listener: (uri: string) => void) => void;
      };

      let wcProvider: WcProviderEvents | undefined;
      const onDisplayUri = (uri: string) => {
        setWalletConnectUri(uri);
      };

      if (target.id === "walletConnect") {
        try {
          wcProvider = (await target.getProvider()) as WcProviderEvents | undefined;
          wcProvider?.on?.("display_uri", onDisplayUri);
        } catch {
          // O callback onError do wagmi exibirá a falha caso ocorra
        }
      }

      const cleanupDisplayUri = () => {
        if (!wcProvider) return;
        wcProvider.off?.("display_uri", onDisplayUri);
        wcProvider.removeListener?.("display_uri", onDisplayUri);
      };

      connect(
        { connector: target },
        {
          onSuccess: () => {
            setWalletConnectUri(null);
            cleanupDisplayUri();
          },
          onError: (err) => {
            setWalletConnectUri(null);
            cleanupDisplayUri();
            setAuthError(formatConnectError(err));
          },
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
    walletConnectUri,
    dismissWalletConnectUri,
    connectWallet,
    signInWithWallet,
    signOut,
  };
}
