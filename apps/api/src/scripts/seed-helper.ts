import type { AppContainer } from "../container.js";

/**
 * Popula dados iniciais realistas de um grupo de 5 amigos caso o banco esteja vazio,
 * permitindo testar imediatamente todas as telas (NAV, votação 3/5, resgate e CSV de IR).
 */
export async function seedDemoGroupIfEmpty(container: AppContainer): Promise<boolean> {
  const existingMembers = await container.repository.listMembers();
  if (existingMembers.length > 0) {
    return false;
  }

  const friends = [
    {
      nickname: "Vinicius",
      walletAddress: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as const,
      depositUsd: 1000,
      txHash: "0xaaaa000000000000000000000000000000000000000000000000000000000001",
    },
    {
      nickname: "Lucas",
      walletAddress: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc" as const,
      depositUsd: 750,
      txHash: "0xaaaa000000000000000000000000000000000000000000000000000000000002",
    },
    {
      nickname: "Marina",
      walletAddress: "0x90f79bf6eb2c4f870365e785982e1f101e93b906" as const,
      depositUsd: 1250,
      txHash: "0xaaaa000000000000000000000000000000000000000000000000000000000003",
    },
    {
      nickname: "Rafael",
      walletAddress: "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65" as const,
      depositUsd: 500,
      txHash: "0xaaaa000000000000000000000000000000000000000000000000000000000004",
    },
    {
      nickname: "Camila",
      walletAddress: "0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc" as const,
      depositUsd: 500,
      txHash: "0xaaaa000000000000000000000000000000000000000000000000000000000005",
    },
  ];

  for (const friend of friends) {
    await container.repository.createMember({
      nickname: friend.nickname,
      walletAddress: friend.walletAddress,
      baseReceiveAddress: friend.walletAddress,
      isSafeOwner: true,
    });

    await container.depositService.processConfirmedDeposit({
      fromAddress: friend.walletAddress,
      amountUsd: friend.depositUsd,
      txHash: friend.txHash,
      alreadyInOnChainBalance: false,
    });
  }

  // Cria e executa 2 compras históricas (NVDAon e QQQon) e deixa 1 proposta aberta em votação (AAPLon)
  const nvdaProp = await container.governanceService.createTradeProposal({
    title: "Alocação Inicial: US$ 1.200 em NVDAon",
    description: "Posição base em semicondutores/IA via Ondo Global Markets na BNB Chain.",
    type: "BUY_ASSET",
    assetSymbol: "NVDAon",
    amount: 1200,
    maxSlippagePercent: 0.5,
    createdByAddress: friends[0]!.walletAddress,
  });
  await container.governanceService.castVote(nvdaProp.id, {
    voterAddress: friends[1]!.walletAddress,
    decision: "APPROVE",
  });
  await container.governanceService.castVote(nvdaProp.id, {
    voterAddress: friends[2]!.walletAddress,
    decision: "APPROVE",
  });
  await container.governanceService.confirmProposalExecution(nvdaProp.id, {
    executionTxHash: "0xbbbb000000000000000000000000000000000000000000000000000000000001",
  });

  const qqqProp = await container.governanceService.createTradeProposal({
    title: "Índice Base: US$ 1.000 em QQQon (Nasdaq-100)",
    description: "Exposição diversificada às Big Techs americanas com dividendos reinvestidos.",
    type: "BUY_ASSET",
    assetSymbol: "QQQon",
    amount: 1000,
    maxSlippagePercent: 0.5,
    createdByAddress: friends[2]!.walletAddress,
  });
  await container.governanceService.castVote(qqqProp.id, {
    voterAddress: friends[0]!.walletAddress,
    decision: "APPROVE",
  });
  await container.governanceService.castVote(qqqProp.id, {
    voterAddress: friends[3]!.walletAddress,
    decision: "APPROVE",
  });
  await container.governanceService.confirmProposalExecution(qqqProp.id, {
    executionTxHash: "0xbbbb000000000000000000000000000000000000000000000000000000000002",
  });

  const aaplProp = await container.governanceService.createTradeProposal({
    title: "Comprar US$ 600 de AAPLon",
    description: "Aproveitar caixa em USDC para montar posição em Apple durante o pregão regular.",
    type: "BUY_ASSET",
    assetSymbol: "AAPLon",
    amount: 600,
    maxSlippagePercent: 0.5,
    createdByAddress: friends[1]!.walletAddress,
  });
  await container.governanceService.castVote(aaplProp.id, {
    voterAddress: friends[4]!.walletAddress,
    decision: "APPROVE",
    comment: "De acordo, ótimo ponto de entrada!",
  });

  return true;
}
