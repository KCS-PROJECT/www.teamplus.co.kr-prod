import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { RedisService } from "@/redis/redis.service";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { kstTodayUtcMidnight } from "@/common/utils/kst-date.util";
import {
  resolveSettlementYearMonth,
  resolveRowBillingTiming,
  resolvePrepaidAttribution,
  resolvePostpaidLineAttribution,
  resolveTournamentAttribution,
  instantToKstYearMonth,
  dbDateToKstYearMonth,
  SettlementBillingStatus,
} from "./attribution.util";
import { deriveSource } from "../payment-source.util";

/** 소계 결제 상태 — 취소·환불 제외한 유효 청구 기준. */
export type SubtotalPaymentStatus =
  | "NONE"
  | "UNPAID_ALL"
  | "PARTIAL_PAID"
  | "PAID_ALL";

/** 소계 정산 상태(§4). */
export type SubtotalSettlementStatus =
  | "NOT_REQUIRED"
  | "NOT_READY"
  | "DRAFT"
  | "CONFIRMED"
  | "PARTIAL_BILLED";

/** 정산 차단 사유 코드(화면 문구는 프론트 messages.ts). */
export type BlockedReasonCode =
  | "MONTH_NOT_ENDED"
  | "NO_ATTENDANCE"
  | "UNIT_PRICE_MISSING"
  | "TOURNAMENT_NOT_ENDED"
  | "BILLING_TIMING_UNASSIGNED"
  | null;

/** 수업 소계 응답 계약(팀/Academy 공통). */
export interface ClassSettlementSummary {
  classId: string;
  className: string;
  /** 소속 팀 ID — 다팀 응답 그룹/필터용(Academy 수업은 null). */
  teamId: string | null;
  /** 소속 팀명 — 다팀 응답 표시용(Academy 수업은 null). */
  teamName: string | null;
  billingMode: string;
  settlementStatus: SubtotalSettlementStatus;
  paymentStatus: SubtotalPaymentStatus;
  /** 정산 대상 인원 — userId distinct(복수 구매도 1명). */
  total: number;
  /** 결제 완료(PAID) 인원 — userId distinct. */
  paidCount: number;
  /** 유효 청구 합계(취소·환불 제외). */
  billedAmount: number;
  /** 순수납 합계. */
  paidAmount: number;
  outstandingAmount: number;
  /** 후불 미확정 월 예상액 합계(출석 × 단가). */
  estimatedAmount: number;
  /** 취소 **결제 건수**(사람 수 아님). */
  cancelledCount: number;
  /** 환불 **결제 건수**(사람 수 아님). */
  refundedCount: number;
  refundedAmount: number;
  /** 선불·후불 혼재 수업 여부(BOTH 실사용). */
  mixedBilling: boolean;
  /** 선불 대상 인원 — userId distinct(목록 "선불 N명" 표시용, 설계 §262). */
  prepaidCount: number;
  /** 후불 대상 인원 — userId distinct. */
  postpaidCount: number;
  /** 결제방식 미설정 대상 인원 — userId distinct(BOTH 상품 미배정). */
  unassignedCount: number;
  blockedReasonCode: BlockedReasonCode;
  detailPath: string;
}

/** 대회 소계 응답 계약(선불·후불 대회, 팀 API 한정). */
export interface TournamentSettlementSummary {
  tournamentId: string;
  tournamentName: string;
  /** 주최 팀 ID — 다팀 응답 그룹/필터용. */
  teamId: string | null;
  /** 주최 팀명 — 다팀 응답 표시용. */
  teamName: string | null;
  billingMode: string;
  settlementStatus: SubtotalSettlementStatus;
  paymentStatus: SubtotalPaymentStatus;
  total: number;
  paidCount: number;
  billedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  estimatedAmount: number;
  cancelledCount: number;
  refundedCount: number;
  refundedAmount: number;
  mixedBilling: boolean;
  blockedReasonCode: BlockedReasonCode;
  detailPath: string;
}

/** 미납 요약 — amount=미수금 총액, count=미납 발생 항목(수업/대회) 수. */
export interface UnpaidSummary {
  amount: number;
  count: number;
}

export interface TeamSettlementSummaryResponse {
  yearMonth: string;
  classes: ClassSettlementSummary[];
  tournaments: TournamentSettlementSummary[];
  unpaid: UnpaidSummary;
}

export interface AcademySettlementSummaryResponse {
  yearMonth: string;
  academyId: string;
  classes: ClassSettlementSummary[];
  unpaid: UnpaidSummary;
}

/** 집계 내부 행 — 순수 함수 결과를 클래스/대회 소계로 굴리기 위한 중간 표현. */
interface SettlementRow {
  userId: string;
  billingStatus: SettlementBillingStatus;
  billedAmount: number | null;
  paidAmount: number;
  refundedAmount: number;
  estimatedAmount: number | null;
  /** 혼합 판정용 결제방식 — UNASSIGNED 는 선불/후불 어느 쪽도 아님(플래그 미설정). */
  timing: "PREPAID" | "POSTPAID" | "UNASSIGNED";
}

/** 미수금 출처 종류 — 수업 또는 대회. */
export type UnpaidSourceKind = "CLASS" | "TOURNAMENT";

/**
 * 소스 귀속 정보를 얹은 행 — 소계(summarizeRows)와 인별 미수금이 **동일 배열을 공유**하기 위한 SoT.
 *  SettlementRow(금액·상태·순수납) 위에 출처(source)/귀속월/출석수를 덧붙인다. 금액·상태 재계산 금지.
 */
interface EnrichedRow extends SettlementRow {
  sourceType: UnpaidSourceKind;
  sourceId: string;
  sourceName: string;
  teamName: string | null;
  /** 미수 발생 행의 결제방식(표시용). UNASSIGNED 행은 PREPAID 로 폴백하나 미수 기여 없음. */
  billingTiming: "PREPAID" | "POSTPAID";
  /** 귀속월("YYYY-MM") — 선택월과 동일(행 attribution 결과). */
  yearMonth: string;
  /** 후불 확정 라인일 때만 출석수(선불/대회는 undefined). */
  attendanceCount?: number;
}

/** 수업 소스 행 묶음 — 소계 래핑용 메타 + 공유 행 배열(정합 SoT). */
interface ClassSourceRows {
  sourceType: "CLASS";
  sourceId: string;
  sourceName: string;
  teamId: string | null;
  teamName: string | null;
  billingMode: string;
  rows: EnrichedRow[];
  /** 소계 상태 산정용 메타(동작 보존). */
  hasUnassigned: boolean;
  anyUnitMissing: boolean;
  billingStatus: string | null;
  hasSelectedMonthBilling: boolean;
}

/** 대회 소스 행 묶음 — 소계 래핑용 메타 + 공유 행 배열(정합 SoT). */
interface TournamentSourceRows {
  sourceType: "TOURNAMENT";
  sourceId: string;
  sourceName: string;
  teamId: string | null;
  teamName: string | null;
  billingMode: string;
  rows: EnrichedRow[];
  isPostpaid: boolean;
  tournamentEnded: boolean;
}

/** 팀 인별 미수금 — 회원 1행(자녀/선수 축). */
export interface UnpaidMemberRow {
  /** 그룹핑 키 = row.userId(자녀/선수 User.id). */
  memberId: string;
  name: string;
  /** 대표 팀 = 미수 최대 source 의 teamName(다팀 회원 대응). */
  teamName: string | null;
  /** Σ_{row of member} max(0, billed − paid) — §2-0 불변식. */
  outstandingAmount: number;
  /** 이 회원 미납 출처 집합(distinct). */
  sources: UnpaidSourceKind[];
  classCount: number;
  tournamentCount: number;
}

export interface TeamUnpaidMembersResponse {
  yearMonth: string;
  members: UnpaidMemberRow[];
  /** Σ members[].outstandingAmount = summary.unpaid.amount(정합 검증용). */
  totalOutstanding: number;
  totalCount: number;
}

/** 인별 미수금 상세 — source 단위 1행. */
export interface UnpaidDetailLine {
  sourceType: UnpaidSourceKind;
  sourceId: string;
  sourceName: string;
  teamName: string | null;
  billingTiming: "PREPAID" | "POSTPAID";
  yearMonth: string;
  /** 이 source 의 이 회원 outstanding = Σ max(0, billed − paid). */
  amount: number;
  /** 후불 확정 라인일 때만. */
  attendanceCount?: number;
}

export interface UnpaidMemberDetailResponse {
  member: { id: string; name: string; totalOutstanding: number };
  parents: { id: string; name: string; phone: string | null }[];
  details: UnpaidDetailLine[];
}

export interface UnpaidReminderResult {
  sent: boolean;
  cooldown: boolean;
  recipientCount: number;
}

/** 거래 내역 행 — 결제 1건 = 1행(장부 축·완료월 귀속). */
export interface TeamTransactionItem {
  paymentId: string;
  amount: number;
  /** completed | refunded | partially_refunded | cancelled(실결제 후 취소). */
  paymentStatus: string;
  completedAt: Date;
  /** 결제자(보호자) 표시명 — 이름 비어 있으면 null. */
  payerName: string | null;
  /** 청구 대상 자녀 표시명 — 연결 없으면 null. */
  childName: string | null;
  /** 수업명 또는 대회명 — 연결 끊김 시 null. */
  subjectName: string | null;
  sourceType: "CLASS" | "TOURNAMENT" | null;
  billingTiming: "PREPAID" | "POSTPAID" | null;
}

export interface TeamTransactionsResponse {
  yearMonth: string;
  items: TeamTransactionItem[];
  /** 월 내 전체 건수 — items 는 최신순 상한(300)까지만 담는다. */
  totalCount: number;
}

interface AggregatedAmounts {
  total: number;
  paidCount: number;
  billedAmount: number;
  paidAmount: number;
  refundedAmount: number;
  estimatedAmount: number;
  outstandingAmount: number;
  cancelledCount: number;
  refundedCount: number;
  /** 행 단위 선불 존재(mixedBilling 계약용). */
  hasPrepaid: boolean;
  /** 행 단위 후불 존재(선택월 후불 성분 판정용). */
  hasPostpaid: boolean;
  /** 선수 단위 결제방식 파티션(POSTPAID>PREPAID>UNASSIGNED) — 합=total. */
  prepaidCount: number;
  postpaidCount: number;
  unassignedCount: number;
  paymentStatus: SubtotalPaymentStatus;
}

/** 로스터 등록 메타 — 선택월 멤버십 계약(Codex HIGH-1) 판정용. */
interface RosterEntry {
  registrationDate: Date | null;
  status: string;
}

/**
 * [정산 센터 Phase 2b] 팀/Academy 정산 소계 배치 집계 코어.
 *
 * ⚠️ getClassPayments(Phase 2a)를 수업별 N회 호출하지 않는다 — 그 함수는 최신 enrollment
 *   1건만 봐서 과거·복수 구매를 놓치고 N+1을 유발한다. 여기서는 수업 목록 전체의
 *   roster/enrollment/payment/billingLine/attendance 를 in-절 배치로 한 번씩 조회한 뒤,
 *   attribution.util 순수 함수로 메모리에서 월귀속·상태·순수납을 집계한다.
 */
@Injectable()
export class SettlementSummaryService {
  private readonly logger = new Logger(SettlementSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resourceAccess: ResourceAccessService,
    private readonly notificationsService: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  /** [R4] 팀 소계 — 대회 포함. teamId 지정 시 관리 팀 교집합, 비관리는 빈 결과. */
  async getTeamSettlementSummary(
    requester: JwtUserPayload,
    yearMonthRaw?: string,
    teamId?: string,
  ): Promise<TeamSettlementSummaryResponse> {
    const yearMonth = resolveSettlementYearMonth(yearMonthRaw);

    const scopeTeamIds = await this.resolveTeamScope(requester, teamId);

    if (scopeTeamIds.length === 0) {
      return {
        yearMonth,
        classes: [],
        tournaments: [],
        unpaid: { amount: 0, count: 0 },
      };
    }

    const [classRows, tournamentRows] = await Promise.all([
      this.prisma.class.findMany({
        where: { teamId: { in: scopeTeamIds } },
        select: { id: true },
      }),
      // 선불·후불 대회 모두 포함(선불 대회=정산 확정 없음, NOT_REQUIRED — Codex HIGH-2).
      this.prisma.tournament.findMany({
        where: { teamId: { in: scopeTeamIds } },
        select: { id: true },
      }),
    ]);

    const [classes, tournaments] = await Promise.all([
      this.computeClassSummaries(
        classRows.map((c) => c.id),
        yearMonth,
      ),
      this.computeTournamentSummaries(
        tournamentRows.map((t) => t.id),
        yearMonth,
      ),
    ]);

    return {
      yearMonth,
      classes,
      tournaments,
      unpaid: this.computeUnpaid([...classes, ...tournaments]),
    };
  }

  /**
   * 팀 정산 scope resolver — summary·미수금 목록·상세·remind 4메서드 단일 SoT(IDOR).
   *   · 관리자급(ADMIN/SYSTEM/OPER): teamId 지정 시 해당 팀, 미지정 시 **전체 팀**(옵셔널
   *     파라미터가 조용히 "데이터 없음" 이 되지 않도록 — Codex MED-5).
   *   · 일반 관리자(DIRECTOR/COACH): resolveManageableTeamIds 로 관리 팀 해석(일반 멤버·
   *     CoachProfile-only 유출 차단 — Codex HIGH-1). teamId 지정 시 교집합만(비관리 → 빈 결과).
   */
  private async resolveTeamScope(
    requester: JwtUserPayload,
    teamId?: string,
  ): Promise<string[]> {
    if (isAdminRole(requester.userType)) {
      if (teamId) return [teamId];
      const allTeams = await this.prisma.team.findMany({
        select: { id: true },
      });
      return allTeams.map((t) => t.id);
    }
    const managed =
      await this.resourceAccess.resolveManageableTeamIds(requester);
    return teamId ? (managed.includes(teamId) ? [teamId] : []) : managed;
  }

  /** [R5] Academy 소계 — 대회 제외. assertAcademyManager 로 인가(비관리 403). */
  async getAcademySettlementSummary(
    academyId: string,
    requester: JwtUserPayload,
    yearMonthRaw?: string,
  ): Promise<AcademySettlementSummaryResponse> {
    // 조회 인가 — director 또는 active AcademyCoach 만. 정산 확정(쓰기)은 별도 감독 전용 경로.
    await this.resourceAccess.assertAcademyManager(academyId, requester);
    const yearMonth = resolveSettlementYearMonth(yearMonthRaw);

    const classRows = await this.prisma.class.findMany({
      where: { academyId },
      select: { id: true },
    });
    const classes = await this.computeClassSummaries(
      classRows.map((c) => c.id),
      yearMonth,
    );

    return {
      yearMonth,
      academyId,
      classes,
      unpaid: this.computeUnpaid(classes),
    };
  }

  /**
   * [핵심 SoT] 수업 목록 → 소스별 귀속 행(EnrichedRow) 배치 빌더.
   *  배치 5쿼리: 수업+상품 / 등록 로스터 / 전체 enrollment+payment / 선택월 후불 확정 라인 / 선택월 출석.
   *  이후 순수 함수로 메모리 집계 — 수업 수와 무관하게 쿼리 수 고정(N+1 없음).
   *
   *  정산 대상자는 **ClassRegistration 로스터**가 SoT다(Phase 2a getClassPayments 동일).
   *  enrollment 만 훑으면 등록만 하고 미구매(선불)·상품 미배정(BOTH)한 선수가 대상에서 통째로
   *  빠진다(Codex HIGH-4) — 로스터를 배치 로드해 선수 1행으로 정규화한 뒤 구매/결제를 레이어링한다.
   *
   *  ⚠️ 소계(computeClassSummaries)와 인별 미수금(getTeamUnpaidMembers)이 **이 빌더 결과를 공유**한다.
   *   → 금액·상태 재계산 금지. §2-0 불변식(인별 합 = 소계 미수금 총액)이 코드 구조로 보장된다.
   */
  private async buildClassSourceRows(
    classIds: string[],
    yearMonth: string,
  ): Promise<ClassSourceRows[]> {
    if (classIds.length === 0) return [];

    const [selY, selM] = yearMonth.split("-").map(Number);
    // scheduledDate(@db.Date) 선택월 경계 — KST 해당 월의 UTC 자정 [gte, lt).
    const monthStart = new Date(Date.UTC(selY, selM - 1, 1));
    const monthEnd = new Date(Date.UTC(selY, selM, 1));

    const [classes, registrations, enrollments, billings, schedules] =
      await Promise.all([
        this.prisma.class.findMany({
          where: { id: { in: classIds } },
          select: {
            id: true,
            className: true,
            billingMode: true,
            teamId: true,
            team: { select: { name: true } },
            // 선택월 멤버십 계약(HIGH-1) — 종료/비활성 수업의 로스터-only 누수 차단용.
            endedAt: true,
            isActive: true,
            products: {
              select: { billingTiming: true, feePerSession: true },
            },
          },
        }),
        // 등록 로스터(대상자 SoT) — status 무관 전체 로드 후 선택월 멤버십 계약으로 판정.
        //   registrationDate/status 로 "그 달 명단" 을 산정(설계 §344·Codex HIGH-1).
        this.prisma.classRegistration.findMany({
          where: { classId: { in: classIds } },
          select: {
            classId: true,
            userId: true,
            registrationDate: true,
            status: true,
          },
        }),
        this.prisma.enrollment.findMany({
          where: { classId: { in: classIds } },
          // 최신 enrollment 결정적 선택(단가·결제방식 폴백) — Codex MED-6.
          orderBy: { updatedAt: "desc" },
          select: {
            classId: true,
            childId: true,
            status: true,
            paidAt: true,
            // open 계약(후불·미결제) 시작월 폴백 — 불변 생성 시점(미래 계약의 과거월 역류 차단, Codex Cycle4 HIGH-1).
            createdAt: true,
            product: {
              select: {
                feeType: true,
                billingTiming: true,
                billingMonth: true,
                feePerSession: true,
                price: true,
              },
            },
            payment: {
              select: {
                paymentStatus: true,
                completedAt: true,
                createdAt: true,
                amount: true,
                refundLogs: { select: { refundAmount: true } },
              },
            },
          },
        }),
        this.prisma.monthlyPostpaidBilling.findMany({
          where: { classId: { in: classIds }, yearMonth },
          select: {
            classId: true,
            status: true,
            items: {
              select: {
                userId: true,
                amount: true,
                paymentStatus: true,
                // 인별 미수금 상세의 출석수 표기용(선택월 확정 후불 라인 한정).
                attendanceCount: true,
                payment: {
                  select: {
                    paymentStatus: true,
                    refundLogs: { select: { refundAmount: true } },
                  },
                },
              },
            },
          },
        }),
        this.prisma.classSchedule.findMany({
          where: {
            classId: { in: classIds },
            scheduledDate: { gte: monthStart, lt: monthEnd },
            isCancelled: false,
          },
          select: {
            classId: true,
            attendances: {
              where: { attendanceStatus: "present" },
              select: { memberId: true },
            },
          },
        }),
      ]);

    // classId → (userId → 등록 메타). unique(classId,userId) 라 선수당 1행(distinct).
    const rosterByClass = new Map<string, Map<string, RosterEntry>>();
    for (const reg of registrations) {
      let m = rosterByClass.get(reg.classId);
      if (!m) {
        m = new Map<string, RosterEntry>();
        rosterByClass.set(reg.classId, m);
      }
      m.set(reg.userId, {
        registrationDate: reg.registrationDate ?? null,
        status: reg.status ?? "active",
      });
    }
    // classId → enrollment[] (updatedAt desc 유지)
    const enrollmentsByClass = new Map<string, typeof enrollments>();
    for (const en of enrollments) {
      const arr = enrollmentsByClass.get(en.classId);
      if (arr) arr.push(en);
      else enrollmentsByClass.set(en.classId, [en]);
    }
    // classId → billing (선택월 단일)
    const billingByClass = new Map<string, (typeof billings)[number]>();
    for (const b of billings) billingByClass.set(b.classId, b);
    // classId → (userId → present 출석수)
    const attendanceByClass = new Map<string, Map<string, number>>();
    for (const s of schedules) {
      let m = attendanceByClass.get(s.classId);
      if (!m) {
        m = new Map<string, number>();
        attendanceByClass.set(s.classId, m);
      }
      for (const a of s.attendances) {
        m.set(a.memberId, (m.get(a.memberId) ?? 0) + 1);
      }
    }

    let attributionUnknownCount = 0;
    const sources: ClassSourceRows[] = [];

    for (const cls of classes) {
      const clsEnrollments = enrollmentsByClass.get(cls.id) ?? [];
      const roster =
        rosterByClass.get(cls.id) ?? new Map<string, RosterEntry>();
      const attByUser = attendanceByClass.get(cls.id) ?? new Map<string, number>();
      const billing = billingByClass.get(cls.id);
      const rows: SettlementRow[] = [];
      // 확정 후불 라인의 userId → 출석수(인별 상세 표기용). BILLED/PAID 라인만 채워짐.
      const postpaidLineAttendanceByUser = new Map<string, number>();
      let hasUnassigned = false;
      let anyUnitMissing = false;

      // 선택월 유효 계약(결제방식·단가) — "계약 시작월 ≤ 선택월" 인 enrollment 중 updatedAt desc 최신.
      //   계약 시작월 = 결제 완료/작성월·MONTHLY_FIXED 귀속월·레거시 paidAt, open(후불·미결제)=enrollment 생성월.
      //   더 최신 계약이 선택월 이하로 존재하면 그것이 우선 → 이후 달이 과거 open 후불 계약으로
      //   되돌아가지 않는다(Codex HIGH-2: 7월 선불 이후 8월이 6월 후불로 폴백하던 결함).
      const monthEnrollmentByChild = new Map<
        string,
        (typeof clsEnrollments)[number]
      >();
      for (const en of clsEnrollments) {
        if (monthEnrollmentByChild.has(en.childId)) continue; // desc 첫 유효 = 그 달 최신
        const startM = this.resolveContractStartMonth(en);
        if (startM !== null && startM > yearMonth) continue; // 그 달엔 아직 계약 전
        monthEnrollmentByChild.set(en.childId, en);
      }

      // 후불 단가 폴백 — 전체 POSTPAID 상품이 정확히 1개이고 단가가 있을 때만(Phase 2a 계약).
      const postpaidProducts = cls.products.filter(
        (p) => p.billingTiming === "POSTPAID",
      );
      const classPostpaidUnit =
        postpaidProducts.length === 1 && postpaidProducts[0].feePerSession != null
          ? Number(postpaidProducts[0].feePerSession)
          : null;

      // 선택월 멤버십 계약(HIGH-1) — 수업 진행 여부는 오늘이 아니라 "그 달" 기준(Codex HIGH-3).
      //   endedAt 이 선택월 이후(또는 미종료)면 그 달엔 진행 중. 미종료 + 현재 비활성만 진행 아님(보수적).
      const classEndedMonth =
        cls.endedAt != null ? instantToKstYearMonth(cls.endedAt) : null;
      const classActiveForMonth =
        classEndedMonth != null
          ? classEndedMonth >= yearMonth
          : cls.isActive !== false;
      const billingUserIds = new Set<string>(
        billing?.items.map((i) => i.userId) ?? [],
      );

      // 이미 행이 생성된 선수(중복 방지) · 타월 선불 구매자(이번 달 대상 아님).
      const covered = new Set<string>();
      const prepaidOtherMonth = new Set<string>();
      // 로스터 미커버 후불 대상 후보(후불 enrollment 보유 선수 = 로스터에 없어도 대상).
      const postpaidEnrollmentUsers = new Set<string>();

      // ── 선불·미배정: 전체 enrollment(복수 구매 포함) 를 월귀속으로 필터 ──
      for (const en of clsEnrollments) {
        const timing = resolveRowBillingTiming(
          cls.billingMode,
          en.product?.billingTiming,
        );
        if (timing === "POSTPAID") {
          postpaidEnrollmentUsers.add(en.childId);
          continue; // 후불은 아래 확정라인/예상액에서 처리
        }
        if (timing === "UNASSIGNED") {
          // 미배정 플래그·행은 선택월 유효 계약 기준(아래 로스터 루프)으로만 생성한다.
          //   과거 미배정 enrollment 가 이후 달(현 계약=선불)을 영구 차단하지 않도록(Codex HIGH-1).
          continue;
        }
        const att = resolvePrepaidAttribution({
          billingTiming: timing,
          feeType: en.product?.feeType,
          billingMonth: en.product?.billingMonth,
          enrollmentStatus: en.status,
          enrollmentPaidAt: en.paidAt,
          productPrice: en.product?.price,
          payment: en.payment,
        });
        if (att.attributionUnknown) {
          // 금액이 실재하는데 귀속 근거가 없는 건만 경고(빈 UNSETTLED 는 무시).
          if (att.billedAmount != null || att.paidAmount > 0) {
            attributionUnknownCount++;
          }
          continue;
        }
        if (att.yearMonth !== yearMonth) {
          // 타월 결제 — 그 달 소계 대상. 이월형(PER_SESSION 등) 선불만 이번 달 미커버 로스터에서
          //   UNSETTLED 재추가를 억제한다. MONTHLY_FIXED 는 billingMonth 가 서비스월이라 다른 달의
          //   미구매를 가리면 안 된다 — 7월 구매가 8월 미구매(PREPAID/UNSETTLED)를 숨기던 결함(Codex Cycle4 HIGH-2).
          if (en.product?.feeType !== "MONTHLY_FIXED") {
            prepaidOtherMonth.add(en.childId);
          }
          continue;
        }
        rows.push({
          userId: en.childId,
          billingStatus: att.billingStatus,
          billedAmount: att.billedAmount,
          paidAmount: att.paidAmount,
          refundedAmount: att.refundedAmount,
          estimatedAmount: null,
          timing: "PREPAID",
        });
        covered.add(en.childId);
      }

      // ── 후불 확정 라인 우선 ──
      if (billing?.status === "confirmed") {
        for (const ln of billing.items) {
          const att = resolvePostpaidLineAttribution({
            yearMonth,
            amount: ln.amount,
            linePaymentStatus: ln.paymentStatus,
            payment: ln.payment,
          });
          rows.push({
            userId: ln.userId,
            billingStatus: att.billingStatus,
            billedAmount: att.billedAmount,
            paidAmount: att.paidAmount,
            refundedAmount: att.refundedAmount,
            estimatedAmount: null,
            timing: "POSTPAID",
          });
          postpaidLineAttendanceByUser.set(ln.userId, ln.attendanceCount ?? 0);
          covered.add(ln.userId);
        }
      }

      // ── 선택월 로스터 멤버십 계약(HIGH-1·HIGH-3) — 그 달 대상자만 정규화 ──
      //   · registrationDate 의 KST 월 > 선택월 → 제외(그 달엔 아직 등록 전)
      //   · registrationDate 의 KST 월 == 선택월 → 포함(그 달 등록·탈퇴여도 그 달 명단 보존)
      //   · 그 달 활동 증거(출석·선택월 청구라인) 있으면 포함(탈퇴/inactive 여도 보존)
      //   · 그 외 → status=active AND 그 달 수업 진행(classActiveForMonth)일 때만 포함 —
      //     종료/inactive 수업의 로스터-only 행이 무관 월로 새지 않도록(종료월 이전 달은 진행 인정).
      //   ⚠️ 한계: 정밀 탈퇴/재가입 이력은 단일 가변 ClassRegistration 행으로 복원 불가.
      //      이력 테이블은 향후 마이그레이션 과제(Codex HIGH-1·HIGH-3 명시).
      const targetUsers = new Set<string>();
      for (const [userId, entry] of roster) {
        const hasMonthActivity =
          (attByUser.get(userId) ?? 0) > 0 || billingUserIds.has(userId);
        if (
          this.isRosterMemberForMonth(
            entry.registrationDate,
            entry.status,
            yearMonth,
            classActiveForMonth,
            hasMonthActivity,
          )
        ) {
          targetUsers.add(userId);
        }
      }
      // 로스터 밖 후불 enrollment 보유자 — 그 달 활동(출석·청구라인) 있을 때만 대상.
      //   로스터에 있으나 위 계약에서 탈락한 선수는 존중(재추가 금지).
      for (const userId of postpaidEnrollmentUsers) {
        if (targetUsers.has(userId) || roster.has(userId)) continue;
        const hasMonthActivity =
          (attByUser.get(userId) ?? 0) > 0 || billingUserIds.has(userId);
        if (hasMonthActivity) targetUsers.add(userId);
      }

      for (const userId of targetUsers) {
        if (covered.has(userId)) continue;
        const en = monthEnrollmentByChild.get(userId);
        const timing = resolveRowBillingTiming(
          cls.billingMode,
          en?.product?.billingTiming,
        );
        // 타월 선불 구매자는 이 달 대상 아님 — 단, 이 달 후불 계약이 있으면 유지(전환 선수).
        if (timing !== "POSTPAID" && prepaidOtherMonth.has(userId)) continue;
        if (timing === "UNASSIGNED") {
          hasUnassigned = true;
          rows.push(this.unassignedRow(userId));
          covered.add(userId);
          continue;
        }
        if (timing === "POSTPAID") {
          if (billing?.status === "confirmed") {
            // 확정 월인데 청구 라인이 없는 등록자 — 미청구 대상(예상액 산출 안 함).
            rows.push({
              userId,
              billingStatus: "UNSETTLED",
              billedAmount: null,
              paidAmount: 0,
              refundedAmount: 0,
              estimatedAmount: null,
              timing: "POSTPAID",
            });
          } else {
            const unit =
              en?.product?.feePerSession != null
                ? Number(en.product.feePerSession)
                : classPostpaidUnit;
            if (unit == null) anyUnitMissing = true;
            const attCount = attByUser.get(userId) ?? 0;
            const est = unit != null ? attCount * unit : null;
            rows.push({
              userId,
              billingStatus: "UNSETTLED",
              billedAmount: null,
              paidAmount: 0,
              refundedAmount: 0,
              estimatedAmount: est,
              timing: "POSTPAID",
            });
          }
          covered.add(userId);
          continue;
        }
        // PREPAID — 등록만 하고 이번 달 유효 구매 없음(미구매 대상, 금액 없음).
        rows.push({
          userId,
          billingStatus: "UNSETTLED",
          billedAmount: null,
          paidAmount: 0,
          refundedAmount: 0,
          estimatedAmount: null,
          timing: "PREPAID",
        });
        covered.add(userId);
      }

      // 소스 귀속 정보를 얹은 공유 행(EnrichedRow) — 소계·인별 미수금이 이 배열을 공유한다.
      //   금액·상태 재계산 없이 source/귀속월/출석수만 덧붙인다.
      const enrichedRows: EnrichedRow[] = rows.map((r) => ({
        ...r,
        sourceType: "CLASS" as const,
        sourceId: cls.id,
        sourceName: cls.className,
        teamName: cls.team?.name ?? null,
        billingTiming:
          r.timing === "POSTPAID" ? ("POSTPAID" as const) : ("PREPAID" as const),
        yearMonth,
        attendanceCount:
          r.timing === "POSTPAID"
            ? postpaidLineAttendanceByUser.get(r.userId)
            : undefined,
      }));

      sources.push({
        sourceType: "CLASS",
        sourceId: cls.id,
        sourceName: cls.className,
        teamId: cls.teamId ?? null,
        teamName: cls.team?.name ?? null,
        billingMode: cls.billingMode ?? "PREPAID",
        rows: enrichedRows,
        hasUnassigned,
        anyUnitMissing,
        billingStatus: billing?.status ?? null,
        hasSelectedMonthBilling: billing != null,
      });
    }

    if (attributionUnknownCount > 0) {
      this.logger.warn(
        `[정산 소계] 월귀속 근거 없는 결제 ${attributionUnknownCount}건 — 집계 제외(현재월 임의 귀속 안 함). yearMonth=${yearMonth}`,
      );
    }

    return sources;
  }

  /**
   * 수업 소계 — 공통 빌더(buildClassSourceRows) 결과에 summarizeRows + status 래핑.
   *  동작 100% 불변(팀 허브·Academy 소계 회귀 0) — 빌더가 만든 공유 행에서 집계만 수행.
   */
  private async computeClassSummaries(
    classIds: string[],
    yearMonth: string,
  ): Promise<ClassSettlementSummary[]> {
    const sources = await this.buildClassSourceRows(classIds, yearMonth);
    const currentYm = resolveSettlementYearMonth();
    const monthEnded = yearMonth < currentYm; // "YYYY-MM" 문자열 비교 = 월 순서.
    const result: ClassSettlementSummary[] = [];

    for (const src of sources) {
      const agg = this.summarizeRows(src.rows);

      // 선택월 후불 성분 = 후불 수업 OR 선택월 청구(확정/작성) 존재 OR 선택월 후불 행 존재.
      const hasSelectedMonthBilling = src.hasSelectedMonthBilling;
      const hasPostpaidComponent =
        src.billingMode === "POSTPAID" ||
        hasSelectedMonthBilling ||
        agg.hasPostpaid;

      // 당월 대상·청구 없는 수업은 소계에서 제외(노이즈 방지) — 무관 월 로스터-only 누수 차단.
      if (agg.total === 0 && !hasSelectedMonthBilling) continue;

      // settlementStatus
      let settlementStatus: SubtotalSettlementStatus;
      if (!hasPostpaidComponent) {
        settlementStatus = "NOT_REQUIRED";
      } else if (src.billingStatus === "confirmed") {
        // 혼합(BOTH) 이어도 후불 부분집합이 확정이면 CONFIRMED — PARTIAL_BILLED 는
        //   대회 선택 청구 전용(설계 §202,219). 혼합 신호는 mixedBilling 이 전달(Codex MED-7).
        settlementStatus = "CONFIRMED";
      } else if (src.billingStatus === "draft") {
        settlementStatus = "DRAFT";
      } else {
        settlementStatus = "NOT_READY";
      }

      // blockedReasonCode — 미배정 설정 문제를 최우선 노출(Codex MED-3), 그 다음 후불 미확정 사유.
      let blockedReasonCode: BlockedReasonCode = null;
      if (src.hasUnassigned) {
        blockedReasonCode = "BILLING_TIMING_UNASSIGNED";
      } else if (hasPostpaidComponent && src.billingStatus !== "confirmed") {
        if (!monthEnded) {
          blockedReasonCode = "MONTH_NOT_ENDED";
        } else if (src.anyUnitMissing) {
          blockedReasonCode = "UNIT_PRICE_MISSING";
        } else if (agg.estimatedAmount === 0) {
          blockedReasonCode = "NO_ATTENDANCE";
        }
      }

      result.push({
        classId: src.sourceId,
        className: src.sourceName,
        teamId: src.teamId,
        teamName: src.teamName,
        billingMode: src.billingMode,
        settlementStatus,
        paymentStatus: agg.paymentStatus,
        total: agg.total,
        paidCount: agg.paidCount,
        billedAmount: agg.billedAmount,
        paidAmount: agg.paidAmount,
        outstandingAmount: agg.outstandingAmount,
        estimatedAmount: agg.estimatedAmount,
        cancelledCount: agg.cancelledCount,
        refundedCount: agg.refundedCount,
        refundedAmount: agg.refundedAmount,
        mixedBilling: agg.hasPrepaid && agg.hasPostpaid,
        prepaidCount: agg.prepaidCount,
        postpaidCount: agg.postpaidCount,
        unassignedCount: agg.unassignedCount,
        blockedReasonCode,
        detailPath: `/classes/${src.sourceId}/students?yearMonth=${yearMonth}`,
      });
    }

    return result;
  }

  /**
   * [핵심 SoT] 대회 목록 → 소스별 귀속 행(EnrichedRow) 배치 빌더(팀 API 전용).
   *  배치 1쿼리(대회+참가+연결 Payment). **선불·후불 대회 모두 포함**(Codex HIGH-2).
   *  소계·인별 미수금이 이 결과를 공유(§2-0 불변식). 당월 활동 없는 대회(rows 0)는 제외.
   */
  private async buildTournamentSourceRows(
    tournamentIds: string[],
    yearMonth: string,
  ): Promise<TournamentSourceRows[]> {
    if (tournamentIds.length === 0) return [];

    const todayUtcMidnight = kstTodayUtcMidnight();

    const tournaments = await this.prisma.tournament.findMany({
      where: { id: { in: tournamentIds } },
      select: {
        id: true,
        name: true,
        billingMode: true,
        endDate: true,
        teamId: true,
        team: { select: { name: true } },
        registrations: {
          select: {
            userId: true,
            childId: true,
            paymentStatus: true,
            calculatedFee: true,
            payment: {
              select: {
                paymentStatus: true,
                completedAt: true,
                createdAt: true,
                refundLogs: { select: { refundAmount: true } },
              },
            },
          },
        },
      },
    });

    let attributionUnknownCount = 0;
    const sources: TournamentSourceRows[] = [];

    for (const t of tournaments) {
      const isPostpaid = t.billingMode === "POSTPAID";
      const billingTiming = isPostpaid
        ? ("POSTPAID" as const)
        : ("PREPAID" as const);
      const rows: EnrichedRow[] = [];
      for (const reg of t.registrations) {
        const att = resolveTournamentAttribution({
          registrationPaymentStatus: reg.paymentStatus,
          amount: Number(reg.calculatedFee),
          endDate: t.endDate,
          payment: reg.payment,
          tournamentBillingMode: t.billingMode,
        });
        if (att.attributionUnknown) {
          attributionUnknownCount++;
          continue;
        }
        if (att.yearMonth !== yearMonth) continue;
        rows.push({
          // 청구 대상 = 자녀(childId) 우선, 없으면 신청자.
          userId: reg.childId ?? reg.userId,
          billingStatus: att.billingStatus,
          billedAmount: att.billedAmount,
          paidAmount: att.paidAmount,
          refundedAmount: att.refundedAmount,
          estimatedAmount: att.estimatedAmount,
          timing: "POSTPAID",
          sourceType: "TOURNAMENT",
          sourceId: t.id,
          sourceName: t.name,
          teamName: t.team?.name ?? null,
          billingTiming,
          yearMonth,
        });
      }

      if (rows.length === 0) continue; // 당월 활동 없는 대회 제외

      const tournamentEnded =
        t.endDate != null && t.endDate.getTime() < todayUtcMidnight.getTime();

      sources.push({
        sourceType: "TOURNAMENT",
        sourceId: t.id,
        sourceName: t.name,
        teamId: t.teamId ?? null,
        teamName: t.team?.name ?? null,
        billingMode: t.billingMode,
        rows,
        isPostpaid,
        tournamentEnded,
      });
    }

    if (attributionUnknownCount > 0) {
      this.logger.warn(
        `[정산 소계] 대회 월귀속 근거 없는 참가 ${attributionUnknownCount}건 — 집계 제외. yearMonth=${yearMonth}`,
      );
    }

    return sources;
  }

  /**
   * 대회 소계 — 공통 빌더(buildTournamentSourceRows) 결과에 summarizeRows + status 래핑.
   *  동작 100% 불변(팀 허브 회귀 0): 후불=정산 확정 상태, 선불=NOT_REQUIRED.
   */
  private async computeTournamentSummaries(
    tournamentIds: string[],
    yearMonth: string,
  ): Promise<TournamentSettlementSummary[]> {
    const sources = await this.buildTournamentSourceRows(
      tournamentIds,
      yearMonth,
    );
    const result: TournamentSettlementSummary[] = [];

    for (const src of sources) {
      const agg = this.summarizeRows(src.rows);

      let settlementStatus: SubtotalSettlementStatus;
      let blockedReasonCode: BlockedReasonCode = null;
      if (!src.isPostpaid) {
        // 선불 대회 — 정산 확정 단계 없음.
        settlementStatus = "NOT_REQUIRED";
      } else {
        const settledCount = src.rows.filter(
          (r) => r.billingStatus !== "UNSETTLED",
        ).length;
        if (settledCount === 0) settlementStatus = "NOT_READY";
        else if (settledCount === src.rows.length)
          settlementStatus = "CONFIRMED";
        else settlementStatus = "PARTIAL_BILLED";

        // 종료 전 후불 대회는 정산 불가 — 대회 전용 사유 코드(Codex MED-9).
        if (settledCount === 0 && !src.tournamentEnded) {
          blockedReasonCode = "TOURNAMENT_NOT_ENDED";
        }
      }

      result.push({
        tournamentId: src.sourceId,
        tournamentName: src.sourceName,
        teamId: src.teamId,
        teamName: src.teamName,
        billingMode: src.billingMode,
        settlementStatus,
        paymentStatus: agg.paymentStatus,
        total: agg.total,
        paidCount: agg.paidCount,
        billedAmount: agg.billedAmount,
        paidAmount: agg.paidAmount,
        outstandingAmount: agg.outstandingAmount,
        estimatedAmount: agg.estimatedAmount,
        cancelledCount: agg.cancelledCount,
        refundedCount: agg.refundedCount,
        refundedAmount: agg.refundedAmount,
        mixedBilling: false, // 대회는 단일 결제방식
        blockedReasonCode,
        detailPath: `/tournaments/${src.sourceId}#settlement`,
      });
    }

    return result;
  }

  /**
   * 계약 시작월("YYYY-MM"). open 계약(후불/미결제)은 enrollment 생성월(createdAt), 모든 신호 부재 시에만 null.
   *  선택월 유효 계약 판정용(계약 시작월 ≤ 선택월). "거래 귀속월"(resolvePrepaidAttribution)과 분리한다
   *  — open 후불 계약이 이후 달로 폴백하지 않도록(Codex HIGH-2).
   *  MONTHLY_FIXED+billingMonth → 그 달 / 완료·pending payment → 그 월 /
   *  레거시 paidAt → 그 월(Codex HIGH-2 regression 3) / 그 외(후불·미결제) → null.
   *  KST 변환은 attribution.util 재사용(이중 시프트 방지).
   */
  private resolveContractStartMonth(en: {
    product?: { feeType?: string | null; billingMonth?: Date | null } | null;
    paidAt?: Date | null;
    createdAt?: Date | null;
    payment?: {
      paymentStatus?: string | null;
      completedAt?: Date | null;
      createdAt?: Date | null;
    } | null;
  }): string | null {
    const p = en.product;
    const pay = en.payment;
    if (p?.feeType === "MONTHLY_FIXED" && p?.billingMonth != null) {
      return dbDateToKstYearMonth(p.billingMonth);
    }
    if (pay?.completedAt != null) return instantToKstYearMonth(pay.completedAt);
    if (pay?.paymentStatus === "pending" && pay?.createdAt != null) {
      return instantToKstYearMonth(pay.createdAt);
    }
    if (en.paidAt != null) return instantToKstYearMonth(en.paidAt);
    // open 계약(후불·미결제·미배정)도 timeless baseline 이 아니라 enrollment 생성 시점부터 유효.
    //   → 미래 open 계약이 과거 모든 달의 유효 계약으로 역류하지 않도록(Codex Cycle4 HIGH-1).
    if (en.createdAt != null) return instantToKstYearMonth(en.createdAt);
    return null;
  }

  /**
   * 선택월 로스터 멤버십 계약(Codex HIGH-1·HIGH-3) — 이 선수가 선택월 정산 대상 명단인가.
   *  · registrationDate 의 KST 월 > 선택월 → false(그 달엔 아직 등록 전, 이중 시프트 방지)
   *  · registrationDate 의 KST 월 == 선택월 → true(그 달 등록 = 그 달 명단, 이후 탈퇴여도 보존)
   *  · 그 달 활동 증거(출석·선택월 청구라인) → true(탈퇴/inactive 여도 그 달 명단 보존)
   *  · 그 외 → status=active AND 그 달 수업 진행 중(classActiveForMonth)일 때만 true.
   *  ⚠️ 한계: 정밀 탈퇴/재가입 이력은 단일 가변 ClassRegistration 행으로 복원 불가 — 향후 이력 테이블 과제.
   */
  private isRosterMemberForMonth(
    registrationDate: Date | null,
    status: string,
    selectedYearMonth: string,
    classActiveForMonth: boolean,
    hasMonthActivity: boolean,
  ): boolean {
    const regMonth =
      registrationDate != null
        ? instantToKstYearMonth(registrationDate)
        : null;
    if (regMonth != null && regMonth > selectedYearMonth) return false;
    if (regMonth === selectedYearMonth) return true;
    if (hasMonthActivity) return true;
    return status === "active" && classActiveForMonth;
  }

  /** 등록만 하고 결제방식 미배정(BOTH 상품 없음) 대상 행 — 금액 제외·인원만 반영. */
  private unassignedRow(userId: string): SettlementRow {
    return {
      userId,
      billingStatus: "UNSETTLED",
      billedAmount: null,
      paidAmount: 0,
      refundedAmount: 0,
      estimatedAmount: null,
      timing: "UNASSIGNED",
    };
  }

  /**
   * 행 배열 → 소계 금액·인원·상태. 인원=userId distinct, 취소/환불 count=결제 건수.
   *  outstandingAmount 는 **행별** max(0, billed−paid) 합 — 무관한 선수의 환불 순수납이 타
   *  선수 미수금을 상쇄하지 않도록(Codex HIGH-3, Phase 2a 계약과 동일).
   */
  private summarizeRows(rows: SettlementRow[]): AggregatedAmounts {
    const users = new Set<string>();
    // 선수별 유효 청구 그룹 — 완납은 그 선수의 모든 유효 청구가 PAID일 때만(Codex MED-4).
    const userCharge = new Map<
      string,
      { hasCharge: boolean; allPaid: boolean }
    >();
    // 선수별 결제방식 파티션(POSTPAID>PREPAID>UNASSIGNED) — 합=total 보장(Codex MED-5).
    const userTiming = new Map<
      string,
      "PREPAID" | "POSTPAID" | "UNASSIGNED"
    >();
    let billedAmount = 0;
    let paidAmount = 0;
    let refundedAmount = 0;
    let estimatedAmount = 0;
    let outstandingAmount = 0;
    let cancelledCount = 0;
    let refundedCount = 0;
    // 행 단위 선불/후불 존재(mixedBilling·후불 성분 계약 유지).
    let hasPrepaid = false;
    let hasPostpaid = false;
    // paymentStatus 산정 — 유효 청구(billedAmount != null) 기준.
    let validCount = 0;
    let validPaidCount = 0;

    for (const r of rows) {
      users.add(r.userId);
      billedAmount += r.billedAmount ?? 0;
      paidAmount += r.paidAmount;
      refundedAmount += r.refundedAmount;
      estimatedAmount += r.estimatedAmount ?? 0;
      if (r.billingStatus === "CANCELLED") cancelledCount++;
      if (r.billingStatus === "REFUNDED") refundedCount++;

      // 결제방식 파티션 — 선수당 1버킷(우선순위 POSTPAID>PREPAID>UNASSIGNED).
      const prevTiming = userTiming.get(r.userId);
      if (r.timing === "POSTPAID") {
        hasPostpaid = true;
        userTiming.set(r.userId, "POSTPAID");
      } else if (r.timing === "PREPAID") {
        hasPrepaid = true;
        if (prevTiming !== "POSTPAID") userTiming.set(r.userId, "PREPAID");
      } else if (prevTiming == null) {
        userTiming.set(r.userId, "UNASSIGNED");
      }

      if (r.billedAmount != null) {
        // 행별 미수금 — 이 행의 청구에서 이 행의 순수납만 차감(교차 상쇄 금지).
        outstandingAmount += Math.max(0, r.billedAmount - r.paidAmount);
        validCount++;
        if (r.billingStatus === "PAID") validPaidCount++;
        // 선수별 완납 그룹 — 유효 청구 중 하나라도 PAID 아니면 미완납.
        const g = userCharge.get(r.userId) ?? {
          hasCharge: false,
          allPaid: true,
        };
        g.hasCharge = true;
        if (r.billingStatus !== "PAID") g.allPaid = false;
        userCharge.set(r.userId, g);
      }
    }

    // 완납 인원 = 유효 청구가 있고 그 청구가 전부 PAID인 선수(distinct).
    let paidCount = 0;
    for (const g of userCharge.values()) {
      if (g.hasCharge && g.allPaid) paidCount++;
    }

    // 결제방식별 인원(distinct·파티션 — 합=total).
    let prepaidCount = 0;
    let postpaidCount = 0;
    let unassignedCount = 0;
    for (const t of userTiming.values()) {
      if (t === "POSTPAID") postpaidCount++;
      else if (t === "PREPAID") prepaidCount++;
      else unassignedCount++;
    }

    let paymentStatus: SubtotalPaymentStatus;
    if (validCount === 0) paymentStatus = "NONE";
    else if (validPaidCount === validCount) paymentStatus = "PAID_ALL";
    else if (validPaidCount === 0) paymentStatus = "UNPAID_ALL";
    else paymentStatus = "PARTIAL_PAID";

    return {
      total: users.size,
      paidCount,
      billedAmount,
      paidAmount,
      refundedAmount,
      estimatedAmount,
      outstandingAmount,
      cancelledCount,
      refundedCount,
      hasPrepaid,
      hasPostpaid,
      prepaidCount,
      postpaidCount,
      unassignedCount,
      paymentStatus,
    };
  }

  /** 미납 요약 — 미수금 총액 + 미납 발생 항목 수(수업/대회). */
  private computeUnpaid(
    summaries: { outstandingAmount: number }[],
  ): UnpaidSummary {
    let amount = 0;
    let count = 0;
    for (const s of summaries) {
      if (s.outstandingAmount > 0) {
        amount += s.outstandingAmount;
        count++;
      }
    }
    return { amount, count };
  }

  // ════════════════════════════════════════════════════════════════
  //   인별 미수금 (팀) — 소계와 동일 행(row) SoT 공유 → §2-0 불변식 보장
  // ════════════════════════════════════════════════════════════════

  /**
   * 팀 scope 의 **미수(outstanding>0) 행만** 평탄화 반환 — 목록·상세·remind 공유 코어.
   *  소계와 동일한 buildClass/TournamentSourceRows 를 소비하므로 인별 합 = 소계 미수금 총액(정합).
   *  outstanding = 행별 max(0, billed − paid)(교차 상쇄 금지). scope 0팀이면 빈 행.
   */
  private async buildTeamUnpaidRows(
    requester: JwtUserPayload,
    yearMonthRaw: string | undefined,
    teamId: string | undefined,
  ): Promise<{ yearMonth: string; rows: EnrichedRow[] }> {
    const yearMonth = resolveSettlementYearMonth(yearMonthRaw);
    const scopeTeamIds = await this.resolveTeamScope(requester, teamId);
    if (scopeTeamIds.length === 0) return { yearMonth, rows: [] };

    const [classRows, tournamentRows] = await Promise.all([
      this.prisma.class.findMany({
        where: { teamId: { in: scopeTeamIds } },
        select: { id: true },
      }),
      this.prisma.tournament.findMany({
        where: { teamId: { in: scopeTeamIds } },
        select: { id: true },
      }),
    ]);

    const [classSources, tournamentSources] = await Promise.all([
      this.buildClassSourceRows(
        classRows.map((c) => c.id),
        yearMonth,
      ),
      this.buildTournamentSourceRows(
        tournamentRows.map((t) => t.id),
        yearMonth,
      ),
    ]);

    const rows: EnrichedRow[] = [];
    for (const src of [...classSources, ...tournamentSources]) {
      for (const r of src.rows) {
        // BILLED 행만(billedAmount != null) 미수 대상. 행별 잔액 > 0.
        if (r.billedAmount != null && r.billedAmount - r.paidAmount > 0) {
          rows.push(r);
        }
      }
    }
    return { yearMonth, rows };
  }

  /**
   * [신규] 팀 인별 미수금 목록 — outstanding>0 행을 회원(userId) 그룹핑.
   *  §2-1 계약. totalOutstanding = getTeamSettlementSummary.unpaid.amount(정합 검증용).
   */
  async getTeamUnpaidMembers(
    requester: JwtUserPayload,
    yearMonthRaw?: string,
    teamId?: string,
  ): Promise<TeamUnpaidMembersResponse> {
    const { yearMonth, rows } = await this.buildTeamUnpaidRows(
      requester,
      yearMonthRaw,
      teamId,
    );

    // 회원(userId) → source 단위 미수 합계(대표 팀·건수 산정용).
    const memberAgg = new Map<
      string,
      Map<
        string,
        {
          amount: number;
          teamName: string | null;
          type: UnpaidSourceKind;
        }
      >
    >();
    for (const r of rows) {
      const out = (r.billedAmount as number) - r.paidAmount;
      let bySource = memberAgg.get(r.userId);
      if (!bySource) {
        bySource = new Map();
        memberAgg.set(r.userId, bySource);
      }
      const key = `${r.sourceType}:${r.sourceId}`;
      const cur = bySource.get(key) ?? {
        amount: 0,
        teamName: r.teamName,
        type: r.sourceType,
      };
      cur.amount += out;
      bySource.set(key, cur);
    }

    const userIds = [...memberAgg.keys()];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameById = new Map(
      users.map((u) => [
        u.id,
        `${u.lastName ?? ""}${u.firstName ?? ""}`.trim() || "회원",
      ]),
    );

    const members: UnpaidMemberRow[] = [];
    for (const [userId, bySource] of memberAgg) {
      let outstandingAmount = 0;
      const sourcesSet = new Set<UnpaidSourceKind>();
      let classCount = 0;
      let tournamentCount = 0;
      let topAmount = -1;
      let topTeamName: string | null = null;
      for (const s of bySource.values()) {
        outstandingAmount += s.amount;
        sourcesSet.add(s.type);
        if (s.type === "CLASS") classCount++;
        else tournamentCount++;
        // 대표 팀 = 미수 최대 source 의 teamName(다팀 회원 대응).
        if (s.amount > topAmount) {
          topAmount = s.amount;
          topTeamName = s.teamName;
        }
      }
      if (outstandingAmount <= 0) continue;
      members.push({
        memberId: userId,
        name: nameById.get(userId) ?? "회원",
        teamName: topTeamName,
        outstandingAmount,
        sources: [...sourcesSet],
        classCount,
        tournamentCount,
      });
    }

    // outstanding desc, 동액은 name asc.
    members.sort(
      (a, b) =>
        b.outstandingAmount - a.outstandingAmount ||
        a.name.localeCompare(b.name),
    );

    const totalOutstanding = members.reduce(
      (s, m) => s + m.outstandingAmount,
      0,
    );

    return {
      yearMonth,
      members,
      totalOutstanding,
      totalCount: members.length,
    };
  }

  /**
   * [신규] 팀 인별 미수금 상세 — 보호자 연락처 + source 단위 미납 라인.
   *  §2-2 계약. scope 재계산 후 미납 0건이면 404(IDOR 차단, 레거시 계약 보존).
   */
  async getTeamUnpaidMemberDetail(
    requester: JwtUserPayload,
    memberId: string,
    yearMonthRaw?: string,
    teamId?: string,
  ): Promise<UnpaidMemberDetailResponse> {
    const { rows } = await this.buildTeamUnpaidRows(
      requester,
      yearMonthRaw,
      teamId,
    );
    const memberRows = rows.filter((r) => r.userId === memberId);
    if (memberRows.length === 0) {
      // 내 스코프에 해당 회원 미납 없음 → 권한 밖이거나 미납 아님.
      throw new NotFoundException("미수금 내역을 찾을 수 없습니다.");
    }

    // source 단위 1행(동일 회원 한 수업 복수 미납은 합산).
    const bySource = new Map<string, UnpaidDetailLine>();
    for (const r of memberRows) {
      const out = (r.billedAmount as number) - r.paidAmount;
      const key = `${r.sourceType}:${r.sourceId}`;
      const cur = bySource.get(key);
      if (cur) {
        cur.amount += out;
        if (r.attendanceCount != null) {
          cur.attendanceCount = (cur.attendanceCount ?? 0) + r.attendanceCount;
        }
      } else {
        bySource.set(key, {
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          sourceName: r.sourceName,
          teamName: r.teamName,
          billingTiming: r.billingTiming,
          yearMonth: r.yearMonth,
          amount: out,
          attendanceCount: r.attendanceCount,
        });
      }
    }
    const details = [...bySource.values()].filter((d) => d.amount > 0);
    const totalOutstanding = details.reduce((s, d) => s + d.amount, 0);

    const [member, parentLinks] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.parentChild.findMany({
        where: { childId: memberId },
        orderBy: { isPrimary: "desc" },
        select: {
          parent: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
      }),
    ]);

    const parents = parentLinks
      .map((p) => p.parent)
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        id: p.id,
        name: `${p.lastName ?? ""}${p.firstName ?? ""}`.trim() || "보호자",
        phone: p.phone ?? null,
      }));

    return {
      member: {
        id: memberId,
        name: member
          ? `${member.lastName ?? ""}${member.firstName ?? ""}`.trim() || "회원"
          : "회원",
        totalOutstanding,
      },
      parents,
      details,
    };
  }

  /**
   * [신규] 미납 안내 발송 — 상세 재사용(scope·404) → 보호자에게 인앱+푸시. §2-3 계약.
   *  쿨다운 키를 월 분리(`unpaid-remind:{memberId}:{yearMonth}`) — 월별 독촉 허용.
   *  운영 24h / 개발 60s. 총액은 수업+대회 미납 합.
   */
  async sendTeamUnpaidReminder(
    requester: JwtUserPayload,
    memberId: string,
    yearMonthRaw?: string,
  ): Promise<UnpaidReminderResult> {
    const yearMonth = resolveSettlementYearMonth(yearMonthRaw);
    const detail = await this.getTeamUnpaidMemberDetail(
      requester,
      memberId,
      yearMonth,
    );
    const parentIds = detail.parents.map((p) => p.id);
    if (parentIds.length === 0) {
      return { sent: false, cooldown: false, recipientCount: 0 };
    }

    const cooldownSec =
      process.env.NODE_ENV === "production" ? 24 * 60 * 60 : 60;
    const lockAcquired = await this.redis.setIfNotExists(
      `unpaid-remind:${memberId}:${yearMonth}`,
      Date.now(),
      cooldownSec,
    );
    if (!lockAcquired) {
      return { sent: false, cooldown: true, recipientCount: 0 };
    }

    const won = new Intl.NumberFormat("ko-KR").format(
      detail.member.totalOutstanding,
    );
    await this.notificationsService.notifyUsers(parentIds, {
      notificationType: "payment_unpaid",
      title: "미납 결제 안내",
      message: `${detail.member.name} 회원의 미납 금액 ${won}원이 있습니다. 결제를 완료해 주세요.`,
      // 결제내역 미납 탭 — 후불 미납 목록에서 건별 결제 진입 (구 /credits 는 폐기 화면).
      linkUrl: "/payment/history?tab=pending",
    });

    return { sent: true, cooldown: false, recipientCount: parentIds.length };
  }

  /**
   * [정산 센터 ③] 팀 거래 내역 — 결제 1건 = 1행 장부(선택 월 완료 기준·최신순).
   *  scope = resolveTeamScope(관리 팀·IDOR 규약 동일). 장부는 "일어난 결제"만 —
   *  pending 은 제외하고, 고아 취소(completedAt null)는 결제내역(getUserPayments)과
   *  동일 규칙으로 completedAt 경계가 자연 배제한다. 팀 귀속은 결제↔수업/대회 연결로
   *  판정한다(레거시 getClubPayments 의 TeamMember 축은 결제자=보호자 모델과 불일치).
   */
  async getTeamTransactions(
    requester: JwtUserPayload,
    yearMonthRaw?: string,
    teamId?: string,
  ): Promise<TeamTransactionsResponse> {
    const yearMonth = resolveSettlementYearMonth(yearMonthRaw);
    const scopeTeamIds = await this.resolveTeamScope(requester, teamId);
    if (scopeTeamIds.length === 0) {
      return { yearMonth, items: [], totalCount: 0 };
    }

    // 선택 월의 KST 경계 [1일 00:00, 다음달 1일 00:00) → UTC instant 범위.
    const [y, m] = yearMonth.split("-").map(Number);
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
    const monthStart = new Date(Date.UTC(y, m - 1, 1) - KST_OFFSET_MS);
    const monthEnd = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);

    const where: import("@prisma/client").Prisma.PaymentWhereInput = {
      completedAt: { gte: monthStart, lt: monthEnd },
      paymentStatus: {
        in: ["completed", "refunded", "partially_refunded", "cancelled"],
      },
      OR: [
        { enrollments: { some: { class: { teamId: { in: scopeTeamIds } } } } },
        {
          monthlyBillingLines: {
            some: { billing: { class: { teamId: { in: scopeTeamIds } } } },
          },
        },
        {
          tournamentRegistrations: {
            some: { tournament: { teamId: { in: scopeTeamIds } } },
          },
        },
      ],
    };

    const TRANSACTIONS_MAX = 300;
    const [totalCount, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        select: {
          id: true,
          amount: true,
          paymentStatus: true,
          completedAt: true,
          user: { select: { firstName: true, lastName: true } },
          product: { select: { billingTiming: true } },
          enrollments: {
            select: {
              class: { select: { className: true } },
              child: { select: { firstName: true, lastName: true } },
            },
            take: 1,
          },
          tournamentRegistrations: {
            select: {
              tournament: { select: { name: true, billingMode: true } },
            },
            take: 1,
          },
          monthlyBillingLines: {
            select: {
              billing: { select: { class: { select: { className: true } } } },
              user: { select: { firstName: true, lastName: true } },
            },
            take: 1,
          },
        },
        orderBy: { completedAt: "desc" },
        take: TRANSACTIONS_MAX,
      }),
    ]);

    const toName = (
      u?: { firstName: string | null; lastName: string | null } | null,
    ) => (u ? `${u.lastName ?? ""}${u.firstName ?? ""}`.trim() || null : null);

    const items: TeamTransactionItem[] = payments.map((p) => {
      const line = p.monthlyBillingLines?.[0] ?? null;
      const tReg = p.tournamentRegistrations?.[0] ?? null;
      const src = deriveSource({
        productBillingTiming: p.product?.billingTiming,
        hasMonthlyBillingLine: line != null,
        tournamentBillingMode: tReg?.tournament?.billingMode ?? null,
      });
      return {
        paymentId: p.id,
        amount: p.amount,
        paymentStatus: p.paymentStatus,
        completedAt: p.completedAt as Date,
        payerName: toName(p.user),
        childName: toName(line?.user) ?? toName(p.enrollments?.[0]?.child),
        subjectName:
          tReg?.tournament?.name ??
          p.enrollments?.[0]?.class?.className ??
          line?.billing?.class?.className ??
          null,
        sourceType: src.sourceType,
        billingTiming: src.billingTiming,
      };
    });

    return { yearMonth, items, totalCount };
  }
}
