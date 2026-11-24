import type { MemberPosition, PortfolioSummary } from "@pertufundos/shared";
import { Coins, DollarSign, Layers, TrendingUp } from "lucide-react";
import { formatPercent, formatShares, formatUsd } from "@/lib/formatters";

interface KpiOverviewCardsProps {
  portfolio: PortfolioSummary;
  activeMember: MemberPosition | undefined;
}

export function KpiOverviewCards({ portfolio, activeMember }: KpiOverviewCardsProps) {
  const navGrowthPercent = (portfolio.navPerShareUsd - 1) * 100;

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
          <span>Patrimônio Total da Safe</span>
          <DollarSign className="h-4 w-4 text-emerald-400" />
        </div>
        <p className="mt-2 text-2xl font-bold text-white">
          {formatUsd(portfolio.totalPortfolioUsd)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Custódia compartilhada sem CPF único
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
          <span>Valor Atual da Cota (NAV)</span>
          <TrendingUp className="h-4 w-4 text-emerald-400" />
        </div>
        <p className="mt-2 text-2xl font-bold text-white">
          US$ {portfolio.navPerShareUsd.toFixed(4)}
        </p>
        <p
          className={`mt-1 text-xs font-medium ${
            navGrowthPercent >= 0 ? "text-emerald-400" : "text-rose-400"
          }`}
        >
          {formatPercent(navGrowthPercent)} vs cota inicial (US$ 1,00)
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
          <span>Caixa Livre na Safe (USDC)</span>
          <Coins className="h-4 w-4 text-sky-400" />
        </div>
        <p className="mt-2 text-2xl font-bold text-white">
          {formatUsd(portfolio.liquidUsdcBalance)}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {formatShares(portfolio.totalSharesIssued)} cotas totais emitidas
        </p>
      </div>

      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-950/20 p-5">
        <div className="flex items-center justify-between text-emerald-300 text-xs font-medium">
          <span>Sua Posição ({activeMember?.nickname ?? "Visitante"})</span>
          <Layers className="h-4 w-4 text-emerald-400" />
        </div>
        <p className="mt-2 text-2xl font-bold text-white">
          {activeMember ? formatUsd(activeMember.currentValueUsd) : "US$ 0,00"}
        </p>
        <p className="mt-1 text-xs text-slate-300">
          {activeMember
            ? `${formatShares(activeMember.sharesBalance)} cotas (${activeMember.ownershipPercent.toFixed(2)}% do fundo)`
            : "Conecte e assine com sua carteira"}
        </p>
      </div>
    </section>
  );
}
