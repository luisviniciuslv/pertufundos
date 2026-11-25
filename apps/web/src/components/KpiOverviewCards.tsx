import type { MemberPosition, PortfolioSummary } from "@pertufundos/shared";
import { Coins, DollarSign, KeyRound, Layers, TrendingUp, Wallet } from "lucide-react";
import { InfoTip } from "@/components/InfoTip";
import { formatPercent, formatShares, formatUsd } from "@/lib/formatters";

interface KpiOverviewCardsProps {
  portfolio: PortfolioSummary;
  activeMember: MemberPosition | undefined;
  isConnected: boolean;
  isAuthenticated: boolean;
  onConnectClick: () => void;
  onSignInClick: () => void;
}

export function KpiOverviewCards({
  portfolio,
  activeMember,
  isConnected,
  isAuthenticated,
  onConnectClick,
  onSignInClick,
}: KpiOverviewCardsProps) {
  const navGrowthPercent = (portfolio.navPerShareUsd - 1) * 100;
  const liquidPercent =
    portfolio.totalPortfolioUsd > 0
      ? (portfolio.liquidUsdcBalance / portfolio.totalPortfolioUsd) * 100
      : 0;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* 1. Patrimônio Total */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/65 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5">
              Patrimônio Total do Clube
              <InfoTip text="Soma em dólar de todas as ações, criptos e caixa USDC guardados no cofre Safe Multisig do grupo." />
            </span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-white tabular-nums">
            {formatUsd(portfolio.totalPortfolioUsd)}
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Custódia compartilhada entre {portfolio.members.length}{" "}
          {portfolio.members.length === 1 ? "participante" : "participantes"}
        </p>
      </div>

      {/* 2. Valor da Cota (NAV) */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/65 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5">
              Preço da Cota Hoje (NAV)
              <InfoTip text="Valor justo de 1 cota do clube. Quem aporta hoje compra cotas por este valor — assim, novos depósitos nunca diluem o lucro de quem já entrou antes." />
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-white tabular-nums">
            US$ {portfolio.navPerShareUsd.toFixed(4)}
          </p>
        </div>
        <p
          className={`mt-2 text-xs font-medium ${
            navGrowthPercent >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {formatPercent(navGrowthPercent)} desde a cota inicial (US$ 1,00)
        </p>
      </div>

      {/* 3. Caixa Livre USDC */}
      <div className="rounded-2xl border border-slate-800/90 bg-slate-900/65 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5">
              Caixa Disponível (USDC)
              <InfoTip text="Dólares digitais livres no cofre para investir em novas propostas ou atender pedidos de resgate sem precisar vender ações." />
            </span>
            <Coins className="h-4 w-4 text-sky-400" />
          </div>
          <p className="mt-2.5 text-2xl font-bold text-white tabular-nums">
            {formatUsd(portfolio.liquidUsdcBalance)}
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {liquidPercent.toFixed(1)}% do cofre • {formatShares(portfolio.totalSharesIssued)} cotas
          emitidas
        </p>
      </div>

      {/* 4. Sua Posição Individual */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-emerald-300 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5">
              {activeMember ? `Sua Parte (${activeMember.nickname})` : "Sua Parte no Clube"}
              <InfoTip text="Quanto vale hoje a sua fatia proporcional do cofre, descontando apenas o seu próprio histórico de aportes e resgates." />
            </span>
            <Layers className="h-4 w-4 text-emerald-400" />
          </div>

          {activeMember ? (
            <>
              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <p className="text-2xl font-bold text-white tabular-nums">
                  {formatUsd(activeMember.currentValueUsd)}
                </p>
                <span
                  className={`text-xs font-semibold tabular-nums ${
                    activeMember.unrealizedGainUsd >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatPercent(activeMember.unrealizedGainPercent)}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2.5 text-lg font-bold text-slate-200">
              {isAuthenticated ? "Carteira ainda não vinculada" : "Modo Visitante"}
            </p>
          )}
        </div>

        {activeMember ? (
          <p className="mt-2 text-xs text-slate-300 tabular-nums">
            {formatShares(activeMember.sharesBalance)} cotas ({activeMember.ownershipPercent.toFixed(2)}%
            do fundo)
          </p>
        ) : !isConnected ? (
          <button
            type="button"
            onClick={onConnectClick}
            className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition"
          >
            <Wallet className="h-3.5 w-3.5" />
            Conectar carteira
          </button>
        ) : !isAuthenticated ? (
          <button
            type="button"
            onClick={onSignInClick}
            className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg bg-amber-400/20 border border-amber-400/40 px-2.5 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-400/30 transition"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Assinar login gratuito
          </button>
        ) : (
          <p className="mt-2 text-xs text-emerald-300/90">
            Escolha seu apelido no banner acima para começar
          </p>
        )}
      </div>
    </section>
  );
}
