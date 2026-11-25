"use client";

import type { LedgerEntry, PortfolioSummary, Proposal } from "@pertufundos/shared";
import {
  BarChart3,
  Coins,
  FileText,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  Vote,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DepositTab } from "@/components/DepositTab";
import { GovernanceTab } from "@/components/GovernanceTab";
import { HeaderBar } from "@/components/HeaderBar";
import { HowItWorksModal } from "@/components/HowItWorksModal";
import { KpiOverviewCards } from "@/components/KpiOverviewCards";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { PortfolioHoldingsPanel } from "@/components/PortfolioHoldingsPanel";
import { RedemptionTab } from "@/components/RedemptionTab";
import { TaxReportTab } from "@/components/TaxReportTab";
import { fundApi } from "@/lib/api-client";
import { shortenAddress } from "@/lib/formatters";
import { safeMultisigClient } from "@/lib/safe-multisig.client";
import { useWalletAuth } from "@/lib/use-wallet-auth";

type DashboardTab = "overview" | "deposits" | "governance" | "redemptions" | "tax";

export default function DashboardPage() {
  const walletAuth = useWalletAuth();

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [guideOpen, setGuideOpen] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Estado para auto-vinculação rápida caso a carteira recém-autenticada ainda não esteja cadastrada no clube
  const [selfNickname, setSelfNickname] = useState("");
  const [registeringSelf, setRegisteringSelf] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    setRefreshing(true);
    try {
      setApiError(null);
      const [portRes, propRes, ledRes] = await Promise.all([
        fundApi.getPortfolio(),
        fundApi.getProposals(),
        fundApi.getLedger(),
      ]);
      setPortfolio(portRes);
      setProposals(propRes.proposals);
      setLedger(ledRes.entries);
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : "Não foi possível conectar ao servidor Backend (verifique se `pnpm dev:api` está rodando na porta 4000).",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  const authenticatedMember = useMemo(
    () =>
      walletAuth.authenticatedWallet
        ? portfolio?.members.find(
            (m) =>
              m.walletAddress.toLowerCase() === walletAuth.authenticatedWallet?.toLowerCase(),
          )
        : undefined,
    [portfolio, walletAuth.authenticatedWallet],
  );

  async function handleSelfRegister(e: FormEvent) {
    e.preventDefault();
    if (!walletAuth.authenticatedWallet) return;
    setRegisteringSelf(true);
    setOnboardingError(null);
    try {
      await fundApi.registerMember({
        nickname: selfNickname.trim(),
        walletAddress: walletAuth.authenticatedWallet,
        isSafeOwner: true,
      });
      setSelfNickname("");
      await loadAllData();
    } catch (err) {
      setOnboardingError(err instanceof Error ? err.message : "Falha ao vincular carteira.");
    } finally {
      setRegisteringSelf(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mx-auto" />
          <p className="text-sm font-medium text-slate-200">Abrindo o cofre coletivo...</p>
          <p className="text-xs text-slate-400">
            Consultando saldos da Safe, cotações ao vivo e quadro de cotistas
          </p>
        </div>
      </div>
    );
  }

  if (apiError || !portfolio) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-white">Servidor temporariamente indisponível</h2>
          <p className="text-xs text-slate-300 leading-relaxed">{apiError}</p>
          <button
            type="button"
            onClick={() => void loadAllData()}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const isDemoSafe = safeMultisigClient.isDemoSafe(portfolio.safeAddress);
  const pendingProposalsCount = proposals.filter(
    (p) => p.status === "OPEN" || p.status === "APPROVED" || p.status === "PROPOSED_ON_SAFE",
  ).length;

  const tabs: ReadonlyArray<{
    id: DashboardTab;
    label: string;
    subtitle: string;
    icon: typeof BarChart3;
    badge?: number;
  }> = [
    {
      id: "overview",
      label: "Visão Geral",
      subtitle: "Carteira & cotas",
      icon: BarChart3,
    },
    {
      id: "deposits",
      label: "Aportar",
      subtitle: "Pix / USDC",
      icon: Coins,
    },
    {
      id: "governance",
      label: "Votações & Trades",
      subtitle: "Decisões do grupo",
      icon: Vote,
      badge: pendingProposalsCount > 0 ? pendingProposalsCount : undefined,
    },
    {
      id: "redemptions",
      label: "Sacar (Pix)",
      subtitle: "Resgate via Base",
      icon: WalletCards,
    },
    {
      id: "tax",
      label: "Imposto de Renda",
      subtitle: "Seu CSV individual",
      icon: FileText,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <HeaderBar
        safeAddress={portfolio.safeAddress}
        primaryChainId={portfolio.primaryChainId}
        safeThreshold={portfolio.safeThreshold}
        marketSession={portfolio.marketSession}
        membersCount={portfolio.members.length}
        authenticatedMember={authenticatedMember}
        walletAuth={walletAuth}
        onOpenGuide={() => setGuideOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <OnboardingBanner
          walletAuth={walletAuth}
          authenticatedMember={authenticatedMember}
          isDemoSafe={isDemoSafe}
          safeThreshold={portfolio.safeThreshold}
          membersCount={portfolio.members.length}
          onOpenGuide={() => setGuideOpen(true)}
          onGoToDeposits={() => setActiveTab("deposits")}
          onGoToGovernance={() => setActiveTab("governance")}
        />

        {walletAuth.authError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200">
            {walletAuth.authError}
          </div>
        )}

        {/* Aviso amigável quando a carteira está conectada mas falta a assinatura gratuita de login */}
        {walletAuth.isConnected && !walletAuth.isAuthenticated && (
          <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 text-xs text-amber-100 max-w-2xl">
              <div className="font-semibold text-amber-200">
                Falta 1 clique: confirme que a carteira{" "}
                <code className="text-amber-100">
                  {shortenAddress(walletAuth.connectedWallet ?? "")}
                </code>{" "}
                é sua
              </div>
              <p className="text-amber-200/85">
                Essa assinatura é <strong>100% gratuita (não gasta taxa de rede)</strong> — ela
                funciona como uma senha segura para liberar seus votos, resgates e seu relatório de
                Imposto de Renda.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void walletAuth.signInWithWallet()}
              disabled={walletAuth.isSigningIn}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50 transition"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {walletAuth.isSigningIn ? "Aguardando carteira..." : "Assinar Login Grátis"}
            </button>
          </div>
        )}

        {/* Auto-cadastro rápido quando o amigo conecta e autentica uma carteira nova */}
        {walletAuth.isAuthenticated && !authenticatedMember && (
          <form
            onSubmit={handleSelfRegister}
            className="rounded-2xl border border-emerald-500/35 bg-emerald-950/25 p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <UserCheck className="h-4 w-4" />
                <span>Bem-vindo! Escolha seu apelido para entrar no clube</span>
              </div>
              <p className="text-xs text-slate-300">
                Carteira{" "}
                <code className="text-emerald-200">
                  {shortenAddress(walletAuth.authenticatedWallet ?? "")}
                </code>{" "}
                verificada! Como você deseja aparecer para os outros amigos no quadro de cotistas?
              </p>
              {onboardingError && <p className="text-xs text-rose-300">{onboardingError}</p>}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                minLength={2}
                placeholder="Ex: João, Marina..."
                value={selfNickname}
                onChange={(e) => setSelfNickname(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={registeringSelf}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
              >
                {registeringSelf ? "Vinculando..." : "Entrar no Clube"}
              </button>
            </div>
          </form>
        )}

        <KpiOverviewCards
          portfolio={portfolio}
          activeMember={authenticatedMember}
          isConnected={walletAuth.isConnected}
          isAuthenticated={walletAuth.isAuthenticated}
          onConnectClick={() => void walletAuth.connectWallet()}
          onSignInClick={() => void walletAuth.signInWithWallet()}
        />

        {/* Navegação de Módulos */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <nav className="flex flex-wrap gap-2" aria-label="Navegação principal do clube">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isCurrent = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex items-center gap-2.5 rounded-xl px-4 py-2 text-left transition ${
                    isCurrent
                      ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/15"
                      : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="leading-tight">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <span>{t.label}</span>
                      {t.badge !== undefined && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            isCurrent
                              ? "bg-slate-950/20 text-slate-950"
                              : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          {t.badge}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] ${
                        isCurrent ? "text-slate-900/80" : "text-slate-400"
                      }`}
                    >
                      {t.subtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          <button
            type="button"
            onClick={() => void loadAllData()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300 hover:text-white disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Atualizando..." : "Atualizar Cotações"}
          </button>
        </div>

        {activeTab === "overview" && (
          <PortfolioHoldingsPanel
            holdings={portfolio.holdings}
            members={portfolio.members}
            activeWallet={walletAuth.authenticatedWallet}
          />
        )}

        {activeTab === "deposits" && (
          <DepositTab
            safeAddress={portfolio.safeAddress}
            navPerShareUsd={portfolio.navPerShareUsd}
            activeWallet={walletAuth.authenticatedWallet}
            members={portfolio.members}
            ledgerEntries={ledger}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === "governance" && (
          <GovernanceTab
            safeAddress={portfolio.safeAddress}
            primaryChainId={portfolio.primaryChainId}
            activeWallet={walletAuth.authenticatedWallet}
            marketSession={portfolio.marketSession}
            proposals={proposals}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === "redemptions" && (
          <RedemptionTab
            activeMember={authenticatedMember}
            navPerShareUsd={portfolio.navPerShareUsd}
            onRefresh={loadAllData}
            onNavigateToGovernance={() => setActiveTab("governance")}
          />
        )}

        {activeTab === "tax" && (
          <TaxReportTab
            authenticatedWallet={walletAuth.authenticatedWallet}
            onRequestSignIn={() => void walletAuth.signInWithWallet()}
          />
        )}
      </main>

      <footer className="border-t border-slate-800/70 bg-slate-950/60 py-4 px-4 text-center text-[11px] text-slate-400">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            Nenhuma chave privada fica no servidor — apenas os membros assinam movimentações na Safe
            Multisig.
          </span>
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="text-emerald-400 hover:underline font-medium"
          >
            Dúvidas? Abrir guia passo a passo
          </button>
        </div>
      </footer>

      <HowItWorksModal
        isOpen={guideOpen}
        onClose={() => setGuideOpen(false)}
        safeThreshold={portfolio.safeThreshold}
        membersCount={portfolio.members.length}
      />
    </div>
  );
}
