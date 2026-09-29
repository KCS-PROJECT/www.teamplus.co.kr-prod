/**
 * [정산 센터 소비] 어드민 "정산 개요"(GET /payments/admin/settlement-overview) 응답 매퍼.
 *
 * PaymentsService.getSettlementOverview 이 자체 집계(ClassRegistration/Enrollment 직접 조회)를
 * 하지 않고, SettlementSummaryService.getTeamSummariesForTeams 가 이미 산출한 수업/대회 소계
 * (ClassSettlementSummary·TournamentSettlementSummary)를 팀별로 굴려 재가공한다.
 *
 * Dual Emit — 기존 소비처(teamplus-admin ClassSettlementTab)가 쓰던 7개 키를 alias 로 유지하고
 * canonical 키를 추가한다. 응답 키가 바뀌는 프론트 작업 없이 점진 마이그레이션한다.
 */

/** 정산 소계 공통 부분집합 — ClassSettlementSummary/TournamentSettlementSummary 양쪽이 구조적으로 만족. */
export interface SettlementOverviewSourceRow {
  teamId: string | null;
  total: number;
  paidCount: number;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  /** 확정 청구(BILLED)가 있고 전부 결제되진 않은 인원 — userId distinct. */
  outstandingMemberCount: number;
  estimatedAmount: number;
  refundedAmount: number;
}

export interface SettlementOverviewTeamMeta {
  id: string;
  name: string;
  teamCode: string | null;
}

/** 팀별 정산 개요 행 — 금액/인원 필드는 소속 classes+tournaments 소계의 합. */
export interface SettlementOverviewTeamRow {
  teamId: string;
  teamName: string;
  teamCode: string | null;
  classCount: number;
  tournamentCount: number;
  memberCount: number;
  /** @deprecated alias — memberCount 와 항상 동일. */
  studentCount: number;
  paidCount: number;
  /**
   * @deprecated memberCount − paidCount(결제 미완료 인원, 선불 pending 이탈도 포함).
   * 확정 청구 기준 미수 인원이 필요하면 canonical `outstandingMemberCount` 를 쓴다.
   */
  unpaidCount: number;
  paidAmount: number;
  outstandingAmount: number;
  /** @deprecated alias — outstandingAmount 와 항상 동일. */
  unpaidAmount: number;
  /** 확정 청구(BILLED)가 있고 전부 결제되진 않은 인원 — userId distinct(소속 classes+tournaments 합). */
  outstandingMemberCount: number;
  billedAmount: number;
  /** @deprecated alias — billedAmount 와 항상 동일. */
  totalAmount: number;
  estimatedAmount: number;
  refundedAmount: number;
  platformFee: number;
  netAmount: number;
}

/** 전체 합계 — teamId/teamName/teamCode 를 제외한 팀별 행 숫자 필드 전부의 합. */
export type SettlementOverviewTotals = Omit<
  SettlementOverviewTeamRow,
  "teamId" | "teamName" | "teamCode"
>;

export interface SettlementOverviewResponse {
  yearMonth: string;
  feeRate: number;
  totals: SettlementOverviewTotals;
  teams: SettlementOverviewTeamRow[];
}

interface RowAccumulator {
  total: number;
  paidCount: number;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  outstandingMemberCount: number;
  estimatedAmount: number;
  refundedAmount: number;
}

const EMPTY_ACCUMULATOR: RowAccumulator = {
  total: 0,
  paidCount: 0,
  billedAmount: 0,
  paidAmount: 0,
  outstandingAmount: 0,
  outstandingMemberCount: 0,
  estimatedAmount: 0,
  refundedAmount: 0,
};

/** teamId → { rowCount(=classCount|tournamentCount), 누계 } 맵을 만든다. */
function groupByTeam(
  rows: SettlementOverviewSourceRow[],
): Map<string, { rowCount: number; sum: RowAccumulator }> {
  const map = new Map<string, { rowCount: number; sum: RowAccumulator }>();
  for (const row of rows) {
    if (!row.teamId) continue; // Academy 전용 수업(teamId null)은 팀 정산 개요 대상 아님.
    const entry = map.get(row.teamId) ?? {
      rowCount: 0,
      sum: { ...EMPTY_ACCUMULATOR },
    };
    entry.rowCount += 1;
    entry.sum.total += row.total;
    entry.sum.paidCount += row.paidCount;
    entry.sum.billedAmount += row.billedAmount;
    entry.sum.paidAmount += row.paidAmount;
    entry.sum.outstandingAmount += row.outstandingAmount;
    entry.sum.outstandingMemberCount += row.outstandingMemberCount;
    entry.sum.estimatedAmount += row.estimatedAmount;
    entry.sum.refundedAmount += row.refundedAmount;
    map.set(row.teamId, entry);
  }
  return map;
}

/**
 * 정산 개요 응답 조립 — 순수 함수.
 *  · teams: 활성 팀 전수(수업/대회 소계가 없는 팀도 0행으로 유지).
 *  · classRows/tournamentRows: SettlementSummaryService.getTeamSummariesForTeams 결과의
 *    classes/tournaments 배열(활성 팀 id 배치 1회 호출 — N+1 없음).
 *  · feeRate: AppSettings.commissionRate(0.0000~1.0000).
 */
export function buildSettlementOverviewResponse(
  teams: SettlementOverviewTeamMeta[],
  classRows: SettlementOverviewSourceRow[],
  tournamentRows: SettlementOverviewSourceRow[],
  feeRate: number,
  yearMonth: string,
): SettlementOverviewResponse {
  const classByTeam = groupByTeam(classRows);
  const tournamentByTeam = groupByTeam(tournamentRows);

  const teamRows: SettlementOverviewTeamRow[] = teams.map((team) => {
    const classAgg = classByTeam.get(team.id);
    const tournamentAgg = tournamentByTeam.get(team.id);

    const memberCount =
      (classAgg?.sum.total ?? 0) + (tournamentAgg?.sum.total ?? 0);
    const paidCount =
      (classAgg?.sum.paidCount ?? 0) + (tournamentAgg?.sum.paidCount ?? 0);
    const paidAmount =
      (classAgg?.sum.paidAmount ?? 0) + (tournamentAgg?.sum.paidAmount ?? 0);
    const outstandingAmount =
      (classAgg?.sum.outstandingAmount ?? 0) +
      (tournamentAgg?.sum.outstandingAmount ?? 0);
    const outstandingMemberCount =
      (classAgg?.sum.outstandingMemberCount ?? 0) +
      (tournamentAgg?.sum.outstandingMemberCount ?? 0);
    const billedAmount =
      (classAgg?.sum.billedAmount ?? 0) +
      (tournamentAgg?.sum.billedAmount ?? 0);
    const estimatedAmount =
      (classAgg?.sum.estimatedAmount ?? 0) +
      (tournamentAgg?.sum.estimatedAmount ?? 0);
    const refundedAmount =
      (classAgg?.sum.refundedAmount ?? 0) +
      (tournamentAgg?.sum.refundedAmount ?? 0);
    const platformFee = Math.round(paidAmount * feeRate);

    return {
      teamId: team.id,
      teamName: team.name,
      teamCode: team.teamCode,
      classCount: classAgg?.rowCount ?? 0,
      tournamentCount: tournamentAgg?.rowCount ?? 0,
      memberCount,
      studentCount: memberCount,
      paidCount,
      unpaidCount: memberCount - paidCount,
      paidAmount,
      outstandingAmount,
      unpaidAmount: outstandingAmount,
      outstandingMemberCount,
      billedAmount,
      totalAmount: billedAmount,
      estimatedAmount,
      refundedAmount,
      platformFee,
      netAmount: paidAmount - platformFee,
    };
  });

  const totals = teamRows.reduce<SettlementOverviewTotals>(
    (acc, t) => ({
      classCount: acc.classCount + t.classCount,
      tournamentCount: acc.tournamentCount + t.tournamentCount,
      memberCount: acc.memberCount + t.memberCount,
      studentCount: acc.studentCount + t.studentCount,
      paidCount: acc.paidCount + t.paidCount,
      unpaidCount: acc.unpaidCount + t.unpaidCount,
      paidAmount: acc.paidAmount + t.paidAmount,
      outstandingAmount: acc.outstandingAmount + t.outstandingAmount,
      unpaidAmount: acc.unpaidAmount + t.unpaidAmount,
      outstandingMemberCount:
        acc.outstandingMemberCount + t.outstandingMemberCount,
      billedAmount: acc.billedAmount + t.billedAmount,
      totalAmount: acc.totalAmount + t.totalAmount,
      estimatedAmount: acc.estimatedAmount + t.estimatedAmount,
      refundedAmount: acc.refundedAmount + t.refundedAmount,
      platformFee: acc.platformFee + t.platformFee,
      netAmount: acc.netAmount + t.netAmount,
    }),
    {
      classCount: 0,
      tournamentCount: 0,
      memberCount: 0,
      studentCount: 0,
      paidCount: 0,
      unpaidCount: 0,
      paidAmount: 0,
      outstandingAmount: 0,
      unpaidAmount: 0,
      outstandingMemberCount: 0,
      billedAmount: 0,
      totalAmount: 0,
      estimatedAmount: 0,
      refundedAmount: 0,
      platformFee: 0,
      netAmount: 0,
    },
  );

  return { yearMonth, feeRate, totals, teams: teamRows };
}
