"use client";

import {
  BNB_USDC_TOKEN,
  buildExplorerTxUrl,
  toRawUnits,
  type EvmAddress,
  type LedgerEntry,
  type MemberPosition,
} from "@pertufundos/shared";
import { ArrowDownLeft, ExternalLink, PlusCircle, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { erc20Abi } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { fundApi } from "@/lib/api-client";
import { formatShares, formatUsd, shortenAddress } from "@/lib/formatters";
import { safeMultisigClient } from "@/lib/safe-multisig.client";

interface DepositTabProps {
  safeAddress: EvmAddress;
  navPerShareUsd: number;
  activeWallet: EvmAddress | undefined;
  members: readonly MemberPosition[];
  ledgerEntries: readonly LedgerEntry[];
  onRefresh: () => Promise<void>;
}

export function DepositTab({
  safeAddress,
  navPerShareUsd,
  activeWallet,
  ledgerEntries,
  onRefresh,
}: DepositTabProps) {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [amountUsd, setAmountUsd] = useState("500");
  const [newNickname, setNewNickname] = useState("");
  const [newWallet, setNewWallet] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = Number(amountUsd) || 0;
  const estimatedNewShares = navPerShareUsd > 0 ? parsedAmount / navPerShareUsd : 0;

  async function handleDeposit(e: FormEvent) {
    e.preventDefault();
    if (!activeWallet) {
      setError("Conecte sua carteira e assine o login gratuito no topo da página primeiro.");
      return;
    }
    setBusy(true);
    setError(null);
    setFeedback(null);

    try {
      let txHash: string;
      if (isConnected && !safeMultisigClient.isDemoSafe(safeAddress)) {
        // Transferência real ERC-20 de USDC na BNB Chain (18 decimais!) para o endereço da Safe
        const rawAmount = toRawUnits(parsedAmount, BNB_USDC_TOKEN.decimals);
        txHash = await writeContractAsync({
          address: BNB_USDC_TOKEN.address,
          abi: erc20Abi,
          functionName: "transfer",
          args: [safeAddress, rawAmount],
        });
      } else {
        // Hash determinístico simulado para testes locais
        const rand = Array.from({ length: 64 }, () =>
          Math.floor(Math.random() * 16).toString(16),
        ).join("");
        txHash = `0x${rand}`;
      }

      const res = await fundApi.recordDeposit({
        fromAddress: activeWallet,
        amountUsd: parsedAmount,
        txHash,
      });

      setFeedback(
        `Aporte registrado! +${formatShares(res.entry.sharesDelta)} cotas emitidas ao NAV de US$ ${res.entry.navAtExecutionUsd.toFixed(4)}.`,
      );
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar aporte.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterFriend(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const { member } = await fundApi.registerMember({
        nickname: newNickname,
        walletAddress: newWallet as EvmAddress,
        isSafeOwner: true,
      });
      setNewNickname("");
      setNewWallet("");
      setFeedback(`Amigo ${member.nickname} cadastrado com sucesso no fundo!`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao cadastrar participante.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Formulário de Aporte em USDC */}
        <form
          onSubmit={handleDeposit}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-white font-semibold">
            <PlusCircle className="h-5 w-5 text-emerald-400" />
            <h2>Novo Aporte em USDC (BNB Chain)</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Em produção, basta transferir USDC da sua carteira pessoal para a Safe (
            <code className="text-slate-300">{shortenAddress(safeAddress)}</code>): o{" "}
            <strong>Alchemy Address Activity Webhook</strong> detecta o depósito e emite suas cotas
            automaticamente pelo NAV vigente. Você também pode disparar a transferência por aqui:
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Valor do Aporte (USDC)
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              required
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="rounded-xl bg-slate-950/80 border border-slate-800 p-3.5 text-xs space-y-1">
            <div className="flex justify-between text-slate-400">
              <span>NAV Vigente por Cota:</span>
              <span className="font-mono text-slate-200">US$ {navPerShareUsd.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Cotas Estimadas a Emitir:</span>
              <span className="font-mono font-semibold text-emerald-400">
                +{formatShares(estimatedNewShares)} cotas
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            {busy
              ? "Processando..."
              : safeMultisigClient.isDemoSafe(safeAddress)
                ? "Simular Depósito & Emitir Cotas"
                : "Transferir USDC para a Safe"}
          </button>
        </form>

        {/* Cadastro de Novo Amigo */}
        <form
          onSubmit={handleRegisterFriend}
          className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-white font-semibold">
            <UserPlus className="h-5 w-5 text-sky-400" />
            <h2>Cadastrar Novo Amigo no Clube</h2>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Cadastre o endereço EVM de cada amigo (owner da Safe) para que o webhook da Alchemy
            reconheça automaticamente os aportes enviados por ele.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Nome / Apelido do Amigo
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Bruno"
              value={newNickname}
              onChange={(e) => setNewNickname(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Endereço da Carteira Pessoal (BNB Chain & Base)
            </label>
            <input
              type="text"
              required
              placeholder="0x..."
              value={newWallet}
              onChange={(e) => setNewWallet(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition"
          >
            Cadastrar Participante
          </button>
        </form>
      </div>

      {/* Histórico Completo do Ledger */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowDownLeft className="h-5 w-5 text-emerald-400" />
          <h3 className="text-base font-semibold text-white">
            Histórico Auditável de Cotas (Aportes e Resgates)
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase text-slate-400">
                <th className="pb-3">Data</th>
                <th className="pb-3">Membro</th>
                <th className="pb-3">Operação</th>
                <th className="pb-3 text-right">Valor (USD)</th>
                <th className="pb-3 text-right">Variação Cotas</th>
                <th className="pb-3 text-right">NAV Aplicado</th>
                <th className="pb-3 text-right">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {ledgerEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="py-3 text-xs text-slate-400">
                    {new Date(entry.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 font-medium text-white">{entry.memberNickname}</td>
                  <td className="py-3">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        entry.type === "DEPOSIT"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {entry.type === "DEPOSIT" ? "Aporte" : "Resgate"}
                    </span>
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-white">
                    {formatUsd(entry.amountUsd)}
                  </td>
                  <td
                    className={`py-3 text-right font-mono text-xs font-semibold ${
                      entry.sharesDelta >= 0 ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {entry.sharesDelta >= 0 ? "+" : ""}
                    {formatShares(entry.sharesDelta)}
                  </td>
                  <td className="py-3 text-right font-mono text-xs text-slate-300">
                    US$ {entry.navAtExecutionUsd.toFixed(4)}
                  </td>
                  <td className="py-3 text-right">
                    <a
                      href={buildExplorerTxUrl(entry.txHash, entry.chainId)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline font-mono"
                    >
                      {shortenAddress(entry.txHash)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
