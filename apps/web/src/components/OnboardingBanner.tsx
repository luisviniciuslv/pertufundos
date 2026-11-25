"use client";

import type { MemberPosition } from "@pertufundos/shared";
import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, KeyRound, Sparkles, UserCheck, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import type { WalletAuthState } from "@/lib/use-wallet-auth";

const DISMISS_KEY = "pertufundos_welcome_collapsed_v1";

interface OnboardingBannerProps {
  walletAuth: WalletAuthState;
  authenticatedMember: MemberPosition | undefined;
  isDemoSafe: boolean;
  safeThreshold: number;
  membersCount: number;
  onOpenGuide: () => void;
  onGoToDeposits: () => void;
  onGoToGovernance: () => void;
}

export function OnboardingBanner({
  walletAuth,
  authenticatedMember,
  isDemoSafe,
  safeThreshold,
  membersCount,
  onOpenGuide,
  onGoToDeposits,
  onGoToGovernance,
}: OnboardingBannerProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DISMISS_KEY);
      if (saved === "1") setCollapsed(true);
    } catch {
      // Ignora caso localStorage esteja indisponível
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, next ? "1" : "0");
    } catch {
      // Ignora erro de storage
    }
  };

  const step1Done = walletAuth.isConnected;
  const step2Done = walletAuth.isAuthenticated;
  const step3Done = Boolean(authenticatedMember);
  const allReady = step1Done && step2Done && step3Done;

  // Quando o usuário já está autenticado e cadastrado, mostramos apenas uma barra compacta se recolhido
  if (collapsed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          <span>
            <strong>Clube de Investimentos Web3:</strong> cofre coletivo Safe ({safeThreshold}/
            {Math.max(membersCount, safeThreshold)}) para investir juntos em ações dos EUA e cripto.
          </span>
          {isDemoSafe && (
            <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-medium text-amber-300">
              Modo Simulação
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 transition"
          >
            <BookOpen className="h-3 w-3 text-emerald-400" />
            Como funciona
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition"
          >
            Expandir boas-vindas
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-emerald-950/25 p-5 sm:p-6 space-y-5 shadow-lg shadow-slate-950/40">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              <Sparkles className="h-3 w-3" />
              Cofre Coletivo entre Amigos
            </span>
            {isDemoSafe && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                Ambiente Demo (sem dinheiro real)
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white">
            Invistam juntos em Ações Americanas &amp; Cripto — sem depender do CPF de ninguém
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Todo o dinheiro fica protegido em um cofre compartilhado (<strong>Safe Multisig</strong>)
            que exige <strong>{safeThreshold} de {Math.max(membersCount, safeThreshold)}</strong>{" "}
            assinaturas para operar. Você aporta via Pix, acompanha suas cotas em tempo real e saca
            direto para o seu Pix quando quiser.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/80 px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800 transition"
          >
            <BookOpen className="h-3.5 w-3.5 text-emerald-400" />
            Entender em 1 min
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Recolher aviso de boas-vindas"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950/60 px-2.5 py-2 text-xs text-slate-400 hover:text-white transition"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            Recolher
          </button>
        </div>
      </div>

      {/* Checklist interativo de entrada */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div
          className={`rounded-xl border p-3.5 transition ${
            step1Done
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-slate-700 bg-slate-950/70"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={step1Done ? "text-emerald-300" : "text-white"}>
              1. Conectar Carteira
            </span>
            {step1Done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <Wallet className="h-4 w-4 text-slate-400" />
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {step1Done
              ? "Carteira conectada com sucesso."
              : "Use Rabby, MetaMask ou QR Code pelo celular."}
          </p>
          {!step1Done && (
            <button
              type="button"
              onClick={() => void walletAuth.connectWallet()}
              className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-emerald-400 transition"
            >
              Conectar agora
            </button>
          )}
        </div>

        <div
          className={`rounded-xl border p-3.5 transition ${
            step2Done
              ? "border-emerald-500/30 bg-emerald-500/10"
              : step1Done
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-slate-800 bg-slate-950/40 opacity-75"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={step2Done ? "text-emerald-300" : "text-white"}>
              2. Assinar Login (Grátis)
            </span>
            {step2Done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <KeyRound className="h-4 w-4 text-amber-300" />
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {step2Done
              ? "Identidade confirmada sem custo de gás."
              : "Prova que a carteira é sua (não gasta nada)."}
          </p>
          {step1Done && !step2Done && (
            <button
              type="button"
              onClick={() => void walletAuth.signInWithWallet()}
              disabled={walletAuth.isSigningIn}
              className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition"
            >
              {walletAuth.isSigningIn ? "Assinando..." : "Assinar agora"}
            </button>
          )}
        </div>

        <div
          className={`rounded-xl border p-3.5 transition ${
            step3Done
              ? "border-emerald-500/30 bg-emerald-500/10"
              : step2Done
                ? "border-sky-500/35 bg-sky-500/10"
                : "border-slate-800 bg-slate-950/40 opacity-75"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={step3Done ? "text-emerald-300" : "text-white"}>
              3. Entrar no Clube
            </span>
            {step3Done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            ) : (
              <UserCheck className="h-4 w-4 text-sky-300" />
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            {step3Done
              ? `Participando como ${authenticatedMember?.nickname}.`
              : "Escolha seu apelido para aparecer no quadro de cotistas."}
          </p>
        </div>

        <div
          className={`rounded-xl border p-3.5 transition ${
            allReady
              ? "border-slate-700 bg-slate-950/75"
              : "border-slate-800 bg-slate-950/40 opacity-75"
          }`}
        >
          <div className="flex items-center justify-between text-xs font-semibold text-white">
            <span>4. Aportar &amp; Participar</span>
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Envie USDC para ganhar cotas ou vote nas compras do grupo.
          </p>
          {allReady && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={onGoToDeposits}
                className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30 transition"
              >
                Fazer aporte
              </button>
              <button
                type="button"
                onClick={onGoToGovernance}
                className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition"
              >
                Ver votações
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
