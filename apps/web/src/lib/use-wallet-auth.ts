"use client";

import type { EvmAddress } from "@pertufundos/shared";
import { useCallback, useEffect, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { authTokenStore, fundApi } from "@/lib/api-client";

export interface WalletAuthState {
  readonly connectedWallet: EvmAddress | undefined;
  readonly authenticatedWallet: EvmAddress | undefined;
  readonly isConnected: boolean;
  readonly isAuthenticated: boolean;
  readonly isSigningIn: boolean;
  readonly authError: string | null;
  readonly connectWallet: () => void;
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

  const connectWallet = useCallback(() => {
    setAuthError(null);
    const injectedConnector = connectors[0];
    if (!injectedConnector) {
      setAuthError("Nenhuma extensão de carteira Web3 (Rabby / MetaMask) detectada no navegador.");
      return;
    }
    connect(
      { connector: injectedConnector },
      {
        onError: (err) => setAuthError(err.message),
      },
    );
  }, [connectors, connect]);

  const signInWithWallet = useCallback(async () => {
    if (!connectedWallet) {
      connectWallet();
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
    connectWallet,
    signInWithWallet,
    signOut,
  };
}
