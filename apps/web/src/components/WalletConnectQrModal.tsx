"use client";

import { Check, Copy, QrCode, Smartphone, X } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface WalletConnectQrModalProps {
  uri: string | null;
  onClose: () => void;
}

export function WalletConnectQrModal({ uri, onClose }: WalletConnectQrModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!uri) {
      setQrDataUrl(null);
      setCopied(false);
      return;
    }

    let active = true;
    void QRCode.toDataURL(uri, {
      width: 260,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [uri]);

  if (!uri) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback ignorado se clipboard não estiver disponível
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <QrCode className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Conectar pelo Celular</h2>
              <p className="text-xs text-slate-400">WalletConnect v2</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-300 leading-relaxed">
          Abra o app da <strong>Rabby</strong>, <strong>MetaMask</strong>,{" "}
          <strong>OKX Wallet</strong> ou <strong>Trust Wallet</strong> no celular, toque no leitor
          de QR Code e aponte para a tela:
        </p>

        <div className="mt-4 flex items-center justify-center rounded-xl bg-white p-3">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR Code WalletConnect" className="h-[240px] w-[240px]" />
          ) : (
            <div className="flex h-[240px] w-[240px] items-center justify-center text-xs text-slate-500">
              Gerando QR Code...
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => void handleCopy()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Link copiado!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copiar link WalletConnect
              </>
            )}
          </button>

          <a
            href={uri}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-500/25 transition"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Abrir direto no app (se estiver no celular)
          </a>
        </div>
      </div>
    </div>
  );
}
