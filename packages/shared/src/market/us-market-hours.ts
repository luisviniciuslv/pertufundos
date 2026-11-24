import type { MarketSessionStatus } from "../domain/types.js";

const NY_TIMEZONE = "America/New_York";
const BRT_TIMEZONE = "America/Sao_Paulo";

/**
 * Avalia se o pregão regular americano (NYSE / Nasdaq: Seg–Sex, 09:30 às 16:00 ET) está aberto.
 * Calcula diretamente no fuso `America/New_York` para ajustar automaticamente o horário de verão dos EUA
 * (10h30–17h00 BRT durante EDT, ou 11h30–18h00 BRT durante EST).
 */
export function getUsMarketSessionStatus(now: Date = new Date()): MarketSessionStatus {
  const nyFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = nyFormatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const minutesSinceMidnight = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30; // 09:30 ET
  const closeMinutes = 16 * 60; // 16:00 ET

  const isOpen = isWeekday && minutesSinceMidnight >= openMinutes && minutesSinceMidnight < closeMinutes;

  const currentTimeNy = new Intl.DateTimeFormat("pt-BR", {
    timeZone: NY_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  const currentTimeBrt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: BRT_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  // Calcula dinamicamente a janela equivalente no fuso de Brasília hoje (respeitando DST americano)
  const offsetHoursDiff = computeBrtMinusNyHours(now);
  const openHourBrt = 9 + offsetHoursDiff;
  const closeHourBrt = 16 + offsetHoursDiff;
  const windowDescriptionBrt = `Seg–Sex, ${String(openHourBrt).padStart(2, "0")}h30 às ${String(closeHourBrt).padStart(2, "0")}h00 (Horário de Brasília)`;

  return {
    isOpen,
    currentTimeNy,
    currentTimeBrt,
    windowDescriptionBrt,
    warningMessage: isOpen
      ? null
      : `Mercado regular dos EUA fechado agora (${currentTimeNy} NY / ${currentTimeBrt} BRT). Embora Ondo Stocks transfiram 24/7, aguarde a janela ${windowDescriptionBrt} para executar swaps com menor spread.`,
  };
}

function computeBrtMinusNyHours(date: Date): number {
  const getUtcOffsetMinutes = (timeZone: string): number => {
    const str = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).format(date);
    const match = str.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
    if (!match) return 0;
    const hours = Number(match[1]);
    const mins = Number(match[2] ?? "0");
    return hours * 60 + (hours < 0 ? -mins : mins);
  };

  const brtOffset = getUtcOffsetMinutes(BRT_TIMEZONE); // -180 (UTC-3)
  const nyOffset = getUtcOffsetMinutes(NY_TIMEZONE); // -240 (EDT) ou -300 (EST)
  return Math.round((brtOffset - nyOffset) / 60);
}
