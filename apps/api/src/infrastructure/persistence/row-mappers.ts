import type {
  EvmAddress,
  LedgerEntry,
  LedgerEntryType,
  Member,
  NavSnapshot,
  Proposal,
  ProposalStatus,
  ProposalType,
  ProposalVote,
  VoteDecision,
} from "@pertufundos/shared";

export interface RawMemberRow {
  id: string;
  nickname: string;
  wallet_address: string;
  base_receive_address: string;
  is_safe_owner: boolean | number;
  shares_balance: string | number;
  avg_cost_per_share_usd: string | number;
  total_deposited_usd: string | number;
  total_redeemed_usd: string | number;
  realized_gain_usd: string | number;
  created_at: string | Date;
}

export interface RawLedgerRow {
  id: string;
  member_id: string;
  member_nickname: string;
  member_wallet: string;
  type: string;
  amount_usd: string | number;
  shares_delta: string | number;
  nav_at_execution_usd: string | number;
  avg_cost_after_usd: string | number;
  realized_gain_usd: string | number;
  tx_hash: string;
  chain_id: number | string;
  created_at: string | Date;
}

export interface RawSnapshotRow {
  id: string;
  trigger_event: string;
  total_portfolio_usd: string | number;
  total_shares: string | number;
  nav_per_share_usd: string | number;
  created_at: string | Date;
}

export interface RawProposalRow {
  id: string;
  title: string;
  description: string;
  type: string;
  status: string;
  created_by_address: string;
  created_by_nickname?: string | null;
  asset_symbol: string;
  amount: string | number;
  max_slippage_percent: string | number;
  recipient_base_address: string | null;
  required_approvals: number | string;
  safe_tx_hash: string | null;
  execution_tx_hash: string | null;
  created_at: string | Date;
  expires_at: string | Date;
}

export interface RawVoteRow {
  id: string;
  proposal_id: string;
  voter_address: string;
  voter_nickname?: string | null;
  decision: string;
  comment: string | null;
  created_at: string | Date;
}

const toIso = (val: string | Date): string =>
  val instanceof Date ? val.toISOString() : new Date(val).toISOString();

export function mapMemberRow(row: RawMemberRow): Member {
  return {
    id: row.id,
    nickname: row.nickname,
    walletAddress: row.wallet_address.toLowerCase() as EvmAddress,
    baseReceiveAddress: row.base_receive_address.toLowerCase() as EvmAddress,
    isSafeOwner: Boolean(row.is_safe_owner),
    sharesBalance: Number(row.shares_balance),
    avgCostPerShareUsd: Number(row.avg_cost_per_share_usd),
    totalDepositedUsd: Number(row.total_deposited_usd),
    totalRedeemedUsd: Number(row.total_redeemed_usd),
    realizedGainUsd: Number(row.realized_gain_usd),
    createdAt: toIso(row.created_at),
  };
}

export function mapLedgerRow(row: RawLedgerRow): LedgerEntry {
  return {
    id: row.id,
    memberId: row.member_id,
    memberNickname: row.member_nickname,
    memberWallet: row.member_wallet.toLowerCase() as EvmAddress,
    type: row.type as LedgerEntryType,
    amountUsd: Number(row.amount_usd),
    sharesDelta: Number(row.shares_delta),
    navAtExecutionUsd: Number(row.nav_at_execution_usd),
    avgCostAfterUsd: Number(row.avg_cost_after_usd),
    realizedGainUsd: Number(row.realized_gain_usd),
    txHash: row.tx_hash.toLowerCase(),
    chainId: Number(row.chain_id),
    createdAt: toIso(row.created_at),
  };
}

export function mapSnapshotRow(row: RawSnapshotRow): NavSnapshot {
  return {
    id: row.id,
    triggerEvent: row.trigger_event,
    totalPortfolioUsd: Number(row.total_portfolio_usd),
    totalShares: Number(row.total_shares),
    navPerShareUsd: Number(row.nav_per_share_usd),
    createdAt: toIso(row.created_at),
  };
}

export function mapVoteRow(row: RawVoteRow): ProposalVote {
  return {
    id: row.id,
    proposalId: row.proposal_id,
    voterAddress: row.voter_address.toLowerCase() as EvmAddress,
    voterNickname: row.voter_nickname ?? row.voter_address.slice(0, 8),
    decision: row.decision as VoteDecision,
    comment: row.comment ?? undefined,
    createdAt: toIso(row.created_at),
  };
}

export function mapProposalRow(row: RawProposalRow, votes: ProposalVote[]): Proposal {
  const approvalsCount = votes.filter((v) => v.decision === "APPROVE").length;
  const rejectionsCount = votes.filter((v) => v.decision === "REJECT").length;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type as ProposalType,
    status: row.status as ProposalStatus,
    createdByAddress: row.created_by_address.toLowerCase() as EvmAddress,
    createdByNickname: row.created_by_nickname ?? row.created_by_address.slice(0, 8),
    assetSymbol: row.asset_symbol,
    amount: Number(row.amount),
    maxSlippagePercent: Number(row.max_slippage_percent),
    recipientBaseAddress: row.recipient_base_address
      ? (row.recipient_base_address.toLowerCase() as EvmAddress)
      : undefined,
    requiredApprovals: Number(row.required_approvals),
    approvalsCount,
    rejectionsCount,
    votes,
    safeTxHash: row.safe_tx_hash ?? undefined,
    executionTxHash: row.execution_tx_hash ?? undefined,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
  };
}
