"use client";

import { HelpCircle } from "lucide-react";
import { useState } from "react";

interface InfoTipProps {
  text: string;
  label?: string;
}

export function InfoTip({ text, label }: InfoTipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={label ?? "Mais informações"}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-slate-400 hover:text-emerald-300 focus:outline-none transition"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] font-normal leading-relaxed text-slate-200 shadow-xl pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  );
}
