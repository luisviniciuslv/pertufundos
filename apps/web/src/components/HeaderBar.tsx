"use client";

import {
  buildSafeQueueUrl,
  type EvmAddress,
  type MarketSessionStatus,
  type MemberPosition,
} from "@pertufundos/shared";
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  KeyRound,
  LogOut,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { shortenAddress } from "@/lib/formatters";
import { safeMultisigClient } from "@/lib/safe-multisig.client";
import type { WalletAuthState } from "@/lib/use-wallet-auth";
import { WalletConnectQrModal } from "./WalletConnectQrModal";

interface HeaderBarProps {
  safeAddress: EvmAddress;
  primaryChainId: number;
  safeThreshold: number;
  marketSession: MarketSessionStatus;
  membersCount: number;
  authenticatedMember: MemberPosition | undefined;
  walletAuth: WalletAuthState;
  onOpenGuide: () => void;
}

export function HeaderBar({
  safeAddress,
  primaryChainId,
  safeThreshold,
  marketSession,
  membersCount,
  authenticatedMember,
  walletAuth,
  onOpenGuide,
}: HeaderBarProps) {
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copiedSafe, setCopiedSafe] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement | null>(null);
  const multipleWallets = walletAuth.availableConnectors.length > 1;
  const isDemo = safeMultisigClient.isDemoSafe(safeAddress);

  useEffect(() => {
    if (!walletMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(event.target as Node)) {
        setWalletMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWalletMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [walletMenuOpen]);

  async function handleCopySafe() {
    try {
      await navigator.clipboard.writeText(safeAddress);
      setCopiedSafe(true);
      setTimeout(() => setCopiedSafe(false), 2000);
    } catch {
      // Ignora caso clipboard não esteja disponível
    }
  }

  return (
    <header className="border-b border-slate-800/80 bg-slate-900/75 backdrop-blur-md sticky top-0 z-30">
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Pertufundos</h1>
              <span
                title={`Exige ${safeThreshold} assinaturas entre os ${Math.max(membersCount, safeThreshold)} membros do grupo para movimentar o cofre`}
                className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300 border border-slate-700"
              >
                Cofre {safeThreshold}/{Math.max(membersCount, safeThreshold)} assinaturas
              </span>
              {isDemo && (
                <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  Demo
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <a
                href={buildSafeQueueUrl(safeAddress, primaryChainId)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-emerald-400 transition"
                title="Abrir fila oficial do cofre no app.safe.global"
              >
                Cofre Safe (BNB Chain): <span className="font-mono">{shortenAddress(safeAddress)}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <button
                type="button"
                onClick={() => void handleCopySafe()}
                title="Copiar endereço completo do cofre Safe"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
              >
                {copiedSafe ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-300">Copiado</span>
                  </>
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Botão Como Funciona */}
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition"
          >
            <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
            Como funciona?
          </button>

          {/* Status do Pregão NYSE / Nasdaq */}
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
              marketSession.isOpen
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
            title={`${marketSession.windowDescriptionBrt}. Ações americanas têm spread menor com a bolsa aberta; criptomoedas funcionam 24h.`}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Bolsa EUA: <strong>{marketSession.isOpen ? "Aberta" : "Fechada"}</strong> (
              {marketSession.currentTimeBrt} BRT)
            </span>
          </div>

          {/* Identidade Web3 Soberana */}
          {!walletAuth.isConnected ? (
            <div ref={walletMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (multipleWallets) {
                    setWalletMenuOpen((open) => !open);
                  } else {
                    void walletAuth.connectWallet();
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
              >
                <Wallet className="h-3.5 w-3.5" />
                Conectar Carteira
                {multipleWallets && <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {multipleWallets && walletMenuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-slate-700 bg-slate-900 p-1.5 shadow-xl z-40">
                  <p className="px-2.5 py-1.5 text-[11px] font-medium text-slate-400">
                    Escolha como conectar sua carteira
                  </p>
                  {walletAuth.availableConnectors.map((connector) => (
                    <button
                      key={connector.uid}
                      type="button"
                      onClick={() => {
                        setWalletMenuOpen(false);
                        void walletAuth.connectWallet(connector);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-100 hover:bg-slate-800 transition"
                    >
                      <Wallet className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <span>
                        {connector.id === "walletConnect"
                          ? "Celular (QR Code WalletConnect)"
                          : connector.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : !walletAuth.isAuthenticated ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void walletAuth.signInWithWallet()}
                disabled={walletAuth.isSigningIn}
                title="Assinatura gratuita sem gás para confirmar sua identidade"
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {walletAuth.isSigningIn
                  ? "Aguardando assinatura..."
                  : `Assinar Login (${shortenAddress(walletAuth.connectedWallet ?? "")})`}
              </button>
              <button
                type="button"
                onClick={walletAuth.signOut}
                title="Desconectar carteira"
                className="rounded-lg border border-slate-700 bg-slate-800 p-1.5 text-slate-300 hover:text-white transition"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>
                  {authenticatedMember
                    ? `${authenticatedMember.nickname} (${shortenAddress(walletAuth.authenticatedWallet ?? "")})`
                    : shortenAddress(walletAuth.authenticatedWallet ?? "")}
                </span>
              </div>
              <button
                type="button"
                onClick={walletAuth.signOut}
                title="Encerrar sessão e desconectar"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      <WalletConnectQrModal
        uri={walletAuth.walletConnectUri}
        onClose={walletAuth.dismissWalletConnectUri}
      />
    </header>
  );
}
