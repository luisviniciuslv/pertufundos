"use client";

import {
  buildSafeQueueUrl,
  type EvmAddress,
  type MarketSessionStatus,
  type MemberPosition,
} from "@pertufundos/shared";
import { CheckCircle2, Clock, ExternalLink, KeyRound, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { shortenAddress } from "@/lib/formatters";
import type { WalletAuthState } from "@/lib/use-wallet-auth";

interface HeaderBarProps {
  safeAddress: EvmAddress;
  primaryChainId: number;
  safeThreshold: number;
  marketSession: MarketSessionStatus;
  membersCount: number;
  authenticatedMember: MemberPosition | undefined;
  walletAuth: WalletAuthState;
}

export function HeaderBar({
  safeAddress,
  primaryChainId,
  safeThreshold,
  marketSession,
  membersCount,
  authenticatedMember,
  walletAuth,
}: HeaderBarProps) {
  return (
    <header className="border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md sticky top-0 z-30">
      <div className="mx-auto max-w-7xl px-4 py-3.5 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Pertufundos</h1>
              <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-300 border border-slate-700">
                Multisig {safeThreshold}/{Math.max(membersCount, safeThreshold)}
              </span>
            </div>
            <a
              href={buildSafeQueueUrl(safeAddress, primaryChainId)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition"
            >
              Safe BNB: {shortenAddress(safeAddress)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status do Pregão NYSE / Nasdaq */}
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
              marketSession.isOpen
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300"
            }`}
            title={marketSession.windowDescriptionBrt}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>
              NYSE/Nasdaq: <strong>{marketSession.isOpen ? "Aberto" : "Fechado"}</strong> (
              {marketSession.currentTimeBrt} BRT)
            </span>
          </div>

          {/* Identidade Web3 Soberana (Sem Impersonation) */}
          {!walletAuth.isConnected ? (
            <button
              onClick={walletAuth.connectWallet}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
            >
              <Wallet className="h-3.5 w-3.5" />
              Conectar Carteira
            </button>
          ) : !walletAuth.isAuthenticated ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void walletAuth.signInWithWallet()}
                disabled={walletAuth.isSigningIn}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition"
              >
                <KeyRound className="h-3.5 w-3.5" />
                {walletAuth.isSigningIn
                  ? "Aguardando Assinatura..."
                  : `Assinar Login (${shortenAddress(walletAuth.connectedWallet ?? "")})`}
              </button>
              <button
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
    </header>
  );
}
