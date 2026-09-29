import { Prisma } from "@prisma/client";

/**
 * 결제→팀 귀속 단일 SoT — payments.service.ts(buildTeamScopeFilter) ·
 * settlement-summary.service.ts(getTeamTransactions) · settlement-close.service.ts
 * (월 마감 팀 귀속) 3곳이 공유한다.
 *
 * 결제자는 보호자이고 팀 소속은 자녀라, TeamMember 축(레거시 getClubPayments)은 결제를
 * 누락·오집계한다 — 수업 수강(enrollment) · 후불 청구 라인(monthlyBillingLine) · 대회
 * 참가(tournamentRegistration) 3축 중 하나라도 그 팀에 걸리면 그 팀 귀속으로 본다.
 */
export function buildPaymentTeamScopeWhere(
  teamIds: string[],
): Prisma.PaymentWhereInput {
  return {
    OR: [
      { enrollments: { some: { class: { teamId: { in: teamIds } } } } },
      {
        monthlyBillingLines: {
          some: { billing: { class: { teamId: { in: teamIds } } } },
        },
      },
      {
        tournamentRegistrations: {
          some: { tournament: { teamId: { in: teamIds } } },
        },
      },
    ],
  };
}

/** 결제 1건이 실제로 귀속되는 teamId(들)을 판별하기 위한 최소 select 모양. */
export const PAYMENT_TEAM_LINKS_SELECT = {
  enrollments: { select: { class: { select: { teamId: true } } } },
  monthlyBillingLines: {
    select: { billing: { select: { class: { select: { teamId: true } } } } },
  },
  tournamentRegistrations: {
    select: { tournament: { select: { teamId: true } } },
  },
} satisfies Prisma.PaymentSelect;

export interface PaymentTeamLinks {
  enrollments?: { class: { teamId: string | null } | null }[] | null;
  monthlyBillingLines?:
    | { billing: { class: { teamId: string | null } | null } | null }[]
    | null;
  tournamentRegistrations?:
    | { tournament: { teamId: string | null } | null }[]
    | null;
}

/**
 * 위 select 결과에서 distinct 팀 id 집합을 뽑는다 — 결제 1건이 둘 이상의 팀에 걸치는
 * 비정상 케이스를 마감 생성기가 방어적으로 감지할 때 쓴다(정상 결제는 항상 0~1개).
 */
export function resolvePaymentTeamIds(payment: PaymentTeamLinks): string[] {
  const ids = new Set<string>();
  for (const e of payment.enrollments ?? []) {
    if (e.class?.teamId) ids.add(e.class.teamId);
  }
  for (const l of payment.monthlyBillingLines ?? []) {
    if (l.billing?.class?.teamId) ids.add(l.billing.class.teamId);
  }
  for (const t of payment.tournamentRegistrations ?? []) {
    if (t.tournament?.teamId) ids.add(t.tournament.teamId);
  }
  return [...ids];
}
