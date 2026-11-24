import type {
  EvmAddress,
  LedgerEntry,
  LedgerEntryType,
  Member,
  NavSnapshot,
  Proposal,
  ProposalStatus,
  ProposalType,
  VoteDecision,
} from "@pertufundos/shared";

export interface CreateMemberRecord {
  nickname: string;
  walletAddress: EvmAddress;
  baseReceiveAddress: EvmAddress;
  isSafeOwner: boolean;
}

export interface RecordLedgerMutation {
  memberId: string;
  type: LedgerEntryType;
  amountUsd: number;
  sharesDelta: number;
  navAtExecutionUsd: number;
  newSharesBalance: number;
  newAvgCostUsd: number;
  realizedGainDeltaUsd: number;
  txHash: string;
  chainId: number;
}

export interface CreateProposalRecord {
  title: string;
  description: string;
  type: ProposalType;
  createdByAddress: EvmAddress;
  assetSymbol: string;
  amount: number;
  maxSlippagePercent: number;
  recipientBaseAddress?: EvmAddress;
  requiredApprovals: number;
  expiresAt: string;
}

export interface IFundRepository {
  // Members
  listMembers(): Promise<Member[]>;
  findMemberByWallet(walletAddress: EvmAddress): Promise<Member | null>;
  findMemberById(id: string): Promise<Member | null>;
  createMember(input: CreateMemberRecord): Promise<Member>;

  // Ledger & NAV
  getTotalSharesIssued(): Promise<number>;
  findLedgerEntryByTxHash(txHash: string): Promise<LedgerEntry | null>;
  listLedgerEntries(memberId?: string): Promise<LedgerEntry[]>;
  applyLedgerMutation(mutation: RecordLedgerMutation): Promise<LedgerEntry>;

  saveNavSnapshot(snapshot: Omit<NavSnapshot, "id" | "createdAt">): Promise<NavSnapshot>;
  listNavSnapshots(limit?: number): Promise<NavSnapshot[]>;

  // Governance Proposals & Votes
  createProposal(input: CreateProposalRecord): Promise<Proposal>;
  findProposalById(id: string): Promise<Proposal | null>;
  listProposals(status?: ProposalStatus): Promise<Proposal[]>;
  upsertVoteAndRefreshStatus(params: {
    proposalId: string;
    voterAddress: EvmAddress;
    decision: VoteDecision;
    comment?: string;
  }): Promise<Proposal>;
  markProposalSafeLinked(proposalId: string, safeTxHash: string): Promise<Proposal>;
  markProposalExecuted(proposalId: string, executionTxHash: string): Promise<Proposal>;

  // Lifecycle
  close(): Promise<void>;
}
