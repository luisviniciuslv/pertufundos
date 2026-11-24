import {
  buildMemberTaxSummary,
  serializeTaxRowsToCsv,
  type EvmAddress,
  type MemberTaxSummary,
} from "@pertufundos/shared";
import { NotFoundError } from "../../domain/errors.js";
import type { IFundRepository } from "../ports/fund-repository.port.js";
import type { PortfolioValuationService } from "./portfolio-valuation.service.js";

export class TaxReportService {
  constructor(
    private readonly repository: IFundRepository,
    private readonly valuationService: PortfolioValuationService,
  ) {}

  async getMemberTaxSummary(walletAddress: EvmAddress): Promise<MemberTaxSummary> {
    const member = await this.repository.findMemberByWallet(walletAddress);
    if (!member) {
      throw new NotFoundError(`Participante ${walletAddress} não encontrado.`);
    }

    const [entries, summary] = await Promise.all([
      this.repository.listLedgerEntries(member.id),
      this.valuationService.getPortfolioSummary(),
    ]);

    return buildMemberTaxSummary({
      member,
      entries,
      currentNavUsd: summary.navPerShareUsd,
    });
  }

  async exportTaxCsv(walletAddress?: EvmAddress): Promise<{
    filename: string;
    csvContent: string;
  }> {
    const summary = await this.valuationService.getPortfolioSummary();

    if (walletAddress) {
      const report = await this.getMemberTaxSummary(walletAddress);
      return {
        filename: `irpf_pertufundos_${report.member.nickname.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
        csvContent: serializeTaxRowsToCsv(report.entries),
      };
    }

    const members = await this.repository.listMembers();
    const allEntries = await this.repository.listLedgerEntries();

    const allRows = members.flatMap((member) => {
      const memberEntries = allEntries.filter((e) => e.memberId === member.id);
      return buildMemberTaxSummary({
        member,
        entries: memberEntries,
        currentNavUsd: summary.navPerShareUsd,
      }).entries;
    });

    return {
      filename: `irpf_pertufundos_consolidado_${new Date().toISOString().slice(0, 10)}.csv`,
      csvContent: serializeTaxRowsToCsv(allRows),
    };
  }
}
