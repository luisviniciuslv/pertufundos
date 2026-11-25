import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pertufundos — Clube Coletivo de Ações Tokenizadas",
  description:
    "Cofre compartilhado Safe Multisig + Ações dos EUA tokenizadas (Ondo) via OKX DEX + Saque individual em Pix via P2P.me",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";
  const safeApiKey =
    process.env.NEXT_PUBLIC_SAFE_API_KEY?.trim() || process.env.SAFE_API_KEY?.trim() || "";

  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100">
        <Providers walletConnectProjectId={walletConnectProjectId} safeApiKey={safeApiKey}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
