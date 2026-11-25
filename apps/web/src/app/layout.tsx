import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pertufundos — Clube Web3 de Ações Tokenizadas",
  description:
    "Cofre Multisig Safe + Ondo Tokenized Stocks via OKX DEX + Saque individual em Pix via P2P.me (Base)",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <Providers walletConnectProjectId={walletConnectProjectId}>{children}</Providers>
      </body>
    </html>
  );
}
