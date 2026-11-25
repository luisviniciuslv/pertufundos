import type {
  AuthChallengeResponse,
  AuthSessionResponse,
  BaseBridgeBundle,
  CatalogAsset,
  CastVoteInput,
  ConfirmExecutionInput,
  CreateRedemptionInput,
  CreateTradeProposalInput,
  EvmAddress,
  LedgerEntry,
  LinkSafeTxInput,
  Member,
  MemberTaxSummary,
  NavSnapshot,
  PortfolioSummary,
  PrepareBaseBridgeInput,
  PreparedSafeBatch,
  Proposal,
  RecordDepositInput,
  RedemptionPlan,
  RegisterMemberInput,
  TokenMetadata,
  TrackCustomAssetInput,
} from "@pertufundos/shared";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const AUTH_STORAGE_KEY = "pertufundos_wallet_auth_v1";

export interface StoredWalletSession {
  readonly token: string;
  readonly walletAddress: EvmAddress;
  readonly expiresAt: string;
}

export const authTokenStore = {
  loadForWallet(walletAddress?: string): StoredWalletSession | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredWalletSession;
      if (!parsed.token || !parsed.walletAddress || !parsed.expiresAt) return null;
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return null;
      }
      if (walletAddress && parsed.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  save(session: StoredWalletSession): void {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  },

  clear(): void {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  },
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const activeSession = authTokenStore.loadForWallet();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(activeSession ? { Authorization: `Bearer ${activeSession.token}` } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) {
      authTokenStore.clear();
    }
    const body = await res.json().catch(() => null);
    const message =
      body?.error?.message ?? `Erro HTTP ${res.status} ao comunicar com o servidor.`;
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export const fundApi = {
  requestAuthChallenge: (walletAddress: EvmAddress) =>
    apiRequest<AuthChallengeResponse>("/auth/challenge", {
      method: "POST",
      body: JSON.stringify({ walletAddress }),
    }),

  verifyAuthSignature: (params: { walletAddress: EvmAddress; signature: `0x${string}` }) =>
    apiRequest<AuthSessionResponse>("/auth/verify", {
      method: "POST",
      body: JSON.stringify(params),
    }),

  getPortfolio: () => apiRequest<PortfolioSummary>("/portfolio"),

  getAssetsCatalog: (params?: { q?: string; category?: "ALL" | "ONDO_STOCK" | "CRYPTO" }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.category && params.category !== "ALL") qs.set("category", params.category);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiRequest<{ assets: CatalogAsset[] }>(`/assets/catalog${suffix}`);
  },

  trackCustomAsset: (input: TrackCustomAssetInput) =>
    apiRequest<{ asset: TokenMetadata }>("/assets/track", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getNavSnapshots: (limit = 20) =>
    apiRequest<{ snapshots: NavSnapshot[] }>(`/nav/snapshots?limit=${limit}`),

  registerMember: (input: RegisterMemberInput) =>
    apiRequest<{ member: Member }>("/members", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getLedger: (memberId?: string) =>
    apiRequest<{ entries: LedgerEntry[] }>(
      memberId ? `/ledger?memberId=${encodeURIComponent(memberId)}` : "/ledger",
    ),

  recordDeposit: (input: RecordDepositInput) =>
    apiRequest<{ entry: LedgerEntry; idempotentReplay: boolean }>("/deposits/record", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  prepareBaseBridge: (input: PrepareBaseBridgeInput) =>
    apiRequest<{ bridge: BaseBridgeBundle }>("/deposits/bridge-base-to-bsc", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getProposals: () => apiRequest<{ proposals: Proposal[] }>("/proposals"),

  createTradeProposal: (input: CreateTradeProposalInput) =>
    apiRequest<{ proposal: Proposal }>("/proposals/trade", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  previewRedemption: (input: CreateRedemptionInput) =>
    apiRequest<{ plan: RedemptionPlan }>("/redemptions/preview", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createRedemptionProposal: (input: CreateRedemptionInput) =>
    apiRequest<{ proposal: Proposal; plan: RedemptionPlan }>("/proposals/redemption", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  castVote: (proposalId: string, input: CastVoteInput) =>
    apiRequest<{ proposal: Proposal }>(`/proposals/${proposalId}/votes`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  prepareSafeBatch: (proposalId: string, forceOffHours = false) =>
    apiRequest<{ batch: PreparedSafeBatch }>(`/proposals/${proposalId}/prepare-safe-tx`, {
      method: "POST",
      body: JSON.stringify({ forceOffHours }),
    }),

  linkSafeTx: (proposalId: string, input: LinkSafeTxInput) =>
    apiRequest<{ proposal: Proposal }>(`/proposals/${proposalId}/link-safe-tx`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  confirmExecution: (proposalId: string, input: ConfirmExecutionInput) =>
    apiRequest<{ proposal: Proposal }>(`/proposals/${proposalId}/confirm-execution`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  getTaxSummary: (walletAddress: EvmAddress) =>
    apiRequest<{ summary: MemberTaxSummary }>(`/tax/summary/${walletAddress}`),

  async downloadMyTaxCsv(): Promise<void> {
    const activeSession = authTokenStore.loadForWallet();
    if (!activeSession) {
      throw new Error("Assine o login com sua carteira antes de exportar seu CSV fiscal.");
    }

    const res = await fetch(`${API_BASE_URL}/tax/export.csv`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${activeSession.token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? "Não foi possível exportar seu CSV de IR.");
    }

    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `irpf_pertufundos_${new Date().toISOString().slice(0, 10)}.csv`;

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};
