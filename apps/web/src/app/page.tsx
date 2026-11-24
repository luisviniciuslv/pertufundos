"use client";

import type { LedgerEntry, PortfolioSummary, Proposal } from "@pertufundos/shared";
import { BarChart3, Coins, FileText, KeyRound, RefreshCw, UserCheck, Vote, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DepositTab } from "@/components/DepositTab";
import { GovernanceTab } from "@/components/GovernanceTab";
import { HeaderBar } from "@/components/HeaderBar";
import { KpiOverviewCards } from "@/components/KpiOverviewCards";
import { PortfolioHoldingsPanel } from "@/components/PortfolioHoldingsPanel";
import { RedemptionTab } from "@/components/RedemptionTab";
import { TaxReportTab } from "@/components/TaxReportTab";
import { fundApi } from "@/lib/api-client";
import { shortenAddress } from "@/lib/formatters";
import { useWalletAuth } from "@/lib/use-wallet-auth";

type DashboardTab = "overview" | "deposits" | "governance" | "redemptions" | "tax";

export default function DashboardPage() {
  const walletAuth = useWalletAuth();

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Estado para auto-vinculação rápida caso a carteira recém-autenticada ainda não esteja cadastrada no clube
  const [selfNickname, setSelfNickname] = useState("");
  const [registeringSelf, setRegisteringSelf] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mx-auto" />
          <p className="text-sm text-slate-400">Carregando cofre coletivo e cotações Ondo...</p>
        </div>
      </div>
    );
  }

  if (apiError || !portfolio) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 text-center space-y-4">
          <h2 className="text-lg font-bold text-white">Servidor Backend Indisponível</h2>
          <p className="text-xs text-slate-300 leading-relaxed">{apiError}</p>
          <button
            onClick={() => void loadAllData()}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const tabs: ReadonlyArray<{ id: DashboardTab; label: string; icon: typeof BarChart3 }> = [
    { id: "overview", label: "Visão Geral & Carteira", icon: BarChart3 },
    { id: "deposits", label: "Aportes & Cotistas", icon: Coins },
    {
      id: "governance",
      label: `Governança & OKX (${proposals.filter((p) => p.status !== "EXECUTED").length})`,
      icon: Vote,
    },
    { id: "redemptions", label: "Resgate & Pix (P2P.me)", icon: WalletCards },
    { id: "tax", label: "Meu Imposto de Renda", icon: FileText },
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
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {walletAuth.authError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200">
            {walletAuth.authError}
          </div>
        )}

        {/* Aviso quando a carteira está conectada mas falta a assinatura EIP-191 de login */}
        {walletAuth.isConnected && !walletAuth.isAuthenticated && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-amber-200">
              <strong>Confirme sua identidade criptográfica:</strong> sua carteira{" "}
              <code className="text-amber-100">
                {shortenAddress(walletAuth.connectedWallet ?? "")}
              </code>{" "}
              está conectada, mas você precisa assinar o desafio de login gratuito (EIP-191) para
              votar, criar propostas ou acessar seu Imposto de Renda.
            </div>
            <button
              onClick={() => void walletAuth.signInWithWallet()}
              disabled={walletAuth.isSigningIn}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-50"
            >
              <KeyRound className="h-3.5 w-3.5" />
              {walletAuth.isSigningIn ? "Assinando..." : "Assinar Login Agora"}
            </button>
          </div>
        )}

        {/* Auto-cadastro rápido quando o amigo conecta e autentica uma carteira nova */}
        {walletAuth.isAuthenticated && !authenticatedMember && (
          <form
            onSubmit={handleSelfRegister}
            className="rounded-2xl border border-emerald-500/35 bg-emerald-950/20 p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                <UserCheck className="h-4 w-4" />
                <span>Vincular sua carteira autenticada ao Clube</span>
              </div>
              <p className="text-xs text-slate-300">
                Sua carteira{" "}
                <code className="text-emerald-200">
                  {shortenAddress(walletAuth.authenticatedWallet ?? "")}
                </code>{" "}
                foi verificada! Escolha seu apelido para operar como participante:
              </p>
              {onboardingError && <p className="text-xs text-rose-300">{onboardingError}</p>}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                required
                minLength={2}
                placeholder="Seu nome / apelido"
                value={selfNickname}
                onChange={(e) => setSelfNickname(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={registeringSelf}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                {registeringSelf ? "Vinculando..." : "Entrar no Clube"}
              </button>
            </div>
          </form>
        )}

        <KpiOverviewCards portfolio={portfolio} activeMember={authenticatedMember} />

        {/* Navegação de Módulos */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <nav className="flex flex-wrap gap-2">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isCurrent = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                    isCurrent
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <button
            onClick={() => void loadAllData()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar NAV
          </button>
        </div>

        {activeTab === "overview" && (
          <PortfolioHoldingsPanel holdings={portfolio.holdings} members={portfolio.members} />
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
    </div>
  );
}
