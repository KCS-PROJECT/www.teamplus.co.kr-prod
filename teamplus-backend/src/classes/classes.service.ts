import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClassVisibility, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { AttendanceAuditLogService } from "@/attendance/attendance-audit-log.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { resolveViewerTeamIds } from "@/common/utils/team-scope.util";
import {
  countActiveUnitNotices,
  cleanupUnitNoticesForDelete,
  isForeignKeyRestrictError,
} from "@/community/utils/unit-notice-delete-guard.util";
import {
  dateOnlyToUtc,
  dateOnlyToString,
  kstTodayUtcMidnight,
  kstDayEndExclusive,
} from "@/common/utils/kst-date.util";
import { createHash } from "crypto";
import { ApplyScheduleDraftDto } from "./dto/apply-schedule-draft.dto";
import {
  deriveClassLifecycle,
  utcMonthStart,
} from "@/common/utils/class-lifecycle.util";
import { filterSellableProducts } from "@/common/billing/sales-gate.util";
import {
  ENROLLMENT_STATUS,
  TERMINAL_NO_MONEY,
} from "@/common/enrollment/enrollment-status.constants";
import {
  resolvePrepaidAttribution,
  isRosterMemberForMonth,
  instantToKstYearMonth,
  dbDateToKstYearMonth,
  type AttributionResult,
} from "@/payments/settlement/attribution.util";
import {
  MONTHLY_PASS_CREDIT_FILTER,
  creditStartedWhere,
} from "@/common/billing/fee-type.constants";
import {
  computePackageGuardMeta,
  shouldHideInactiveFor,
} from "./utils/package-guard.util";
import {
  PRICE_LOCK_MESSAGES,
  assertPrepaidChangeAllowed,
  assertSalesMonthNotRolledBack,
  assertMonthNotFrozen,
  assertLegacyNotReactivated,
  isEntitlementOrAmountChange,
  isPrepaidProductLocked,
  resolveProductDeletionMode,
  resolveNewProductBillingMonth,
} from "./utils/price-lock.util";
import {
  acquireClassSalesLock,
  acquireClassSalesAndPostpaidLocks,
  acquireClassScheduleLock,
  acquireClassScheduleAndPostpaidLocksIfNeeded,
  shouldUsePostpaidLock,
} from "./utils/class-locks.util";
import {
  assertVisibilitySelection,
  buildClassVisibilityWhere,
} from "./utils/class-visibility.util";
import { CLASSES_DOMAIN_TRAINING_TYPES } from "@/common/constants/class-domain.constant";
import { TRAINING_TYPES } from "@/training/dto/create-training.dto";
import {
  assertClassRegion,
  formatRegionLabel,
  mergeClassRegion,
} from "./utils/class-region.util";
import {
  assertPostpaidUnitPriceMutable,
  assertScheduleMonthNotSettled,
  findUnsettledPostpaidMonths,
} from "@/payments/settlement/postpaid-attendance.util";
import { CreateClassDto, DayScheduleItemDto } from "./dto/create-class.dto";
import { UpdateClassDto } from "./dto/update-class.dto";
import { CreateClassProductDto } from "./dto/create-product.dto";
import { GetClassesQueryDto } from "./dto/get-classes-query.dto";
import { TeamsService } from "@/teams/teams.service";

/**
 * ClassProduct 생성 헬퍼 — 입력 가격 + 정기 패키지 메타로 1~2개 상품 생성.
 *
 * 정기 패키지 단위는 "주 수 + 총 회수" 정수 단위로 표현.
 *  - durationDays = packageWeeks × 7 (만료일 SoT)
 *  - sessionsPerMonth = packageTotalSessions (발급 크레딧 수량 — 컬럼명 무관 "총 회수" 의미)
 *  - sessionsPerWeek 자동 파생(classDays.length) 폐기 — 갱신 안 되는 스냅샷 오염원이며
 *    MONTHLY_FIXED 는 무차감 기간제라 주 빈도 제약 미사용. 상품 설명은 감독 자유 입력이 SoT.
 *  - 발급 수량 SoT = sessionsPerMonth. 미입력 = 0(크레딧 미발급). 크레딧을 되살리려면
 *    감독이 패키지에 실제 회수를 입력한다. weeks(만료일용)만 미입력 시 4주로 폴백.
 */
export function buildClassProducts(
  classId: string,
  dto: {
    singlePrice?: number;
    monthlyPrice?: number;
    packageWeeks?: number;
    packageTotalSessions?: number;
    billingMode?: string;
    trainingType?: string | null;
  },
): Array<{
  classId: string;
  productName: string;
  description?: string;
  feeType: string;
  price: number;
  sessionsPerMonth: number;
  sessionsPerWeek?: number;
  durationDays: number;
  billingTiming?: string;
  feePerSession?: number;
  isActive?: boolean;
}> {
  const products: ReturnType<typeof buildClassProducts> = [];

  // [spot 선불 단건] 1회용 수업(선불) — "1회 수업료" 판매 1행만. 정기권 미생성.
  //   일반 선불과 달리 1회권을 판매(isActive 기본 true)로 켠다. feePerSession 미설정 →
  //   결제 옵션의 수량 선택이 자동 숨김(1회 고정)·금액은 price 단건("횟수제 선결제" 경로).
  //   billingMode 조건: 선불 spot 에만 적용. 후불 spot 은 아래 기존 후불 분기가 그대로 맞고
  //   (1회권 후불 판매 1행), 레거시 spot(BOTH)은 기존 선택형 분기로 흘려 구성을 보존한다.
  if (dto.trainingType === "spot" && dto.billingMode === "PREPAID") {
    if (dto.singlePrice) {
      products.push({
        classId,
        productName: "1회 수업료",
        feeType: "PER_SESSION",
        billingTiming: "PREPAID",
        price: dto.singlePrice,
        sessionsPerMonth: 0,
        durationDays: 30,
      });
    }
    return products;
  }

  // [Phase B-5] 후불(POSTPAID) — "1회 수업료"(singlePrice=feePerSession) 상품 1개.
  //   출석 횟수 × feePerSession 으로 월말 정산(B-3). price 는 단가 스냅샷.
  if (dto.billingMode === "POSTPAID") {
    if (dto.singlePrice) {
      products.push({
        classId,
        productName: "1회 수업료",
        feeType: "PER_SESSION",
        billingTiming: "POSTPAID",
        price: dto.singlePrice,
        feePerSession: dto.singlePrice,
        sessionsPerMonth: 0,
        durationDays: 30,
      });
    }
    return products;
  }

  // BOTH(선택형): 1회 수업료 PER_SESSION 을 "후불 옵션"(billingTiming=POSTPAID·판매)으로 생성.
  //   학생이 후불을 택1하면 이 상품을 classProductId 로 선택 → feePerSession 으로 월말 정산.
  //   정액(MONTHLY_FIXED, 선불 옵션)은 monthlyPrice 또는 PackageManageSection 경유로 함께 제공.
  // PREPAID(선불 전용): 1회 수업료 PER_SESSION 은 비판매(isActive:false)로 보존 —
  //   단가 참고·표시용이며 구매/발급 경로에 노출되지 않는다.
  const isBoth = dto.billingMode === "BOTH";

  if (dto.singlePrice) {
    products.push({
      classId,
      productName: "1회 수업료",
      feeType: "PER_SESSION",
      billingTiming: isBoth ? "POSTPAID" : "PREPAID",
      isActive: isBoth, // BOTH=판매(후불옵션) / PREPAID=비판매(참고용)
      price: dto.singlePrice,
      feePerSession: isBoth ? dto.singlePrice : undefined,
      sessionsPerMonth: 0,
      durationDays: 30,
    });
  }

  if (dto.monthlyPrice) {
    const weeks = Math.max(1, Math.min(52, dto.packageWeeks ?? 4));
    // 발급 수량 미입력 = 0(크레딧 미발급). 상한 728만 유지, 하한(1) 제거.
    const totalSessions = Math.min(728, dto.packageTotalSessions ?? 0);
    // SPEC §8 cross 검증은 발급 수량이 있을 때만(>0): totalSessions ≥ weeks · ≤ weeks × 14
    if (totalSessions > 0 && totalSessions < weeks) {
      throw new BadRequestException(
        `정기권 총 회수(${totalSessions})는 주 수(${weeks}) 이상이어야 합니다.`,
      );
    }
    if (totalSessions > 0 && totalSessions > weeks * 14) {
      throw new BadRequestException(
        `정기권 총 회수(${totalSessions})는 주 수×14(${weeks * 14}) 이하여야 합니다.`,
      );
    }
    // "주 N회" 자동 파생 폐기 — classDays 는 갱신 안 되는 스냅샷이라 상품 메타 오염원.
    //   MONTHLY_FIXED 는 무차감 기간제라 주 빈도 개념 자체가 제약에 미사용.
    //   설명은 감독 자유 입력(description)이 SoT — 자동 주입 없음(미입력 = null 유지).
    products.push({
      classId,
      productName: `${weeks}주 정기권`,
      feeType: "MONTHLY_FIXED",
      price: dto.monthlyPrice,
      sessionsPerMonth: totalSessions,
      durationDays: weeks * 7,
    });
  }

  return products;
}

// ─── ClassDaySchedule 헬퍼 ──────────────────────────────────────────────────

/** buildDayTimeMap 전용 최소 입력 타입 — venueId 없는 plain 호출(bulk 경로)도 수용. */
type DayTimeInput = {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  venueId?: string;
};

/**
 * daySchedules 배열을 요일 → {startHH, startMM, endHH, endMM, venueId} 맵으로 변환.
 * 빈 입력이면 빈 Map 반환.
 */
function buildDayTimeMap(daySchedules?: DayTimeInput[]): Map<
  string,
  {
    startHH: number;
    startMM: number;
    endHH: number;
    endMM: number;
    venueId?: string;
  }
> {
  const map = new Map<
    string,
    {
      startHH: number;
      startMM: number;
      endHH: number;
      endMM: number;
      venueId?: string;
    }
  >();
  if (!daySchedules || daySchedules.length === 0) return map;
  for (const ds of daySchedules) {
    const [startHH, startMM] = ds.startTime.split(":").map(Number);
    const [endHH, endMM] = ds.endTime.split(":").map(Number);
    map.set(ds.dayOfWeek, {
      startHH,
      startMM,
      endHH,
      endMM,
      venueId: ds.venueId,
    });
  }
  return map;
}

/**
 * daySchedules 에서 "가장 이른 startTime" 요일의 대표값을 산출.
 * Class.startTime/endTime/venueId/classDays 하위호환 채움용.
 *
 * 반환값의 startTime/endTime 은 기존 코드가 getUTCHours/getUTCMinutes 로
 * 시:분을 추출하는 방식과 일관되도록 UTC Date(today 기준 Y-m-d + HH:MM:00 UTC) 로 생성.
 *
 * 입력이 없으면 null 반환 — 기존 단일 startTime 경로로 폴백.
 */
function deriveRepresentative(daySchedules?: DayScheduleItemDto[]): {
  startTime: Date;
  endTime: Date;
  venueId?: string;
  classDays: string[];
} | null {
  if (!daySchedules || daySchedules.length === 0) return null;

  let earliest = daySchedules[0];
  for (const ds of daySchedules) {
    const [h, m] = ds.startTime.split(":").map(Number);
    const [eh, em] = earliest.startTime.split(":").map(Number);
    if (h < eh || (h === eh && m < em)) earliest = ds;
  }

  const [startHH, startMM] = earliest.startTime.split(":").map(Number);
  const [endHH, endMM] = earliest.endTime.split(":").map(Number);

  // UTC 기반 Date 생성 (기존 일정 생성 코드의 dt.setHours(hh, mm, 0, 0) 패턴과 동일).
  const now = new Date();
  const startTime = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      startHH,
      startMM,
      0,
      0,
    ),
  );
  const endTime = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      endHH,
      endMM,
      0,
      0,
    ),
  );

  return {
    startTime,
    endTime,
    venueId: earliest.venueId,
    classDays: daySchedules.map((ds) => ds.dayOfWeek),
  };
}

/**
 * dateSchedules(날짜별 일정)에서 Class.startTime/endTime/venueId/classDays 대표값 산출.
 * 가장 이른 날짜·시간의 항목을 대표로 사용.
 * classDays: 모든 날짜의 요일 집합 (중복 제거 · 월~일 순 정렬).
 * 입력이 없으면 null 반환.
 */
function deriveRepresentativeFromDateSchedules(
  dateSchedules?: import("./dto/create-class.dto").DateScheduleItemDto[],
): {
  startTime: Date;
  endTime: Date;
  venueId?: string;
  classDays: string[];
} | null {
  if (!dateSchedules || dateSchedules.length === 0) return null;

  // 가장 이른 날짜+시간 항목 선택
  let earliest = dateSchedules[0];
  for (const s of dateSchedules) {
    if (s.date < earliest.date) {
      earliest = s;
    } else if (s.date === earliest.date) {
      const [h, m] = s.startTime.split(":").map(Number);
      const [eh, em] = earliest.startTime.split(":").map(Number);
      if (h < eh || (h === eh && m < em)) earliest = s;
    }
  }

  const [startHH, startMM] = earliest.startTime.split(":").map(Number);
  const [endHH, endMM] = earliest.endTime.split(":").map(Number);
  const now = new Date();
  const startTime = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      startHH,
      startMM,
      0,
      0,
    ),
  );
  const endTime = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      endHH,
      endMM,
      0,
      0,
    ),
  );

  // 날짜별 요일 파생 — 중복 제거 후 월~일 순 정렬
  const KO_DAY_NAMES: Record<number, string> = {
    0: "일",
    1: "월",
    2: "화",
    3: "수",
    4: "목",
    5: "금",
    6: "토",
  };
  const KO_DAY_ORDER: Record<string, number> = {
    월: 0,
    화: 1,
    수: 2,
    목: 3,
    금: 4,
    토: 5,
    일: 6,
  };
  const daySet = new Set<string>();
  for (const s of dateSchedules) {
    const dow = dateOnlyToUtc(s.date).getUTCDay();
    const name = KO_DAY_NAMES[dow];
    if (name) daySet.add(name);
  }
  const classDays = Array.from(daySet).sort(
    (a, b) => (KO_DAY_ORDER[a] ?? 99) - (KO_DAY_ORDER[b] ?? 99),
  );

  return { startTime, endTime, venueId: earliest.venueId, classDays };
}

/** "HH:mm" → 분(0~1439). 형식은 DTO @Matches 가 보장. */
function hhmmToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 회차 단위 시간 순서 검증 — daySchedules/dateSchedules 각 행의 시작<종료 보장.
 * Class 레벨 startTime/endTime(ISO) 검증과 별개로, "HH:mm" 회차 시간이 역전되면
 * 잘못된 일정이 그대로 저장되던 구멍을 막는다. 한 행이라도 시작>=종료면 400.
 */
function assertScheduleTimeRanges(
  daySchedules?: { startTime: string; endTime: string }[],
  dateSchedules?: { startTime: string; endTime: string }[],
): void {
  for (const s of [...(daySchedules ?? []), ...(dateSchedules ?? [])]) {
    if (hhmmToMinutes(s.startTime) >= hhmmToMinutes(s.endTime)) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ClassesService {
  private readonly logger = new Logger(ClassesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly teamsService: TeamsService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 수업 일정 취소 시 일괄 복원
    private readonly auditLog: AttendanceAuditLogService, // PR-C (v0.6): AuditLog
    private readonly resourceAccess: ResourceAccessService, // 관리자 전용 API 리소스 소속 검증 (IDOR 가드)
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * [2026-08-04] 노출 팀(ClassTeamVisibility) 전체 교체 — visibility=SELECTED_TEAMS 전용.
   *
   * 기존 행을 모두 지우고 유효한 팀만 다시 넣는다(멱등).
   * 존재하지 않거나 비활성인 teamId 는 조용히 걸러진다 — FK 위반으로 트랜잭션 전체가
   * 실패하면 수업 생성 자체가 막히므로, 팀 검증은 사전 필터로 처리한다.
   *
   * @param teamIds 빈 배열이면 노출 지정만 해제한다(호출부에서 SELECTED_TEAMS 여부를 판단).
   */
  private async replaceClassTeamVisibilities(
    tx: Prisma.TransactionClient,
    classId: string,
    teamIds: string[],
  ): Promise<void> {
    await tx.classTeamVisibility.deleteMany({ where: { classId } });
    if (teamIds.length === 0) return;

    const uniqueTeamIds = [...new Set(teamIds)];
    const validTeams = await tx.team.findMany({
      where: { id: { in: uniqueTeamIds }, isActive: true },
      select: { id: true },
    });
    if (validTeams.length === 0) return;

    await tx.classTeamVisibility.createMany({
      data: validTeams.map((t) => ({ classId, teamId: t.id })),
      skipDuplicates: true,
    });
  }

  /**
   * [2026-08-04] 수정 경로의 공개범위 반영 — visibility ↔ ClassTeamVisibility 정합 유지.
   *
   * 두 필드가 따로 전달되므로 "변경 후 최종 상태" 기준으로 판단해야 한다:
   *   · SELECTED_TEAMS 밖으로 전환 → 남은 노출 지정은 의미가 없으므로 정리(고아 행 방지)
   *   · SELECTED_TEAMS 유지/진입 → 최종 팀 목록이 비면 400 (아무도 못 보는 수업 차단)
   *   · visibleTeamIds 미전달 → 기존 노출 지정을 그대로 둔다(부분 수정 호환)
   */
  private async applyClassVisibilityUpdate(
    classId: string,
    currentVisibility: ClassVisibility,
    updateDto: Pick<UpdateClassDto, "visibility" | "visibleTeamIds">,
  ): Promise<void> {
    const nextVisibility = updateDto.visibility ?? currentVisibility;
    const teamIdsProvided = updateDto.visibleTeamIds !== undefined;

    if (nextVisibility !== ClassVisibility.SELECTED_TEAMS) {
      // 공개범위를 명시적으로 바꿨을 때만 정리한다 — 미전달이면 기존 상태 보존.
      if (updateDto.visibility !== undefined) {
        await this.prisma.classTeamVisibility.deleteMany({
          where: { classId },
        });
      }
      return;
    }

    const finalTeamIds = teamIdsProvided
      ? (updateDto.visibleTeamIds ?? [])
      : (
          await this.prisma.classTeamVisibility.findMany({
            where: { classId },
            select: { teamId: true },
          })
        ).map((r) => r.teamId);

    assertVisibilitySelection(ClassVisibility.SELECTED_TEAMS, finalTeamIds);

    if (teamIdsProvided) {
      await this.prisma.$transaction((tx) =>
        this.replaceClassTeamVisibilities(tx, classId, finalTeamIds),
      );
    }
  }

  /**
   * 수업 생성 (감독만)
   */
  async createClass(
    coachUserId: string,
    teamId: string,
    createDto: CreateClassDto,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수업을 생성할 수 있습니다.",
    );

    // 클럽 존재 확인
    const club = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!club) {
      throw new NotFoundException("클럽을 찾을 수 없습니다.");
    }

    // 시간 검증
    if (
      createDto.startTime &&
      createDto.endTime &&
      new Date(createDto.startTime) >= new Date(createDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(createDto.daySchedules, createDto.dateSchedules);

    // [Lifecycle v4.1 §7.1] spot(1회용) — 일정 1개 초과 차단 (프론트 단일 선택 제한의 서버 방어선)
    if (
      createDto.trainingType === "spot" &&
      (createDto.dateSchedules?.length ?? 0) > 1
    ) {
      throw new BadRequestException(
        "1회용 수업은 일정을 1개만 등록할 수 있습니다.",
      );
    }
    // [spot] 1회용 수업은 선불/후불 2택 — 정기권 전제인 선택형(BOTH)만 차단.
    if (
      createDto.trainingType === "spot" &&
      createDto.billingMode === "BOTH"
    ) {
      throw new BadRequestException(
        "1회용 수업은 선불 또는 후불로만 등록할 수 있습니다.",
      );
    }
    if (createDto.trainingType === "spot" && createDto.monthlyPrice) {
      throw new BadRequestException(
        "1회용 수업은 정기권(월 결제)을 등록할 수 없습니다.",
      );
    }

    // [2026-08-04] 공개범위 검증 — SELECTED_TEAMS 는 노출 팀이 최소 1개 필요.
    //   빈 채로 저장하면 아무에게도 안 보이는 수업이 되어 감독이 원인을 알기 어렵다.
    assertVisibilitySelection(createDto.visibility, createDto.visibleTeamIds);

    // [2026-08-04] 지역 조합 검증 — "부산 강남구" 같은 불가능한 조합 차단.
    //   DTO 는 값 자체만 보므로(시군구 이름은 시/도 간 중복이 많다) 조합은 여기서 본다.
    assertClassRegion(createDto.regionCity, createDto.regionDistrict);

    // 카테고리 자동 계산
    let category = createDto.category;
    if (!category && (createDto.ageMin || createDto.ageMax)) {
      if (createDto.ageMax && createDto.ageMax <= 12) category = "KIDS";
      else if (
        createDto.ageMin &&
        createDto.ageMin >= 13 &&
        createDto.ageMax &&
        createDto.ageMax <= 18
      )
        category = "JUNIOR";
      else if (createDto.ageMin && createDto.ageMin >= 19) category = "ADULT";
    }

    // 2026-05-12: 배정 코치 ID 정합 검증 — 회의록 정합 (정해진 감독 코치만, 외부 게스트 제외).
    //   - DIRECTOR/감독: Team.coachId (owner) 매핑 — CoachProfile 없을 수 있음
    //   - COACH/학원 감독: CoachProfile.teamId 매핑
    //   - 둘 중 하나라도 같은 팀이면 통과.
    // 1번째 = LEAD, 나머지 = ASSISTANT. coachUserIds 비어있으면 createDto.coachId 또는 팀 감독(club.coachId) 폴백.
    const assignedCoachUserIds: string[] = [];
    if (createDto.coachUserIds && createDto.coachUserIds.length > 0) {
      const [validProfiles, teamOwners] = await Promise.all([
        this.prisma.coachProfile.findMany({
          where: { userId: { in: createDto.coachUserIds }, teamId },
          select: { userId: true },
        }),
        this.prisma.team.findMany({
          where: { id: teamId, coachId: { in: createDto.coachUserIds } },
          select: { coachId: true },
        }),
      ]);
      const validSet = new Set<string>([
        ...validProfiles.map((p) => p.userId),
        ...teamOwners.map((t) => t.coachId),
      ]);
      for (const uid of createDto.coachUserIds) {
        if (validSet.has(uid)) assignedCoachUserIds.push(uid);
      }
    }
    const primaryCoachId =
      assignedCoachUserIds[0] || createDto.coachId || club.coachId;

    // 수업 + 수강료 상품을 원자적으로 생성 — 중간 실패 시 가격 없는 좀비 수업 방지
    // [2026-06-05] daySchedules 대표값 산출 — daySchedules 가 있으면 가장 이른 요일의 시각으로
    //   Class.startTime/endTime/venueId/classDays 를 채운다 (하위호환 보장).
    const hasDateSchedules = (createDto.dateSchedules?.length ?? 0) > 0;
    const dateRepresentative = hasDateSchedules
      ? deriveRepresentativeFromDateSchedules(createDto.dateSchedules)
      : null;
    const hasDaySchedules = (createDto.daySchedules?.length ?? 0) > 0;
    const representative = hasDaySchedules
      ? deriveRepresentative(createDto.daySchedules)
      : null;

    const classRecord = await this.prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          teamId,
          className: createDto.className,
          description: createDto.description,
          instructorName: createDto.instructorName ?? "",
          capacity: createDto.capacity ?? 0,
          targetBirthYears: createDto.targetBirthYears ?? [],
          // targetBirthYears(SoT) 가 있으면 ageMin/ageMax 는 한국나이 파생값으로 기록,
          //   없으면 기존 ageMin/ageMax 값을 그대로 유지(하위호환 — 구 폼/타 화면 대응).
          ...(createDto.targetBirthYears &&
          createDto.targetBirthYears.length > 0
            ? this.deriveAgeRangeFromBirthYears(createDto.targetBirthYears)
            : { ageMin: createDto.ageMin, ageMax: createDto.ageMax }),
          levelRequired: createDto.levelRequired,
          // 우선순위: dateSchedules 대표값 > daySchedules 대표값 > 기존 단일 startTime 경로(하위호환)
          startTime:
            dateRepresentative?.startTime ??
            representative?.startTime ??
            (createDto.startTime ? new Date(createDto.startTime) : new Date()),
          endTime:
            dateRepresentative?.endTime ??
            representative?.endTime ??
            (createDto.endTime ? new Date(createDto.endTime) : new Date()),
          trainingType: createDto.trainingType,
          coachId: primaryCoachId,
          venueId:
            dateRepresentative !== null
              ? (dateRepresentative.venueId ?? null)
              : representative?.venueId !== undefined
                ? (representative.venueId ?? null)
                : (createDto.venueId ?? null),
          // dateSchedules/daySchedules 있으면 날짜/요일 집합으로 자동 세팅.
          classDays:
            dateRepresentative?.classDays ??
            representative?.classDays ??
            createDto.classDays ??
            [],
          category,
          requiredCoaches: createDto.requiredCoaches ?? 1,
          // 결제 방식 — 감독 지정 (PREPAID 선불 / POSTPAID 후불). DTO 필수라 폴백 없음.
          billingMode: createDto.billingMode,
          // [2026-08-04] 공개 범위 — 미전송 시 TEAM_ONLY(기존 동작: 소속 팀에만 노출).
          visibility: createDto.visibility ?? ClassVisibility.TEAM_ONLY,
          // [2026-08-04] 수업 지역 — 감독/코치 선택값. 목록 카드에 "서울 강남구" 로 노출된다.
          regionCity: createDto.regionCity ?? null,
          regionDistrict: createDto.regionDistrict ?? null,
          // 2026-05-08: 수업 자동 승인 — 감독/코치가 만든 수업은 즉시 활성화.
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedBy: coachUserId,
          isActive: true,
        },
      });

      // [2026-08-04] 노출 팀 지정 — visibility=SELECTED_TEAMS 일 때만 ClassTeamVisibility 생성.
      //   팀 수업(teamId)·오픈클래스(academyId) 공통 적용. 그 외 visibility 에서는 행을 만들지 않는다.
      if (createDto.visibility === ClassVisibility.SELECTED_TEAMS) {
        await this.replaceClassTeamVisibilities(
          tx,
          created.id,
          createDto.visibleTeamIds ?? [],
        );
      }

      // [2026-06-05] ClassDaySchedule 행 생성 (daySchedules 전송 시)
      if (
        hasDaySchedules &&
        createDto.daySchedules &&
        createDto.daySchedules.length > 0
      ) {
        await tx.classDaySchedule.createMany({
          data: createDto.daySchedules.map((ds) => ({
            classId: created.id,
            dayOfWeek: ds.dayOfWeek,
            startTime: ds.startTime,
            endTime: ds.endTime,
            venueId: ds.venueId ?? null,
          })),
          skipDuplicates: true,
        });
      }

      // 날짜별 일정(dateSchedules) → ClassSchedule 직접 생성 (요일 기반 자동 생성과 배타적).
      if (createDto.dateSchedules && createDto.dateSchedules.length > 0) {
        await tx.classSchedule.createMany({
          data: createDto.dateSchedules.map((s) => ({
            classId: created.id,
            scheduledDate: dateOnlyToUtc(s.date),
            startTime: s.startTime,
            endTime: s.endTime,
            venueId: s.venueId ?? null,
          })),
        });
      }

      // 정규 수업은 등록 시 일정을 생성하지 않는다 — 일정은 개설 후 일정 관리 화면(미니달력)에서
      //   별도로 누적 추가한다. (시작일/종료일 기반 자동 일괄 생성 폐기)
      //   · dateSchedules(미니달력 직접 입력) 경로는 위에서 별도 처리.

      // 2026-05-12: 배정 코치 ClassCoachAssignment 자동 생성 (status: ACCEPTED).
      //  - 1번째 = LEAD, 나머지 = ASSISTANT
      //  - 회의록 정합: "정해진 감독 코치" 같은 팀 코치만 (CoachProfile 검증 위에서 완료)
      //  - 즉시 ACCEPTED 처리 — 폼 등록자가 본인 권한으로 배정 (응답 단계 불필요)
      if (assignedCoachUserIds.length > 0) {
        const now = new Date();
        await tx.classCoachAssignment.createMany({
          data: assignedCoachUserIds.map((userId, idx) => ({
            classId: created.id,
            coachUserId: userId,
            invitedBy: coachUserId,
            role: idx === 0 ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }

      // [Lifecycle v4.1 §9.3] 첫 수업 생성 = 첫 일정 달 자동 승인.
      //   일정 생성 경로(dateSchedules 직접 입력·요일 자동 생성)와 무관하게
      //   tx 안에서 생성된 첫 비취소 일정의 달을 salesOpenMonth 로 기록.
      //   일정 없이 생성된 수업은 null 유지 → 파생 판정상 "일정 등록 대기".
      const firstSched = await tx.classSchedule.findFirst({
        where: { classId: created.id, isCancelled: false },
        orderBy: { scheduledDate: "asc" },
        select: { scheduledDate: true },
      });
      if (firstSched) {
        await tx.class.update({
          where: { id: created.id },
          data: { salesOpenMonth: utcMonthStart(firstSched.scheduledDate) },
        });
      }

      // [가격 잠금 §3-7] 상품 생성은 첫 일정 산출 뒤 — 신규 MONTHLY_FIXED 는 첫 일정의
      //   달(= salesOpenMonth 로 기록되는 그 달)을 귀속월로 기록한다. 일정 없는 수업의
      //   월 정액 요청은 fail-fast 400 (같은 tx 라 부분 반영 없음 — 월 정액 미요청이면
      //   일정 없는 수업 생성은 기존대로 허용).
      if (createDto.singlePrice || createDto.monthlyPrice) {
        const products = buildClassProducts(created.id, {
          ...createDto,
        });
        if (products.length > 0) {
          const firstScheduleMonth = firstSched
            ? utcMonthStart(firstSched.scheduledDate)
            : null;
          const data = products.map((p) =>
            p.feeType === "MONTHLY_FIXED"
              ? {
                  ...p,
                  billingMonth: resolveNewProductBillingMonth({
                    firstScheduleMonth,
                  }),
                }
              : p,
          );
          await tx.classProduct.createMany({ data });
        }
      }

      return created;
    });

    // 캐시 무효화 — 트랜잭션 외부(Redis I/O)
    await this.invalidateClassCache(teamId);

    // 2026-05-12: 배정된 코치에게 "수업 배정 알림" 발송 (등록자 본인 제외).
    //  - 회의록 5:50 "감독 공지" 패턴 정합 — 출처(감독) 명시 메시지.
    //  - 알림 페이지(/notifications) + 종 아이콘 배지에 즉시 반영됨.
    const notifyTargets = assignedCoachUserIds.filter(
      (uid) => uid !== coachUserId,
    );
    if (notifyTargets.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: coachUserId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "DIRECTOR"
          ? "감독"
          : inviter?.userType === "ACADEMY_DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: notifyTargets.map((userId) => ({
          userId,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${classRecord.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    // 팀 소속 학생의 학부모에게 새 수업 등록 알림 (실패 격리)
    void this.notificationsService.notifyTeamParents(teamId, {
      notificationType: "class_created",
      title: "새 수업 등록",
      message: classRecord.className,
      linkUrl: `/classes/${classRecord.id}`,
    });

    return {
      id: classRecord.id,
      teamId: classRecord.teamId,
      className: classRecord.className,
      instructorName: classRecord.instructorName,
      capacity: classRecord.capacity,
      startTime: classRecord.startTime,
      endTime: classRecord.endTime,
      isActive: classRecord.isActive,
      createdAt: classRecord.createdAt,
    };
  }

  /**
   * 아카데미 수업 생성 (아카데미 감독만)
   */
  async createAcademyClass(
    directorUserId: string,
    academyId: string,
    createDto: CreateClassDto,
  ) {
    // 아카데미 존재 + 감독 권한 확인
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
    });

    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }

    if (academy.directorId !== directorUserId) {
      // 소속 코치인지 확인
      const academyCoach = await this.prisma.academyCoach.findUnique({
        where: {
          academyId_userId: { academyId, userId: directorUserId },
        },
      });
      if (!academyCoach) {
        throw new ForbiddenException(
          "이 아카데미의 감독 또는 코치만 수업을 생성할 수 있습니다.",
        );
      }
    }

    // orphan 방지: academyId가 반드시 존재해야 함
    if (!academyId) {
      throw new BadRequestException("클럽 또는 아카데미 중 하나는 필수입니다.");
    }

    // 시간 검증
    if (
      createDto.startTime &&
      createDto.endTime &&
      new Date(createDto.startTime) >= new Date(createDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(createDto.daySchedules, createDto.dateSchedules);

    // [2026-08-04] 공개범위 검증 — SELECTED_TEAMS 는 노출 팀이 최소 1개 필요.
    assertVisibilitySelection(createDto.visibility, createDto.visibleTeamIds);

    // [2026-08-04] 지역 조합 검증 — "부산 강남구" 같은 불가능한 조합 차단.
    //   DTO 는 값 자체만 보므로(시군구 이름은 시/도 간 중복이 많다) 조합은 여기서 본다.
    assertClassRegion(createDto.regionCity, createDto.regionDistrict);

    // 카테고리 자동 계산
    let category = createDto.category;
    if (!category && (createDto.ageMin || createDto.ageMax)) {
      if (createDto.ageMax && createDto.ageMax <= 12) category = "KIDS";
      else if (
        createDto.ageMin &&
        createDto.ageMin >= 13 &&
        createDto.ageMax &&
        createDto.ageMax <= 18
      )
        category = "JUNIOR";
      else if (createDto.ageMin && createDto.ageMin >= 19) category = "ADULT";
    }

    // [2026-05-13] 배정 코치 정합 검증 — 팀 createClass 패턴을 학원 도메인으로 이식.
    //   - 학원 코치: AcademyCoach.where({ academyId, userId }) 매핑
    //   - 학원 감독(directorId) 본인도 배정 가능 (별도 AcademyCoach 행 없을 수 있음)
    //   - 둘 중 하나라도 해당하면 통과.
    //   1번째 = LEAD, 나머지 = ASSISTANT. coachUserIds 비어있으면 createDto.coachId 또는 학원 감독(academy.directorId) 폴백.
    const assignedCoachUserIds: string[] = [];
    if (createDto.coachUserIds && createDto.coachUserIds.length > 0) {
      const validAcademyCoaches = await this.prisma.academyCoach.findMany({
        where: {
          academyId,
          userId: { in: createDto.coachUserIds },
          isActive: true,
        },
        select: { userId: true },
      });
      const validSet = new Set<string>([
        ...validAcademyCoaches.map((c) => c.userId),
        // 감독 본인도 배정 가능 (위에서 academy 조회 완료, directorId 확정)
        academy.directorId,
      ]);
      for (const uid of createDto.coachUserIds) {
        if (validSet.has(uid)) assignedCoachUserIds.push(uid);
      }
    }
    const primaryCoachId =
      assignedCoachUserIds[0] || createDto.coachId || academy.directorId;

    // 수업 + 수강료 상품을 원자적으로 생성 — 중간 실패 시 가격 없는 좀비 수업 방지
    // schedulesCreated 는 트랜잭션 내부에서 setting 후 응답 객체로 노출 (운영자 즉시 피드백용)
    // [2026-06-05] daySchedules 대표값 산출 (학원 도메인 — lesson 전용)
    const hasDaySchedulesAcademy = (createDto.daySchedules?.length ?? 0) > 0;
    const representativeAcademy = hasDaySchedulesAcademy
      ? deriveRepresentative(createDto.daySchedules)
      : null;
    const dayTimeMapAcademy = hasDaySchedulesAcademy
      ? buildDayTimeMap(createDto.daySchedules)
      : new Map();

    let schedulesCreated = 0;
    const classRecord = await this.prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          teamId: null,
          academyId,
          className: createDto.className,
          description: createDto.description,
          instructorName: createDto.instructorName ?? "",
          capacity: createDto.capacity ?? 0,
          targetBirthYears: createDto.targetBirthYears ?? [],
          // targetBirthYears(SoT) 가 있으면 ageMin/ageMax 는 한국나이 파생값으로 기록,
          //   없으면 기존 ageMin/ageMax 값을 그대로 유지(하위호환 — 구 폼/타 화면 대응).
          ...(createDto.targetBirthYears &&
          createDto.targetBirthYears.length > 0
            ? this.deriveAgeRangeFromBirthYears(createDto.targetBirthYears)
            : { ageMin: createDto.ageMin, ageMax: createDto.ageMax }),
          levelRequired: createDto.levelRequired,
          // daySchedules 있으면 대표값, 없으면 기존 단일 경로(하위호환)
          startTime:
            representativeAcademy?.startTime ??
            (createDto.startTime ? new Date(createDto.startTime) : new Date()),
          endTime:
            representativeAcademy?.endTime ??
            (createDto.endTime ? new Date(createDto.endTime) : new Date()),
          trainingType: createDto.trainingType ?? "lesson",
          coachId: primaryCoachId,
          venueId:
            representativeAcademy?.venueId !== undefined
              ? (representativeAcademy.venueId ?? null)
              : (createDto.venueId ?? null),
          classDays:
            representativeAcademy?.classDays ?? createDto.classDays ?? [],
          category,
          requiredCoaches: createDto.requiredCoaches ?? 1,
          // 결제 방식 — 감독 지정 (PREPAID 선불 / POSTPAID 후불). DTO 필수라 폴백 없음.
          billingMode: createDto.billingMode,
          // [2026-08-04] 공개 범위 — 미전송 시 TEAM_ONLY.
          //   기존 /classes 목록의 오픈클래스 노출(2026-06-29 정책 — PARENT 에게 팀 무관)은
          //   getAllClasses 가 그대로 유지하므로 이 값과 무관하다.
          //   전국 탐색(/classes/explore)에 띄우려면 감독이 PARENTS_ONLY 이상을 명시 선택해야 한다.
          visibility: createDto.visibility ?? ClassVisibility.TEAM_ONLY,
          // [2026-08-04] 수업 지역 — 오픈클래스도 동일. 아카데미 주소와 별개로 수업 단위 저장.
          regionCity: createDto.regionCity ?? null,
          regionDistrict: createDto.regionDistrict ?? null,
          approvalStatus: "APPROVED",
          approvedAt: new Date(),
          approvedBy: directorUserId,
          isActive: true,
        },
      });

      // [2026-06-05] ClassDaySchedule 행 생성 (daySchedules 전송 시)
      if (
        hasDaySchedulesAcademy &&
        createDto.daySchedules &&
        createDto.daySchedules.length > 0
      ) {
        await tx.classDaySchedule.createMany({
          data: createDto.daySchedules.map((ds) => ({
            classId: created.id,
            dayOfWeek: ds.dayOfWeek,
            startTime: ds.startTime,
            endTime: ds.endTime,
            venueId: ds.venueId ?? null,
          })),
          skipDuplicates: true,
        });
      }

      // [2026-06-09] 오픈클래스 날짜별 일정(dateSchedules) → ClassSchedule 직접 생성.
      //   미니달력으로 입력한 날짜/시간/장소를 그대로 저장. (요일 기반 자동 생성과 배타적)
      if (createDto.dateSchedules && createDto.dateSchedules.length > 0) {
        await tx.classSchedule.createMany({
          data: createDto.dateSchedules.map((s) => ({
            classId: created.id,
            scheduledDate: dateOnlyToUtc(s.date),
            startTime: s.startTime,
            endTime: s.endTime,
            venueId: s.venueId ?? null,
          })),
        });
      }

      // [2026-05-13] 오픈클래스 수업 일정 자동 일괄 생성 — 팀 정규와 동일 패턴.
      // [2026-06-05] daySchedules 있으면 요일별 시각 적용, 없으면 기존 단일 startTime 경로(하위호환).
      //   - autoGenerateSchedules=true(또는 미전송) + startDate/endDate/effectiveClassDays 모두 있을 때
      //   - 안전 상한 200건
      //   - 4개 필드 중 누락 시 명시적 logger.warn 사유 기록 (silent skip 제거)
      //   - 응답 객체에 schedulesCreated 카운트 포함 → 운영자가 폼 누락 즉시 인지 가능
      const effectiveClassDaysAcademy =
        representativeAcademy?.classDays ?? createDto.classDays;
      if (createDto.dateSchedules && createDto.dateSchedules.length > 0) {
        // [2026-06-09] 날짜별 일정으로 ClassSchedule 직접 생성됨 — 요일 기반 자동 생성 스킵.
      } else if (createDto.autoGenerateSchedules === false) {
        this.logger.warn(
          `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — autoGenerateSchedules=false (사용자 선택)`,
        );
      } else {
        const missingFields: string[] = [];
        if (!createDto.startDate) missingFields.push("startDate");
        if (!createDto.endDate) missingFields.push("endDate");
        if (!effectiveClassDaysAcademy?.length) missingFields.push("classDays");
        if (!hasDaySchedulesAcademy && !createDto.startTime)
          missingFields.push("startTime");

        if (missingFields.length > 0) {
          this.logger.warn(
            `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 누락 필드: ${missingFields.join(", ")}`,
          );
        } else {
          // 검증용 파싱 — 서버 TZ 의존 제거(UTC 자정 기준, 날짜 유효성·역전 비교만 사용)
          const start = dateOnlyToUtc(createDto.startDate!);
          const end = dateOnlyToUtc(createDto.endDate!);
          if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
            this.logger.warn(
              `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 잘못된 날짜 범위 (start=${createDto.startDate}, end=${createDto.endDate})`,
            );
          } else {
            const dayMap: Record<string, number> = {
              일: 0,
              월: 1,
              화: 2,
              수: 3,
              목: 4,
              금: 5,
              토: 6,
            };
            const dowToNameAcademy: Record<number, string> = {
              0: "일",
              1: "월",
              2: "화",
              3: "수",
              4: "목",
              5: "금",
              6: "토",
            };
            const targetDows = new Set(
              effectiveClassDaysAcademy!
                .map((d) => dayMap[d])
                .filter((v) => v !== undefined),
            );
            if (targetDows.size === 0) {
              this.logger.warn(
                `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 유효한 요일 없음 (classDays=${JSON.stringify(effectiveClassDaysAcademy)})`,
              );
            } else {
              // 회차 시각 — 요일 규칙 > dto 단일 startTime/endTime(naive ISO → UTC 추출).
              //   회차 row 의 startTime/endTime(text) 필드에 직접 저장해 "시간 없는 회차"
              //   생성 경로를 차단한다 (대표값 폴백에 기대지 않도록).
              const pad2 = (n: number) => String(n).padStart(2, "0");
              const fallbackDtAcademy = createDto.startTime
                ? new Date(createDto.startTime)
                : null;
              const fallbackEndDtAcademy = createDto.endTime
                ? new Date(createDto.endTime)
                : null;
              const fallbackStartHHmm = fallbackDtAcademy
                ? `${pad2(fallbackDtAcademy.getUTCHours())}:${pad2(fallbackDtAcademy.getUTCMinutes())}`
                : null;
              const fallbackEndHHmm = fallbackEndDtAcademy
                ? `${pad2(fallbackEndDtAcademy.getUTCHours())}:${pad2(fallbackEndDtAcademy.getUTCMinutes())}`
                : null;

              const candidateRows: {
                scheduledDate: Date;
                startTime: string | null;
                endTime: string | null;
                venueId: string | null;
              }[] = [];
              // scheduledDate(@db.Date)는 UTC 자정 규약 — UTC 기준으로 순회·저장.
              const cursor = dateOnlyToUtc(createDto.startDate!);
              const cursorEnd = dateOnlyToUtc(createDto.endDate!);
              while (cursor <= cursorEnd && candidateRows.length <= 200) {
                const dow = cursor.getUTCDay();
                if (targetDows.has(dow)) {
                  const dayName = dowToNameAcademy[dow];
                  const entry =
                    hasDaySchedulesAcademy && dayName
                      ? dayTimeMapAcademy.get(dayName)
                      : undefined;
                  candidateRows.push({
                    scheduledDate: new Date(cursor),
                    startTime: entry
                      ? `${pad2(entry.startHH)}:${pad2(entry.startMM)}`
                      : fallbackStartHHmm,
                    endTime: entry
                      ? `${pad2(entry.endHH)}:${pad2(entry.endMM)}`
                      : fallbackEndHHmm,
                    venueId: entry?.venueId ?? createDto.venueId ?? null,
                  });
                }
                cursor.setUTCDate(cursor.getUTCDate() + 1);
              }

              if (candidateRows.length > 200) {
                throw new BadRequestException(
                  "한 번에 생성 가능한 일정은 최대 200건입니다.",
                );
              }

              if (candidateRows.length > 0) {
                const result = await tx.classSchedule.createMany({
                  data: candidateRows.map((row) => ({
                    classId: created.id,
                    ...row,
                  })),
                });
                schedulesCreated = result.count;
                this.logger.log(
                  `[AcademyClass:${created.id}] schedule 자동 생성 OK — ${schedulesCreated}건 (${createDto.startDate}~${createDto.endDate}, ${createDto.classDays!.join("/")})`,
                );
              } else {
                this.logger.warn(
                  `[AcademyClass:${created.id}] schedule 자동 생성 SKIP — 기간 내 요일 매칭 0건`,
                );
              }
            }
          }
        }
      }

      // [2026-05-13] 배정 코치 ClassCoachAssignment 자동 생성 (status: ACCEPTED).
      //  - 1번째 = LEAD, 나머지 = ASSISTANT
      //  - 팀 createClass 패턴 이식
      if (assignedCoachUserIds.length > 0) {
        const now = new Date();
        await tx.classCoachAssignment.createMany({
          data: assignedCoachUserIds.map((userId, idx) => ({
            classId: created.id,
            coachUserId: userId,
            invitedBy: directorUserId,
            role: idx === 0 ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }

      // [2026-05-15 → 2026-08-04] 노출 팀 지정 — visibility=SELECTED_TEAMS 일 때만 생성.
      //   여기 등록된 팀의 소속자(감독·코치·학부모·학생)에게만 이 수업이 노출된다.
      //   존재하지 않거나 비활성인 teamId 는 헬퍼가 사전 필터로 걸러낸다.
      if (createDto.visibility === ClassVisibility.SELECTED_TEAMS) {
        await this.replaceClassTeamVisibilities(
          tx,
          created.id,
          createDto.visibleTeamIds ?? [],
        );
      }

      // [Lifecycle v4.1 §9.3] 첫 수업 생성 = 첫 일정 달 자동 승인.
      //   일정 생성 경로(dateSchedules 직접 입력·요일 자동 생성)와 무관하게
      //   tx 안에서 생성된 첫 비취소 일정의 달을 salesOpenMonth 로 기록.
      //   일정 없이 생성된 수업은 null 유지 → 파생 판정상 "일정 등록 대기".
      const firstSched = await tx.classSchedule.findFirst({
        where: { classId: created.id, isCancelled: false },
        orderBy: { scheduledDate: "asc" },
        select: { scheduledDate: true },
      });
      if (firstSched) {
        await tx.class.update({
          where: { id: created.id },
          data: { salesOpenMonth: utcMonthStart(firstSched.scheduledDate) },
        });
      }

      // [가격 잠금 §3-7] 상품 생성은 첫 일정 산출 뒤 — 신규 MONTHLY_FIXED 는 첫 일정의
      //   달(= salesOpenMonth 로 기록되는 그 달)을 귀속월로 기록한다. 일정 없는 수업의
      //   월 정액 요청은 fail-fast 400 (같은 tx 라 부분 반영 없음 — 월 정액 미요청이면
      //   일정 없는 수업 생성은 기존대로 허용).
      if (createDto.singlePrice || createDto.monthlyPrice) {
        const products = buildClassProducts(created.id, {
          ...createDto,
        });
        if (products.length > 0) {
          const firstScheduleMonth = firstSched
            ? utcMonthStart(firstSched.scheduledDate)
            : null;
          const data = products.map((p) =>
            p.feeType === "MONTHLY_FIXED"
              ? {
                  ...p,
                  billingMonth: resolveNewProductBillingMonth({
                    firstScheduleMonth,
                  }),
                }
              : p,
          );
          await tx.classProduct.createMany({ data });
        }
      }

      return created;
    });

    // [2026-05-13] 배정된 코치에게 "수업 배정 알림" 발송 (등록자 본인 제외).
    //  - 팀 createClass line 273~302 패턴 이식
    const notifyTargets = assignedCoachUserIds.filter(
      (uid) => uid !== directorUserId,
    );
    if (notifyTargets.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: directorUserId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "ACADEMY_DIRECTOR"
          ? "감독"
          : inviter?.userType === "DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: notifyTargets.map((userId) => ({
          userId,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${classRecord.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    return {
      id: classRecord.id,
      academyId: classRecord.academyId,
      className: classRecord.className,
      instructorName: classRecord.instructorName,
      capacity: classRecord.capacity,
      startTime: classRecord.startTime,
      endTime: classRecord.endTime,
      isActive: classRecord.isActive,
      schedulesCreated,
      createdAt: classRecord.createdAt,
    };
  }

  /**
   * 대상 출생연도 목록(SoT) → ageMin/ageMax(한국나이) 파생값.
   *  한국나이(age.util.ts §) = currentYear - birthYear + 1.
   *   · ageMin = 가장 어린 나이 = currentYear - max(birthYear) + 1
   *   · ageMax = 가장 많은 나이 = currentYear - min(birthYear) + 1
   *  빈 배열 → { null, null } (전 연령 대상 = 제한 없음).
   */
  private deriveAgeRangeFromBirthYears(birthYears?: number[] | null): {
    ageMin: number | null;
    ageMax: number | null;
  } {
    if (!Array.isArray(birthYears) || birthYears.length === 0) {
      return { ageMin: null, ageMax: null };
    }
    const currentYear = new Date().getFullYear();
    const ages = birthYears.map((y) => currentYear - y + 1);
    return { ageMin: Math.min(...ages), ageMax: Math.max(...ages) };
  }

  /**
   * 뷰어(PARENT=자녀 합집합 / CHILD·TEEN=본인)의 출생연도 집합.
   *  나이 SoT 는 birthDate (age.util.ts §) — ChildProfile.birthDate 우선, 없으면 User.birthDate 폴백.
   *  반환 빈 배열 = 생년 정보 없음 → 호출부에서 연령 필터 미적용(전체 노출).
   */
  private async resolveViewerBirthYears(
    user: JwtUserPayload,
    childId?: string,
  ): Promise<number[]> {
    let userIds: string[] = [];
    if (user.userType === "PARENT") {
      if (childId) {
        // [2026-06-29] 선택 자녀 스코프 — 본인 자녀 검증(IDOR) 후 그 자녀만의 출생연도로
        //   연령 대상을 판정한다. childId 미지정(자녀 미선택) 시에만 전체 자녀 합집합.
        const owned = await this.prisma.parentChild.findFirst({
          where: { parentId: user.id, childId },
          select: { childId: true },
        });
        userIds = owned ? [childId] : [];
      } else {
        const pcs = await this.prisma.parentChild.findMany({
          where: { parentId: user.id },
          select: { childId: true },
        });
        userIds = pcs.map((p) => p.childId);
      }
    } else if (user.userType === "CHILD" || user.userType === "TEEN") {
      userIds = [user.id];
    }
    if (userIds.length === 0) return [];

    const found = new Map<string, Date>();
    const profiles = await this.prisma.childProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, birthDate: true },
    });
    profiles.forEach((p) => p.birthDate && found.set(p.userId, p.birthDate));
    const missing = userIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: missing } },
        select: { id: true, birthDate: true },
      });
      users.forEach((u) => u.birthDate && found.set(u.id, u.birthDate));
    }

    const years = new Set<number>();
    found.forEach((d) => {
      const y = new Date(d).getFullYear();
      if (!Number.isNaN(y)) years.add(y);
    });
    return Array.from(years);
  }

  /**
   * 전체 수업 목록 조회 (클럽 무관)
   *
   * 학부모(PARENT) 토큰일 때는 본인 소속 팀의 수업만 반환한다.
   * - 가입 시 teamCode 필수 + TeamMember(approved, PARENT) 즉시 생성 (auth.service §학부모 가입)
   * - 따라서 정상 가입한 학부모는 항상 1개 이상의 teamId 보유
   * - teamIds 비어 있으면 정합성 깨진 극단 케이스 → 빈 결과 반환 (오인 노출 차단)
   *
   * [2026-05-15] 오픈클래스(academyId) 노출 제한:
   * - ADMIN 외 사용자는 ClassTeamVisibility 에 본인 소속 팀이 등록된 오픈클래스만 본다.
   * - 오픈클래스 감독이 "블리자드/타이탄스" 선택 → 그 팀 소속자(감독·코치·학부모·학생)만 노출.
   */
  async getAllClasses(query: GetClassesQueryDto, user?: JwtUserPayload) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // [2026-05-15] 오픈클래스 노출 제한 — ADMIN 외 사용자는 본인 소속 팀이
    //  ClassTeamVisibility 에 등록된 오픈클래스만 볼 수 있다.
    //  isAdmin → undefined (제한 없음) / 그 외 → 소속 팀 ID 배열
    const isAdmin = user?.userType === "ADMIN";
    // childId 지정 시(학부모 자녀 선택) 해당 자녀 소속 팀으로만 좁힘.
    // includePendingChildTeams — 가입 승인 대기 자녀도 신청한 팀의 훈련을 "열람"만 할 수 있게.
    //   등록·결제는 createEnrollment 의 approved 가드가 계속 막는다(§4.5 + BR-12).
    //   PARENT 자녀 경유 경로에만 적용되며 COACH/DIRECTOR/CHILD/TEEN 판정에는 영향 없다.
    const viewerTeamIds =
      user && !isAdmin
        ? await resolveViewerTeamIds(this.prisma, user.id, user.userType, {
            childId: query.childId,
            includePendingChildTeams: true,
          })
        : null;
    // 오픈클래스(academyId) WHERE 조건.
    //  [2026-06-29] 정책 변경 — 오픈클래스는 "학부모에게만 + 자녀 연령 매칭" 전체 노출.
    //    팀 단위 ClassTeamVisibility 게이트 폐지. (연령 필터는 아래 where.AND 의 targetBirthYears 가 담당)
    //  · ADMIN — 전체 오픈클래스
    //  · ACADEMY_DIRECTOR — 본인이 운영하는 academy 의 수업만
    //  · PARENT — 전체 오픈클래스(연령 매칭) 노출, 팀 소속 무관
    //  · COACH/DIRECTOR/CHILD/TEEN — 브라우즈 목록에서 제외(오픈클래스는 학부모 전용·ACADEMY_DIRECTOR 관리).
    //    신청 자녀의 일정은 enrollment 기반 캘린더가 별도로 노출하므로 영향 없음.
    const openClassWhere: Prisma.ClassWhereInput = isAdmin
      ? { academyId: { not: null } }
      : user?.userType === "ACADEMY_DIRECTOR"
        ? {
            academyId: { not: null },
            academy: { directorId: user.id },
          }
        : user?.userType === "PARENT"
          ? { academyId: { not: null } }
          : // never-match: COACH/DIRECTOR/CHILD/TEEN/비로그인 은 오픈클래스 브라우즈 제외
            { academyId: { not: null }, id: { in: [] } };

    // 상위 분류(category) 분기 — FE class-categories SoT 와 정합.
    //  - regular : 클럽 정규 수업 (teamId 있음, academyId 없음)
    //  - open    : 아카데미 오픈클래스 (academyId 있음 + 노출 팀 매칭)
    //  - 미지정  : 전체 (regular + open)
    const where: Prisma.ClassWhereInput = {
      approvalStatus: "APPROVED",
      // [추가 2026-05-15] 비활성 수업(isActive=false) 은 수업목록 노출 제외.
      //   감독이 수업 비활성화한 경우(또는 검증용 임시 수업)가 목록에 새지 않도록 가드.
      isActive: true,
      // [Lifecycle v4.1 §7.1] "정규" 필터 = regular + spot 포함 — spot 은 정규훈련의
      //   1회용 하위 옵션이라 일치 비교로 두면 목록에서 누락된다 (설계가 지목한 유일 실수 포인트).
      ...(query.trainingType &&
        (query.trainingType === "regular"
          ? { trainingType: { in: ["regular", "spot"] } }
          : { trainingType: query.trainingType })),
      ...(query.category === "regular" && {
        teamId: { not: null },
        academyId: null,
      }),
      ...(query.category === "open" && openClassWhere),
    };

    // [2026-08-04 공개범위 상시 병합] 전체공개(PUBLIC)·학부모공개(PARENTS_ONLY) 타 팀 수업을
    //   소속 팀과 무관하게 학부모/학생 목록에 항상 노출한다 (사용자 지시: "전체공개는 다
    //   보이게, 비공개일 때만 숨기고, 팀원공개는 팀원이 목록에 들어오면 보이게").
    //   · 게이트는 explore(전국 수업찾기)와 동일한 buildClassVisibilityWhere 단일 SoT —
    //     비소속 뷰어에게는 PUBLIC + PARENTS_ONLY 만, 소속 팀원에게는 TEAM_ONLY(비공개=
    //     우리 팀에만)·SELECTED_TEAMS(지정 팀)까지 열린다.
    //   · 내 팀 branch 와 OR 합집합으로 쓰는 "타 팀 발견" branch 라서:
    //     - trainingType 가드 — 수업 도메인(소문자) + 훈련 도메인(대문자)만 허용.
    //       훈련(대문자)은 기본 TEAM_ONLY 백필이라 visibility 게이트가 차단하고,
    //       감독/코치가 등록 폼에서 전체공개/학부모공개를 명시 선택한 훈련만 통과한다
    //       (2026-08-04 — 훈련 등록 공개범위 입력 지원과 세트).
    //     - endedAt=null — 타 팀의 이미 종료된 수업은 발견 가치가 없다.
    //       (내 팀 branch 는 종료 수업 유지 — '종료된 훈련' 이력 접힘에 필요.)
    //   · 연령(targetBirthYears) 필터는 아래 top-level where.AND 가 모든 branch 에 공통 적용.
    //   CLASS_VISIBILITY_DISABLED — 정책상 이 합집합을 현재 사용하지 않는다(선언은 복원용으로 존치).
    //     전 수업이 비공개(TEAM_ONLY)라 게이트를 통과하는 타 팀 수업이 없고,
    //     목록은 도입 전과 같이 "내 소속 팀 수업"만 보여준다.
    //     아래 두 분기에서 이 상수를 다시 OR 에 넣으면 복원된다.
    //     절차: claudedocs/class-visibility-disable-2026-08-12.md §5
    const externalPublicWhere: Prisma.ClassWhereInput = {
      teamId: { not: null },
      academyId: null,
      endedAt: null,
      trainingType: {
        in: [...CLASSES_DOMAIN_TRAINING_TYPES, ...TRAINING_TYPES],
      },
      AND: [buildClassVisibilityWhere(user, viewerTeamIds ?? [])],
    };
    void externalPublicWhere;

    // 학부모 가드 — 자녀 경유 팀 ID(viewerTeamIds)로 정규수업 필터.
    //  viewerTeamIds 는 resolveViewerTeamIds(..., { childId }) 로 해석되어
    //  childId 지정 시 해당 자녀 소속 팀만, 미지정 시 모든 자녀 팀 합집합.
    //  승인 대기(pending) 신청 팀도 포함 — 목록 열람만 허용(등록은 enrollments 가드가 차단).
    //  [2026-08-04] 팀 스코프 단독 → "내 팀 ∪ 공개범위 허용 타 팀" 합집합으로 확장.
    //  무소속(팀 0)이어도 전체공개 수업은 보이므로 빈 결과 조기 반환하지 않는다.
    if (user?.userType === "PARENT" && query.category !== "open") {
      const teamIds = viewerTeamIds ?? [];
      // CLASS_VISIBILITY_DISABLED — 타 팀 수업 합집합 제외.
      //   'regular' 탭: 내 팀 정규 수업만. '전체' 탭: + 오픈클래스.
      if (query.category === "regular") {
        where.OR = [{ teamId: { in: teamIds } }];
      } else {
        where.OR = [{ teamId: { in: teamIds } }, openClassWhere];
      }
    } else if (
      user &&
      !isAdmin &&
      (user.userType === "CHILD" || user.userType === "TEEN")
    ) {
      // [수정 2026-05-15] CHILD/TEEN — 본인 소속 팀의 정규 수업 + 노출 허용 오픈클래스만.
      //  기존엔 미지정 탭에서 모든 팀 정규수업이 무제한 노출되어, 학생이 다른 팀
      //  (예: test2/나코치) 수업까지 다 보이던 버그. PARENT 와 동일 패턴으로 viewerTeamIds 매칭.
      //  [2026-08-04] 학부모와 동일하게 공개범위 허용 타 팀 수업(externalPublicWhere)도 합집합.
      //  CLASS_VISIBILITY_DISABLED — 타 팀 수업 합집합 제외 (학부모 분기와 동일).
      const studentTeamIds = viewerTeamIds ?? [];
      if (query.category === "regular") {
        where.OR = [{ teamId: { in: studentTeamIds } }];
      } else if (query.category === "open") {
        // openClassWhere 가 이미 visibility 매칭 처리.
      } else {
        // 전체 탭: 본인 팀 수업 OR 노출 오픈클래스.
        where.OR = [{ teamId: { in: studentTeamIds } }, openClassWhere];
      }
    } else if (
      user &&
      !isAdmin &&
      (user.userType === "COACH" || user.userType === "DIRECTOR") &&
      query.category !== "open"
    ) {
      // [2026-05-19] COACH/DIRECTOR — 본인 소속 팀의 정규 수업 + 노출 허용 오픈클래스만.
      //   기존엔 academyId=null OR openClassWhere 라 모든 정규수업이 전부 노출되어
      //   다른 팀 수업까지 다 보이던 버그(예: 임감독 → 모든 팀의 모든 수업).
      //   resolveViewerTeamIds 는 CoachProfile.teamId + Team.coachId=본인 으로 본인 운영 팀 추출.
      const teamIds = viewerTeamIds ?? [];
      if (teamIds.length === 0) {
        return {
          data: [],
          pagination: { total: 0, page, limit, totalPages: 0 },
        };
      }
      if (query.category === "regular") {
        where.teamId = { in: teamIds };
      } else {
        // 전체 탭(category 미지정): 본인 팀 정규 수업 OR 노출 허용 오픈클래스
        where.OR = [{ teamId: { in: teamIds } }, openClassWhere];
      }
    } else if (
      user &&
      !isAdmin &&
      user.userType === "ACADEMY_DIRECTOR" &&
      query.category === undefined
    ) {
      // ACADEMY_DIRECTOR — 본인 academy 의 오픈클래스만 (라인 770-782 academyId/directorId 매칭 활용).
      //   본인 소속 팀이 있으면 그 정규 수업도 함께.
      const teamIds = viewerTeamIds ?? [];
      where.OR =
        teamIds.length > 0
          ? [{ teamId: { in: teamIds } }, openClassWhere]
          : [openClassWhere];
    }

    // [연령 노출 필터] PARENT(자녀 출생연도 합집합)·CHILD·TEEN 은 본인/자녀의
    //   출생연도가 수업의 targetBirthYears 에 포함된 경우에만 노출한다.
    //   · targetBirthYears = [] (전 연령 대상) 수업은 항상 노출.
    //   · 생년 정보가 전혀 없으면(viewerBirthYears 빈 배열) 필터 미적용 → 기존 팀 기반 노출 유지.
    //   · COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN 은 관리 목적이므로 연령 필터 미적용.
    if (
      user &&
      !isAdmin &&
      (user.userType === "PARENT" ||
        user.userType === "CHILD" ||
        user.userType === "TEEN")
    ) {
      const viewerBirthYears = await this.resolveViewerBirthYears(
        user,
        query.childId,
      );
      if (viewerBirthYears.length > 0) {
        const ageFilter: Prisma.ClassWhereInput = {
          OR: [
            { targetBirthYears: { isEmpty: true } },
            { targetBirthYears: { hasSome: viewerBirthYears } },
          ],
        };
        where.AND = Array.isArray(where.AND)
          ? [...where.AND, ageFilter]
          : where.AND
            ? [where.AND, ageFilter]
            : [ageFilter];
      }
    }

    const runList = (listWhere: Prisma.ClassWhereInput) =>
      this.prisma.$transaction([
        this.prisma.class.findMany({
          where: listWhere,
          skip,
          take: limit,
          select: {
            id: true,
            className: true,
            description: true,
            trainingType: true,
            instructorName: true,
            capacity: true,
            ageMin: true,
            ageMax: true,
            targetBirthYears: true,
            levelRequired: true,
            startTime: true,
            endTime: true,
            isActive: true,
            endedAt: true,
            salesOpenMonth: true,
            category: true,
            classDays: true,
            teamId: true,
            academyId: true,
            createdAt: true,
            // [2026-08-04] 수업 지역 — 목록 카드에 "서울 강남구" 표기용.
            //   타지역 학부모가 이동 거리를 모른 채 등록하는 사고 방지(사용자 지시).
            regionCity: true,
            regionDistrict: true,
            team: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                // 지역 미입력(2026-08-04 이전) 수업의 표기 폴백 — 팀 홈링크장 시/도.
                homeVenue: { select: { city: true } },
              },
            },
            // 오픈클래스(teamId=null): 로고 폴백용 대표 이미지 + 카드 subtitle 노출용 아카데미명.
            academy: { select: { imageUrl: true, name: true } },
            coach: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
            // 지역 표기 폴백 2순위 — 수업 장소의 시/도 (regionCity 미입력 구 데이터용).
            venue: { select: { id: true, name: true, city: true } },
            // PACKAGE_WEEKS_SPEC §6 응답 필드 매핑용 — durationDays/sessionsPerMonth/sessionsPerWeek 필수.
            // PACKAGE_END_GUARD (2026-05-22): 대표가 산정 시 활성 패키지 우선 위해 isActive 추가 select.
            products: {
              select: {
                feeType: true,
                price: true,
                durationDays: true,
                sessionsPerMonth: true,
                sessionsPerWeek: true,
                billingMonth: true,
                isActive: true,
              },
            },
            registrations: {
              where: { status: "active" },
              select: { id: true },
            },
            // 2026-05-12: 다중 코치 배정 (LEAD/ASSISTANT)
            coachAssignments: {
              where: { status: "ACCEPTED" },
              select: {
                id: true,
                coachUserId: true,
                role: true,
                coach: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    userType: true,
                    avatarUrl: true,
                  },
                },
              },
              orderBy: [{ role: "asc" }, { respondedAt: "asc" }],
            },
            // 2026-06-05: 요일별 시간·장소 규칙 (ClassDaySchedule) — venue는 id/name만 선택해 응답 최소화
            dayScheduleEntries: {
              select: {
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                venueId: true,
                venue: { select: { id: true, name: true } },
              },
            },
            // [2026-06-09] 오픈클래스 날짜별 일정 — 목록 카드에 실제 일정 날짜 표시용.
            // [2026-06-10] 회차별 실제 시각(startTime/endTime "HH:mm") — 카드 시간 표시용.
            schedules: {
              where: { isCancelled: false },
              select: { scheduledDate: true, startTime: true, endTime: true },
              orderBy: { scheduledDate: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.class.count({ where: listWhere }),
      ]);

    const [classes, total] = await runList(where);

    return {
      data: classes.map((c) => {
        // PACKAGE_WEEKS_SPEC §6 정기 패키지 단위 응답 필드 — FE 카드 가격 라벨 SoT.
        // PACKAGE_END_GUARD (v3 SoT): 대표가는 isActive=true 패키지 우선, 없으면 첫 매칭 폴백.
        //   isClassEnded 는 utils/package-guard.util.ts:isClassEnded() 단일화.
        // [Lifecycle v4.1 §9.2] 대표가 산정도 판매 노출분(승인월+무월)만 — 지난 월분 가격 오염 방지.
        const sellable = filterSellableProducts(
          c.products ?? [],
          c.salesOpenMonth,
        );
        const monthlyProduct =
          sellable.find(
            (p) => p.feeType === "MONTHLY_FIXED" && p.isActive !== false,
          ) ?? sellable.find((p) => p.feeType === "MONTHLY_FIXED");
        const singleProduct =
          sellable.find(
            (p) => p.feeType === "PER_SESSION" && p.isActive !== false,
          ) ?? sellable.find((p) => p.feeType === "PER_SESSION");

        // 수업 종료 판정 — 마지막 비취소 회차 날짜 기준.
        //   기존 isClassEndedUtil(c.endTime)은 대표값 날짜부(등록일 오염)에 의존해 폐기.
        //   회차가 없으면 종료로 보지 않는다(진행중 취급).
        const lastSchedForEnd = c.schedules?.[c.schedules.length - 1];
        const isClassEnded = lastSchedForEnd
          ? lastSchedForEnd.scheduledDate < kstTodayUtcMidnight()
          : false;

        // [Lifecycle v4.1] 파생 상태 SoT (class-lifecycle.util) — 배지 판정 일원화.
        //   isClassEnded(역산)는 BC 용으로 유지, 신규 소비처는 lifecycleStatus 사용.
        const lifecycle = deriveClassLifecycle({
          endedAt: c.endedAt,
          salesOpenMonth: c.salesOpenMonth,
          trainingType: c.trainingType,
          schedules: c.schedules ?? [],
        });

        return {
          ...c,
          // [Lifecycle v4.1 §9.2] ...c 가 실어온 raw products 를 판매 노출분으로 덮어쓰기 —
          //   지난/미래 월분이 응답에 새지 않도록 (대표가 산정과 동일 모집단).
          products: sellable,
          // 수업목록 카드 좌측 아이콘에 팀 프로필(로고) 표시용 — 없으면 프론트가 기본 아이콘 폴백.
          // 오픈클래스는 팀이 없으므로 소속 아카데미 대표 이미지로 폴백.
          teamLogoUrl: c.team?.logoUrl ?? c.academy?.imageUrl ?? null,
          // 오픈클래스만 아카데미명 노출(팀 수업은 academy 없어 null) — 학부모 /classes 카드 subtitle.
          academyName: c.academy?.name ?? null,
          // [2026-08-04 공개범위 상시 병합] 뷰어 소속 팀 수업 여부 — FE 섹션 분리
          //   ('정규훈련' vs '전체공개 수업')와 타 팀 카드의 팀명 표기 분기용.
          //   viewerTeamIds=null(ADMIN 등 무제한 스코프)은 전부 내 스코프로 취급.
          isViewerTeam:
            viewerTeamIds === null ||
            (c.teamId != null && viewerTeamIds.includes(c.teamId)),
          // [2026-08-04] 지역 라벨 "서울 강남구" — 목록 카드 표기 SoT.
          //   수업 지역(감독 선택) > 수업 장소 시/도 > 팀 홈링크장 시/도 순 폴백.
          //   폴백은 2026-08-04 이전 수업(regionCity=null)의 표기 공백을 메우기 위한 것이고,
          //   시군구는 폴백 소스에 없어 시/도까지만 표시된다.
          regionLabel:
            formatRegionLabel(c.regionCity, c.regionDistrict) ??
            c.venue?.city ??
            c.team?.homeVenue?.city ??
            null,
          enrolledCount: c.registrations?.length ?? 0,
          coachAssignments: (c.coachAssignments ?? []).map((a) => ({
            id: a.id,
            coachUserId: a.coachUserId,
            role: a.role,
            coachName:
              `${a.coach?.lastName ?? ""}${a.coach?.firstName ?? ""}`.trim(),
            coachUserType: a.coach?.userType ?? null,
          })),
          singlePrice: singleProduct?.price ?? 0,
          monthlyPrice: monthlyProduct?.price ?? 0,
          packageWeeks: monthlyProduct?.durationDays
            ? Math.max(1, Math.round(monthlyProduct.durationDays / 7))
            : null,
          packageTotalSessions:
            monthlyProduct?.sessionsPerMonth &&
            monthlyProduct.sessionsPerMonth > 0
              ? monthlyProduct.sessionsPerMonth
              : null,
          // "주 N회" 자동 파생 폐기 — classDays 폴백 제거(스냅샷 오염원).
          //   상품에 명시 저장된 값만 전달, 없으면 null(프론트 미표시).
          packageSessionsPerWeek: monthlyProduct?.sessionsPerWeek ?? null,
          isClassEnded,
          lifecycleStatus: lifecycle.state,
          pendingReason: lifecycle.pendingReason,
          // 2026-06-05: 요일별 시간·장소 규칙 — getClass 와 동일 DOW_ORDER 정렬.
          //   없으면 [] — 기존 단일 startTime/endTime/venueId 경로로 폴백 표시.
          daySchedules: (() => {
            const DOW_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
            return (c.dayScheduleEntries ?? [])
              .slice()
              .sort(
                (a, b) =>
                  DOW_ORDER.indexOf(a.dayOfWeek) -
                  DOW_ORDER.indexOf(b.dayOfWeek),
              )
              .map((ds) => ({
                dayOfWeek: ds.dayOfWeek,
                startTime: ds.startTime,
                endTime: ds.endTime,
                venueId: ds.venueId ?? null,
                venueName: ds.venue?.name ?? null,
              }));
          })(),
          // [2026-06-09] 오픈클래스 날짜별 일정(ISO) — 카드에 실제 일정 날짜 표시.
          scheduledDates: (c.schedules ?? []).map((s) =>
            s.scheduledDate.toISOString(),
          ),
          // [2026-06-10] 오픈클래스 카드 시간 — 첫 회차 실제 시각("HH:mm - HH:mm").
          //   Class.startTime/endTime 은 회차 시각이 아니므로(등록/회차판정용) 부적합.
          scheduleTimeLabel: (() => {
            const f = c.schedules?.[0] as
              | { startTime?: string | null; endTime?: string | null }
              | undefined;
            if (!f?.startTime) return null;
            return f.endTime ? `${f.startTime} - ${f.endTime}` : f.startTime;
          })(),
          // 다음 회차 (비취소·오늘 이후) — 요일 규칙 없는 수업 카드의 날짜(+회차 시간) 표시용.
          nextSchedule: (() => {
            const sdToday = kstTodayUtcMidnight();
            const n = (c.schedules ?? []).find(
              (s) => s.scheduledDate >= sdToday,
            );
            return n
              ? {
                  scheduledDate: n.scheduledDate.toISOString(),
                  startTime: n.startTime ?? null,
                  endTime: n.endTime ?? null,
                }
              : null;
          })(),
        };
      }),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 수업 상세 조회 (classId)
   */
  async getClassById(classId: string, requester?: JwtUserPayload) {
    return this.getClass(classId, requester);
  }

  /**
   * 매니저 역할(COACH/DIRECTOR/ACADEMY_DIRECTOR)의 수업 접근 권한 가드.
   *
   * 본인 소속이 아닌 팀/오픈클래스 수업 진입을 차단한다. ADMIN 및 PARENT/CHILD/TEEN 은
   * 통과 (학부모 결제 검토·오픈클래스 영업 흐름 보존). 회의록 2026-05-15 정합.
   *
   * 검증 경로:
   *  - 팀 수업: Team.coachId(owner) OR TeamMember(승인 코치/매니저)
   *  - 오픈클래스: Academy.directorId OR AcademyCoach(active)
   *
   * [보안 수정 2026-05-21] CoachProfile 경로 제거. 가입 시 pending 과 함께 자동 생성되어
   *  pending coach 가 다른 팀 수업까지 접근하던 결함. owner 또는 approved 멤버만 통과.
   */
  private async assertClassAccessForManager(
    classRecord: { teamId: string | null; academyId: string | null },
    requester: JwtUserPayload,
  ): Promise<void> {
    const role = requester.userType;
    if (role === "ADMIN") return;
    if (!["COACH", "DIRECTOR", "ACADEMY_DIRECTOR"].includes(role)) return;

    const { teamId, academyId } = classRecord;

    if (teamId) {
      const [ownedTeam, approvedMember] = await Promise.all([
        this.prisma.team.findFirst({
          where: { id: teamId, coachId: requester.id },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId: requester.id,
            teamId,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { id: true },
        }),
      ]);
      if (ownedTeam || approvedMember) return;
    }

    if (academyId) {
      const academy = await this.prisma.academy.findUnique({
        where: { id: academyId },
        select: { directorId: true },
      });
      if (academy?.directorId === requester.id) return;

      const academyCoach = await this.prisma.academyCoach.findUnique({
        where: { academyId_userId: { academyId, userId: requester.id } },
        select: { isActive: true },
      });
      if (academyCoach?.isActive) return;
    }

    throw new ForbiddenException("이 수업에 접근할 권한이 없습니다.");
  }

  /**
   * 수업 조회
   */
  async getClass(classId: string, requester?: JwtUserPayload) {
    // scheduledDate(@db.Date) 경계 — KST 오늘의 UTC 자정. 이후 upcoming 일정 필터에만 사용.
    const today = kstTodayUtcMidnight();

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coach: {
              select: { firstName: true, lastName: true, avatarUrl: true },
            },
          },
        },
        // 오픈클래스(teamId=null) 로고 폴백용 — 소속 아카데미 대표 이미지.
        academy: { select: { imageUrl: true } },
        coach: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        schedules: {
          where: { scheduledDate: { gte: today } },
          select: { id: true, scheduledDate: true, isCancelled: true },
          orderBy: { scheduledDate: "asc" },
          take: 10,
        },
        // spot 자동 종료 파생용 — 위 schedules(오늘 이후만)로는 과거 일정 유무를 알 수 없어
        //   비취소 전체 카운트를 별도 제공 (목록 API 와 lifecycleStatus 판정 일치 보장).
        _count: {
          select: { schedules: { where: { isCancelled: false } } },
        },
        products: {
          select: {
            id: true,
            productName: true,
            description: true,
            price: true,
            sessionsPerMonth: true,
            durationDays: true,
            // 결제 플로우에서 feeType 분기 및 PER_SESSION 가격 계산에 필수
            feeType: true,
            feePerSession: true,
            sessionsPerWeek: true,
            billingTiming: true,
            billingMonth: true,
            isActive: true,
          },
        },
        registrations: {
          where: { status: "active" },
          select: {
            id: true,
            userId: true,
            status: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userType: true,
                koreanAge: true,
              },
            },
          },
        },
        waitlists: {
          select: { id: true },
        },
        // 2026-05-12: ClassCoachAssignment (다중 코치 배정)
        coachAssignments: {
          where: { status: "ACCEPTED" },
          select: {
            id: true,
            coachUserId: true,
            role: true,
            respondedAt: true,
            coach: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                userType: true,
              },
            },
          },
          orderBy: [{ role: "asc" }, { respondedAt: "asc" }],
        },
        // 2026-05-15: 오픈클래스 노출 팀 — 수정 화면에서 기존 선택값 표시용
        teamVisibilities: {
          select: {
            teamId: true,
            team: { select: { id: true, name: true, teamCode: true } },
          },
        },
        // 2026-06-05: 요일별 시간·장소 규칙 (ClassDaySchedule)
        dayScheduleEntries: {
          include: {
            venue: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!classRecord) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // 매니저 역할(COACH/DIRECTOR/ACADEMY_DIRECTOR) 의 비소속 수업 접근 차단.
    // requester 미전달은 레거시 호출 경로(테스트·내부 헬퍼) — 통과.
    if (requester) {
      await this.assertClassAccessForManager(
        { teamId: classRecord.teamId, academyId: classRecord.academyId },
        requester,
      );
    }

    // [추가 2026-05-15] 결제이력(paid Enrollment) 카운트 — 기존 UI 표시용.
    // [추가 2026-06-29] deletable — 삭제 가능 여부(B안). countClassBlockingRefs 헬퍼로
    //   유효 신청/크레딧/후불청구/출석 4종이 모두 0 일 때만 삭제 허용. 가드와 동일 기준.
    const [paidEnrollmentCount, blockingRefCount] = await Promise.all([
      this.prisma.enrollment.count({
        where: { classId, status: "paid" },
      }),
      this.countClassBlockingRefs(classId),
    ]);
    const deletable = blockingRefCount === 0;

    const coachName = classRecord.coach
      ? `${classRecord.coach.lastName ?? ""}${classRecord.coach.firstName ?? ""}`.trim() ||
        classRecord.coach.email
      : classRecord.team && classRecord.team.coach
        ? `${classRecord.team.coach.lastName ?? ""}${classRecord.team.coach.firstName ?? ""}`.trim()
        : classRecord.instructorName;

    return {
      id: classRecord.id,
      teamId: classRecord.teamId ?? null,
      academyId: classRecord.academyId ?? null,
      className: classRecord.className,
      description: classRecord.description,
      // 승인 상태는 프론트 ApprovalBanner 렌더링에 필수 — 누락 시 기본 경고 fallback 유발
      approvalStatus: classRecord.approvalStatus,
      rejectionReason: classRecord.rejectionReason,
      approvedAt: classRecord.approvedAt,
      trainingType: classRecord.trainingType,
      instructorName: classRecord.instructorName,
      capacity: classRecord.capacity,
      ageMin: classRecord.ageMin,
      ageMax: classRecord.ageMax,
      targetBirthYears: classRecord.targetBirthYears,
      levelRequired: classRecord.levelRequired,
      startTime: classRecord.startTime,
      endTime: classRecord.endTime,
      isActive: classRecord.isActive,
      // [Phase B] 결제 방식 — 프론트 후불/선불 등록 분기에 필수.
      billingMode: classRecord.billingMode,
      // [2026-08-04] 공개 범위 — 수정 폼 prefill 에 필수(미포함 시 저장할 때마다 기본값으로 덮임).
      visibility: classRecord.visibility,
      // [2026-08-04] 수업 지역 — 수정 폼 prefill + 상세 화면 표기.
      //   regionLabel 은 "서울 강남구" 조합 문자열(프론트 3곳이 같은 포맷을 쓰도록 서버에서 만든다).
      regionCity: classRecord.regionCity,
      regionDistrict: classRecord.regionDistrict,
      regionLabel: formatRegionLabel(
        classRecord.regionCity,
        classRecord.regionDistrict,
      ),
      category: classRecord.category,
      classDays: classRecord.classDays ?? [],
      coachId: classRecord.coachId,
      coachName,
      coachProfileImage: null,
      venueId: classRecord.venue?.id ?? null,
      venueName: classRecord.venue?.name ?? null,
      venueAddress: classRecord.venue?.address ?? null,
      venueLatitude: classRecord.venue?.latitude
        ? Number(classRecord.venue.latitude)
        : null,
      venueLongitude: classRecord.venue?.longitude
        ? Number(classRecord.venue.longitude)
        : null,
      currentEnrollment: classRecord.registrations?.length ?? 0,
      // [추가 2026-05-13] 명단관리용 — 배치된 학생 목록 (ClassRegistration active).
      //  결제 흐름(Enrollment) 과 별개. 코치가 직접 배치한 학생도 여기에 포함된다.
      enrollments: (classRecord.registrations ?? []).map((r) => ({
        id: r.id,
        userId: r.userId,
        status: r.status,
        userName:
          `${r.user?.lastName ?? ""}${r.user?.firstName ?? ""}`.trim() || "",
      })),
      waitlistCount: classRecord.waitlists?.length ?? 0,
      // 오픈클래스는 팀이 없으므로 소속 아카데미 대표 이미지로 폴백.
      teamLogoUrl:
        classRecord.team?.logoUrl ?? classRecord.academy?.imageUrl ?? null,
      club: classRecord.team
        ? { id: classRecord.team.id, name: classRecord.team.name }
        : null,
      schedules: classRecord.schedules ?? [],
      paidEnrollmentCount,
      // [추가 2026-06-29] 삭제 가능 여부 — 프론트(useClassForm) 삭제 버튼 비활성/사유 안내용.
      deletable,
      // PACKAGE_END_GUARD (v3 · SoT 단일화 2026-05-22):
      //   classes/utils/package-guard.util.ts:computePackageGuardMeta() 호출로 메타 주입.
      //   shouldHideInactiveFor(requester?.userType) — PARENT/CHILD/TEEN 비활성 제외.
      products: (() => {
        // classEndDate 메타 — 대표값(Class.endTime)은 날짜부가 등록일로 오염되어 폐기(null 고정).
        //   차단 로직은 isActive 만 사용(수업 종료일 기반 차단 폐기)·FE 실사용 0건 확인.
        // [Lifecycle v4.1 §9.2] 판매 노출 = 현재 승인월 분(+무월 레거시)만 — 지난 월분 자동 숨김.
        const productsWithMeta = filterSellableProducts(
          classRecord.products ?? [],
          classRecord.salesOpenMonth,
        ).map((p) => ({
          ...p,
          ...computePackageGuardMeta(p, null),
        }));
        return shouldHideInactiveFor(requester?.userType)
          ? productsWithMeta.filter((p) => p.isPurchasable !== false)
          : productsWithMeta;
      })(),
      // [Lifecycle v4.1] 파생 상태 — 상세 결제 CTA 분기(학부모 "일정 준비 중")용.
      ...(() => {
        const lc = deriveClassLifecycle({
          endedAt: classRecord.endedAt,
          salesOpenMonth: classRecord.salesOpenMonth,
          trainingType: classRecord.trainingType,
          schedules: (classRecord.schedules ?? []).filter(
            (sch) => !sch.isCancelled,
          ),
          hadAnySchedule: (classRecord._count?.schedules ?? 0) > 0,
        });
        return {
          lifecycleStatus: lc.state,
          pendingReason: lc.pendingReason,
          earliestRemainingMonth:
            lc.earliestRemainingMonth?.toISOString() ?? null,
          // 명시 종료 시점 — [종료 취소] 버튼 분기용 (spot 파생 자동 종료는 endedAt null
          //   이라 취소 대상 아님 — 버튼 분기는 endedAt 기준이어야 정확).
          endedAt: classRecord.endedAt?.toISOString() ?? null,
        };
      })(),
      // 2026-05-12: ClassCoachAssignment 다중 코치 배정 (LEAD/ASSISTANT)
      coachAssignments: (classRecord.coachAssignments ?? []).map((a) => ({
        id: a.id,
        coachUserId: a.coachUserId,
        role: a.role,
        coachName:
          `${a.coach?.lastName ?? ""}${a.coach?.firstName ?? ""}`.trim() ||
          a.coach?.email ||
          "",
        coachEmail: a.coach?.email ?? "",
        coachUserType: a.coach?.userType ?? null,
      })),
      // 2026-05-15: 오픈클래스 노출 팀 목록 — 수정 화면에서 기존 선택값 복원용
      visibleTeams: (classRecord.teamVisibilities ?? []).map((v) => ({
        id: v.team?.id ?? v.teamId,
        name: v.team?.name ?? "",
        teamCode: v.team?.teamCode ?? null,
      })),
      // 2026-06-05: 요일별 시간·장소 규칙 — ClassDaySchedule 행 목록.
      //   없으면 빈 배열 (기존 단일 startTime/endTime/venueId 경로로 폴백 표시).
      daySchedules: (() => {
        const DOW_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
        return (classRecord.dayScheduleEntries ?? [])
          .slice()
          .sort(
            (a, b) =>
              DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
          )
          .map((ds) => ({
            dayOfWeek: ds.dayOfWeek,
            startTime: ds.startTime,
            endTime: ds.endTime,
            venueId: ds.venueId ?? null,
            venueName: ds.venue?.name ?? null,
          }));
      })(),
      createdAt: classRecord.createdAt,
    };
  }

  /**
   * 클럽의 수업 목록 조회 (캐싱 적용 - 5분)
   */
  /**
   * 여러 팀의 수업 목록 일괄 조회 — 팀 목록 화면 전용(어드민 출석 관리).
   *
   * 팀마다 단건 조회를 돌면 요청 수가 팀 수에 비례해 늘어 rate limit 을 소진한다.
   * 응답 모양·필터·팀별 캐시는 getClubClasses 를 그대로 재사용해 화면 표시가 달라지지 않는다.
   */
  async getClassesByTeamIds(
    teamIds: string[],
  ): Promise<Record<string, Awaited<ReturnType<ClassesService["getClubClasses"]>>>> {
    const entries = await Promise.all(
      teamIds.map(
        async (teamId) =>
          [teamId, await this.getClubClasses(teamId)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }

  async getClubClasses(
    teamId: string,
    query?: {
      search?: string;
      category?: string;
      status?: string;
      coachId?: string;
    },
  ) {
    // 필터 파라미터가 있으면 캐시 우회
    const hasFilters =
      query?.search || query?.category || query?.status || query?.coachId;

    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.class;
    const cacheTTL = redisConfig.cacheTTL.classList;
    const cacheKey = `${keyPrefix}list:${teamId}`;

    if (!hasFilters) {
      const cachedClasses = await this.redisService.get<any[]>(cacheKey);
      if (cachedClasses) return cachedClasses;
    }

    const where: Record<string, unknown> = { teamId };
    if (query?.category) where.category = query.category;
    if (query?.status === "ACTIVE") where.isActive = true;
    if (query?.status === "INACTIVE") where.isActive = false;
    if (query?.coachId) where.coachId = query.coachId;
    if (query?.search) {
      where.OR = [
        { className: { contains: query.search, mode: "insensitive" } },
        { instructorName: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const classes = await this.prisma.class.findMany({
      where,
      select: {
        id: true,
        className: true,
        trainingType: true,
        endedAt: true,
        salesOpenMonth: true,
        instructorName: true,
        capacity: true,
        startTime: true,
        endTime: true,
        ageMin: true,
        ageMax: true,
        targetBirthYears: true,
        isActive: true,
        approvalStatus: true,
        category: true,
        classDays: true,
        coachId: true,
        // 분류 SoT (FE class-categories.ts) 기반 외래키 — regular/open 식별용.
        teamId: true,
        academyId: true,
        levelRequired: true,
        description: true,
        createdAt: true,
        // [2026-08-04] 수업 지역 — 운영자 목록에도 "서울 강남구" 를 노출해
        //   감독이 자기 수업의 지역 표기를 바로 확인·정정할 수 있게 한다.
        regionCity: true,
        regionDistrict: true,
        // [수정 2026-05-11] coach.userType 추가 — 프론트에서 코치 실제 역할(감독/코치 등) 호칭 동적 표시용.
        coach: {
          select: { id: true, firstName: true, lastName: true, userType: true },
        },
        team: {
          select: {
            logoUrl: true,
            // 지역 미입력(구 수업) 표기 폴백 — 팀 홈링크장 시/도.
            homeVenue: { select: { city: true } },
          },
        },
        // 오픈클래스(teamId=null) 로고 폴백용 — 소속 아카데미 대표 이미지.
        academy: { select: { imageUrl: true } },
        venue: { select: { id: true, name: true, address: true, city: true } },
        products: {
          select: {
            id: true,
            productName: true,
            price: true,
            feeType: true,
            // 정기 패키지 단위(주 수 + 총 회수 + 주 빈도) 응답 노출용
            durationDays: true,
            sessionsPerMonth: true,
            sessionsPerWeek: true,
            billingMonth: true,
          },
        },
        // [추가 2026-05-12] 수업 운영 기간 계산용 — schedules 첫/마지막 날짜.
        //  · startTime/endTime 은 "하루 세션 시간"(예: 06:00~07:00)이라 기간 표기에 부적합.
        //  · 화면 카드의 "기간 + N주/단일" 표기를 위해 schedules 의 min/max scheduledDate 필요.
        schedules: {
          where: { isCancelled: false },
          select: { scheduledDate: true, startTime: true, endTime: true },
          orderBy: { scheduledDate: "asc" },
        },
        // 2026-05-09: 학생 카운트는 ClassRegistration(active 등록) 기준 — 수업상세(currentEnrollment)와
        // 동일 source 로 정합. 기존엔 Enrollment(결제 흐름) 기반이라 결제 전 학생이 0으로 표시되던 버그.
        // 2026-05-20: registrations 카운트에 status='active' 필터 추가 — 상세(getClass)와 동일하게
        //  배치 해제(inactive) 학생을 제외. 필터 누락 시 만료/해제 학생까지 카운트되어 목록>상세 불일치 발생.
        _count: {
          select: {
            registrations: { where: { status: "active" } },
            enrollments: true,
            waitlists: true,
          },
        },
        // 2026-06-05: 요일별 시간·장소 규칙 (ClassDaySchedule) — venue는 id/name만 선택해 응답 최소화
        dayScheduleEntries: {
          select: {
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            venueId: true,
            venue: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const sdTodayList = kstTodayUtcMidnight();
    const result = classes.map((c) => {
      const days = Array.isArray(c.classDays)
        ? (c.classDays as string[]).join(", ")
        : "";
      const coachName = c.coach
        ? `${c.coach.lastName ?? ""}${c.coach.firstName ?? ""}`.trim() ||
          c.instructorName
        : c.instructorName;
      // 다음 회차 (비취소·오늘 이후 첫 회차) — time 라벨·nextSchedule 공용 소스.
      //   대표값(Class.startTime) 기반 time 라벨 폐기 — 요일별 상이/등록시각 폴백 왜곡.
      const nextSched = (c.schedules ?? []).find(
        (s) => s.scheduledDate >= sdTodayList,
      );
      // [Lifecycle v4.1] 파생 상태 — 배지 판정 일원화 (class-lifecycle.util SoT).
      const lifecycle = deriveClassLifecycle({
        endedAt: c.endedAt,
        salesOpenMonth: c.salesOpenMonth,
        trainingType: c.trainingType,
        schedules: c.schedules ?? [],
      });
      return {
        id: c.id,
        className: c.className,
        trainingType: c.trainingType,
        lifecycleStatus: lifecycle.state,
        pendingReason: lifecycle.pendingReason,
        teamId: c.teamId,
        // 오픈클래스는 팀이 없으므로 소속 아카데미 대표 이미지로 폴백.
        teamLogoUrl: c.team?.logoUrl ?? c.academy?.imageUrl ?? null,
        academyId: c.academyId,
        dayOfWeek: days,
        // 다음 회차의 실제 시각 — 없으면 빈 문자열(프론트 미표시).
        time: nextSched?.startTime
          ? nextSched.endTime
            ? `${nextSched.startTime} - ${nextSched.endTime}`
            : nextSched.startTime
          : "",
        startTime: c.startTime,
        endTime: c.endTime,
        location: c.venue?.name ?? "",
        venueAddress: c.venue?.address ?? "",
        // [2026-08-04] 지역 라벨 "서울 강남구" — 수업 지역(감독 선택) > 장소 시/도 > 팀 홈링크장 시/도.
        //   폴백 소스에는 시군구가 없어 구 수업은 시/도까지만 표시된다.
        regionLabel:
          formatRegionLabel(c.regionCity, c.regionDistrict) ??
          c.venue?.city ??
          c.team?.homeVenue?.city ??
          null,
        studentCount: c._count.registrations,
        maxStudents: c.capacity,
        level: c.levelRequired,
        category: c.category,
        // [추가 2026-05-13] ageMin/ageMax — 수업목록에서 U10 자동 라벨 표시용.
        //  기존엔 응답에서 누락되어 frontend 가 ALL 로 fallback 했음.
        ageMin: c.ageMin,
        ageMax: c.ageMax,
        targetBirthYears: c.targetBirthYears,
        status: c.isActive ? "ACTIVE" : "INACTIVE",
        approvalStatus: c.approvalStatus,
        coach: coachName,
        // [추가 2026-05-13] 코치의 user.id — director-coaches 페이지에서 코치별 수업 카운트
        //  계산용. 기존엔 coachId 가 응답에 누락되어 항상 0으로 표시됨.
        coachId: c.coachId ?? c.coach?.id ?? null,
        // [추가 2026-05-11] 코치의 실제 userType — 프론트 호칭("감독"/"코치") 결정용.
        coachUserType: c.coach?.userType ?? null,
        // [추가 2026-05-12] 실제 운영 기간 (first/last schedule scheduledDate).
        //  · UI 카드의 "기간 + N주/단일" 표기에 사용.
        firstScheduleDate:
          c.schedules && c.schedules.length > 0
            ? c.schedules[0].scheduledDate.toISOString()
            : null,
        lastScheduleDate:
          c.schedules && c.schedules.length > 0
            ? c.schedules[c.schedules.length - 1].scheduledDate.toISOString()
            : null,
        // 비취소 총 회차 수 — 카드 "총 N회" 표기용.
        scheduleCount: c.schedules?.length ?? 0,
        // 다음 회차 (비취소·오늘 이후) — 기본 일정 없는 수업 카드의 날짜(+회차 시간) 표시용.
        //   대표 startTime 은 표시 신뢰 불가(요일별 상이·new Date 폴백)라 카드 시간 SoT 에서 제외.
        nextSchedule: nextSched
          ? {
              scheduledDate: nextSched.scheduledDate.toISOString(),
              startTime: nextSched.startTime ?? null,
              endTime: nextSched.endTime ?? null,
            }
          : null,
        isActive: c.isActive,
        description: c.description,
        // [수정 2026-05-15 db-keeper] 가격 정책 (T03/F1):
        //   · PER_SESSION 또는 MONTHLY_FIXED 상품이 없으면 null 반환 (0 → null).
        //   · `singlePriceLabel` / `monthlyPriceLabel` 로 표시 정책 명시.
        //     - "tbd"   : 별도 책정 (단가 미정) — 단건 미정 클래스
        //     - "krw"   : 정상 금액 표시
        //   · 프론트는 라벨에 따라 "별도 책정"/"₩XXX" 분기 표시.
        // [Lifecycle v4.1 §9.2] 대표가 산정은 판매 노출분(승인월+무월 레거시)만 —
        //   지난 월분 가격 오염 방지 (getAllClasses 와 동일 패턴, Reviewer F1).
        ...(() => {
          const sellableList = filterSellableProducts(
            c.products ?? [],
            c.salesOpenMonth,
          );
          const single = sellableList.find((p) => p.feeType === "PER_SESSION");
          const monthly = sellableList.find(
            (p) => p.feeType === "MONTHLY_FIXED",
          );
          return {
            singlePrice: single?.price ?? null,
            singlePriceLabel:
              single && typeof single.price === "number" && single.price > 0
                ? ("krw" as const)
                : ("tbd" as const),
            monthlyPrice: monthly?.price ?? null,
            monthlyPriceLabel:
              monthly && typeof monthly.price === "number" && monthly.price > 0
                ? ("krw" as const)
                : ("tbd" as const),
            // 정기 패키지 단위(주 수 + 총 회수 + 주 빈도) — 회의록 2026-04-23 정합.
            packageWeeks: monthly?.durationDays
              ? Math.max(1, Math.round(monthly.durationDays / 7))
              : null,
            packageTotalSessions:
              monthly?.sessionsPerMonth && monthly.sessionsPerMonth > 0
                ? monthly.sessionsPerMonth
                : null,
            packageSessionsPerWeek: monthly?.sessionsPerWeek ?? null,
          };
        })(),
        waitlistCount: c._count.waitlists,
        createdAt: c.createdAt,
        // 2026-06-05: 요일별 시간·장소 규칙 — getClass 와 동일 DOW_ORDER 정렬.
        //   없으면 [] — 기존 단일 startTime/endTime/venueId 경로로 폴백 표시.
        daySchedules: (() => {
          const DOW_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
          return (c.dayScheduleEntries ?? [])
            .slice()
            .sort(
              (a, b) =>
                DOW_ORDER.indexOf(a.dayOfWeek) - DOW_ORDER.indexOf(b.dayOfWeek),
            )
            .map((ds) => ({
              dayOfWeek: ds.dayOfWeek,
              startTime: ds.startTime,
              endTime: ds.endTime,
              venueId: ds.venueId ?? null,
              venueName: ds.venue?.name ?? null,
            }));
        })(),
      };
    });

    // 필터 없을 때만 캐시
    if (!hasFilters) {
      await this.redisService.set(cacheKey, result, cacheTTL);
    }

    return result;
  }

  /**
   * 수업 수정 (감독만)
   */
  /**
   * 2026-05-08: 수업별 결제 현황 (등록 학생 전체 + 최근 Enrollment + Payment 매핑).
   *
   * 학생 리스트는 ClassRegistration(active) 전체. 각 학생의 결제 상태는 가장 최근
   * Enrollment(class+child) 1건의 status 와 연결된 Payment 정보로 표시한다.
   */
  async getClassPayments(
    classId: string,
    requester: JwtUserPayload,
    // URL 스코프 검증 — 팀/아카데미 경로로 진입 시 수업 소속과 URL 파라미터 일치 확인.
    expectedScope?: { teamId?: string; academyId?: string },
    // [Phase 2a] 정산 기준 월(YYYY-MM). 미전송 시 현재 KST 월. 출석 집계·후불 BillingLine
    //   선택·후불 예상액의 단일 기준. 형식 오류는 방어적으로 현재 월 폴백.
    //   **유효하게 명시 시** 선불 행에도 월귀속 필터(허브 R1 동일 계약) 적용 —
    //   현재 web(students)·admin(결제 관리) 소비처 모두 yearMonth 를 전송한다.
    //   미전송/무효 호출만 "스냅샷 모드"(월 필터 없는 최신 기준)로 응답.
    yearMonth?: string,
  ) {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        className: true,
        teamId: true,
        academyId: true,
        // [Phase B 연동] 결제 방식 — PREPAID(선불) / POSTPAID(후불). 선수정보 결제 탭 모드 분기용.
        billingMode: true,
        startTime: true,
        endTime: true,
        // 선택월 멤버십 — 그 달 수업 진행 여부(classActiveForMonth) 판정용.
        isActive: true,
        endedAt: true,
        team: { select: { id: true, name: true, teamCode: true } },
        products: {
          select: {
            id: true,
            productName: true,
            price: true,
            feeType: true,
            // 후불 모드 회당 단가 표시용 (출석 × 단가 정산 안내).
            billingTiming: true,
            feePerSession: true,
          },
        },
      },
    });
    if (!cls) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    // 관리자 소속 검증 — 학생 명단·결제금액·결제자(학부모) 정보가 담기는 응답이라
    // 역할 검사만으로는 타 팀/오픈클래스 조회(IDOR)가 가능했다.
    await this.resourceAccess.assertManageableClassRecord(cls, requester);
    // 스코프 경로(/teams/:teamId/... , /academies/:academyId/...)는 URL 과 수업 소속 일치도 검증.
    if (expectedScope?.teamId && cls.teamId !== expectedScope.teamId) {
      throw new NotFoundException("해당 팀의 수업이 아닙니다.");
    }
    if (expectedScope?.academyId && cls.academyId !== expectedScope.academyId) {
      throw new NotFoundException("해당 아카데미의 수업이 아닙니다.");
    }

    // [수정 2026-05-13] status='active' 필터 제거 — inactive(배치 해제) 학생도 명단에 노출.
    //  inactive 는 **명단 포함 여부**에만 쓰고 결제 상태(billingStatus)는 덮어쓰지 않는다
    //  (아래 5-state 판정 참조) — 완납 후 크레딧 만료로 inactive 된 학생이 명단에 남되
    //  결제 상태는 PAID 로 정확히 표시된다. 다른 수업의 미납 학생도 동일하게 보임.
    const registrations = await this.prisma.classRegistration.findMany({
      where: { classId },
      select: {
        id: true,
        userId: true,
        status: true,
        registrationDate: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            userType: true,
          },
        },
      },
    });

    const userIds = registrations.map((r) => r.userId);
    const enrollments = userIds.length
      ? await this.prisma.enrollment.findMany({
          where: { classId, childId: { in: userIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            childId: true,
            status: true,
            paymentId: true,
            paidAt: true,
            classProductId: true,
            product: {
              select: {
                id: true,
                productName: true,
                price: true,
                feeType: true,
                // [Phase 2a] BOTH 수업 선수별 결제방식 판정(resolveRowBillingTiming)·
                //   후불 미확정 월 예상액(출석 × feePerSession) 산출용.
                billingTiming: true,
                feePerSession: true,
                // paid 유효성 batch 판정 — 비발급(0) 상품은 등록 active 만으로 수강 중
                //   (hasActivePaidEnrollment 공식 미러).
                sessionsPerMonth: true,
                // 선불 월귀속 — MONTHLY_FIXED 서비스월(resolvePrepaidAttribution R1).
                billingMonth: true,
              },
            },
            payment: {
              select: {
                id: true,
                amount: true,
                paymentStatus: true,
                paymentMethod: true,
                completedAt: true,
                // 선불 월귀속 — pending 결제의 임시 귀속월(createdAt KST 월).
                createdAt: true,
                // 선불 환불 순수납액 계산용 — Payment terminal 상태가 SoT.
                refundLogs: { select: { refundAmount: true } },
                // [추가 2026-05-14] 결제자(보통 학부모) 정보 — admin 결제관리에서 "결제한 부모" 노출용
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    userType: true,
                  },
                },
              },
            },
          },
        })
      : [];

    // 월 스코프 모드 선불 판정용 — 자녀별 전체 enrollment(복수 구매 포함, updatedAt desc 유지).
    const enrollmentsByChild = new Map<string, typeof enrollments>();
    for (const e of enrollments) {
      const list = enrollmentsByChild.get(e.childId);
      if (list) {
        list.push(e);
      } else {
        enrollmentsByChild.set(e.childId, [e]);
      }
    }

    // ── 자녀별 대표 행 선택 — 질문별 selector 분리 ──────────────────────
    //   종전 "상태 불문 updatedAt 최신 1건" 단일 대표는 취소·이탈 행이 결제·수강
    //   행을 가리는 오표기를 만들었다(환불 이력이 expired 에 가려지는 실측 반례).
    //   "현재 수강 기록"과 "최근 실거래"는 다른 질문이라 각각 고른다.

    // paid 유효성 batch 판정 — hasActivePaidEnrollment(paid-enrollment-guard.util)
    //   단일 공식 미러: 수강 중 = ClassRegistration active AND (발급형이면 유효 크레딧).
    //   자녀별 반복 쿼리(N+1) 대신 필요한 자녀만 모아 크레딧을 1회 일괄 조회한다.
    const activeRegChildIds = new Set(
      registrations.filter((r) => r.status === "active").map((r) => r.userId),
    );
    const paidRowsByChild = new Map<string, typeof enrollments>();
    for (const [childId, list] of enrollmentsByChild) {
      const paidRows = list.filter(
        (e) => e.status === ENROLLMENT_STATUS.PAID,
      );
      if (paidRows.length > 0) paidRowsByChild.set(childId, paidRows);
    }
    // 크레딧 조회가 필요한 자녀 = 등록 active + paid 전부가 발급형(비발급 0 없음).
    //   비발급(sessionsPerMonth=0) paid 보유 자녀는 등록만으로 유효 — 크레딧 항 미평가.
    //   product 미연결 행은 발급형으로 폴백(가드 util 과 동일 해석).
    const creditCheckChildIds = [...paidRowsByChild.entries()]
      .filter(
        ([childId, rows]) =>
          activeRegChildIds.has(childId) &&
          !rows.some((e) => e.product?.sessionsPerMonth === 0),
      )
      .map(([childId]) => childId);
    const validCreditChildIds = new Set<string>();
    if (creditCheckChildIds.length > 0) {
      const credits = await this.prisma.memberCredit.findMany({
        where: {
          classId,
          userId: { in: creditCheckChildIds },
          expiresAt: { gte: new Date() },
        },
        select: { userId: true, totalSessions: true, usedSessions: true },
      });
      for (const c of credits) {
        if (c.usedSessions < c.totalSessions) validCreditChildIds.add(c.userId);
      }
    }
    const hasValidPassByChild = new Map<string, boolean>();
    for (const [childId, rows] of paidRowsByChild) {
      if (!activeRegChildIds.has(childId)) {
        hasValidPassByChild.set(childId, false);
        continue;
      }
      const hasNonIssuing = rows.some(
        (e) => e.product?.sessionsPerMonth === 0,
      );
      hasValidPassByChild.set(
        childId,
        hasNonIssuing || validCreditChildIds.has(childId),
      );
    }

    // ① 현재 수강 기록 — "살아있는" 행만 후보:
    //    · approved: 유효 결제방식이 POSTPAID 인 행만(전용 POSTPAID 또는 BOTH+후불 상품).
    //      선불 미결제 approved 는 수강 중이 아니므로 제외.
    //    · paid: 배치(등록)가 살아있는 자녀만(hasValidPassByChild — 크레딧 미사용 전환
    //      이후 실질 축은 배치 해제 여부). 지난달 결제 이력은 제외.
    //    updatedAt desc 라 첫 등장 = 최신 → BOTH 선불→후불 전환은 최신 approved 가 유지.
    const contractByChild = new Map<string, (typeof enrollments)[number]>();
    // ② 최근 실거래 — 완료 결제 연결 행만 후보. "최신" 기준은 payment.completedAt
    //    최대값(가장 최근에 돈이 오간 사건 — enrollment updatedAt 아님).
    //    환불·결제자 표기의 SoT. 이탈 흔적(미완료 pending·cancelled·expired)은 배제.
    const lastTransactionByChild = new Map<
      string,
      (typeof enrollments)[number]
    >();
    const isPostpaidRow = (e: (typeof enrollments)[number]) =>
      this.resolveRowBillingTiming(
        cls.billingMode,
        e.product?.billingTiming,
      ) === "POSTPAID";
    for (const e of enrollments) {
      if (
        !contractByChild.has(e.childId) &&
        ((e.status === ENROLLMENT_STATUS.APPROVED && isPostpaidRow(e)) ||
          (e.status === ENROLLMENT_STATUS.PAID &&
            hasValidPassByChild.get(e.childId) === true))
      ) {
        contractByChild.set(e.childId, e);
      }
      if (e.payment?.completedAt != null) {
        const prev = lastTransactionByChild.get(e.childId);
        if (
          !prev ||
          e.payment.completedAt > (prev.payment?.completedAt ?? new Date(0))
        ) {
          lastTransactionByChild.set(e.childId, e);
        }
      }
    }

    // ── [만료 회원] 결제가 끊겨 자동 해제된(expired) 선수 관리 목록 ────────
    //   월 필터와 무관한 재등록 대상 목록 — 마지막 유효 결제월(선불 귀속) 포함.
    //   additive 필드라 기존 소비처 무영향.
    const expiredMembers = registrations
      .filter((r) => r.status === "expired")
      .map((r) => {
        let lastPaidYearMonth: string | null = null;
        for (const en of enrollmentsByChild.get(r.userId) ?? []) {
          if (
            this.resolveRowBillingTiming(
              cls.billingMode,
              en.product?.billingTiming,
            ) !== "PREPAID"
          ) {
            continue;
          }
          const att = resolvePrepaidAttribution({
            billingTiming: "PREPAID",
            feeType: en.product?.feeType,
            billingMonth: en.product?.billingMonth,
            enrollmentStatus: en.status,
            enrollmentPaidAt: en.paidAt,
            productPrice: en.product?.price,
            payment: en.payment,
          });
          if (att.billingStatus === "PAID" && att.yearMonth != null) {
            if (
              lastPaidYearMonth == null ||
              att.yearMonth > lastPaidYearMonth
            ) {
              lastPaidYearMonth = att.yearMonth;
            }
          }
        }
        return {
          userId: r.userId,
          memberName:
            `${r.user.lastName ?? ""}${r.user.firstName ?? ""}`.trim() ||
            r.user.email,
          lastPaidYearMonth,
        };
      });

    // [수정 2026-05-14] 레거시 결제 상태 2-state(+취소/환불). 신규 5-state(billingStatus)에서
    //   파생하여 하위호환 유지 — paymentState·counts 키/의미 불변(프론트 무수정 보장).
    type PaymentState = "paid" | "unpaid" | "cancelled" | "refunded";
    // [Phase 2a] 선수별 5-state 정산 상태.
    type BillingStatus =
      | "UNSETTLED"
      | "BILLED"
      | "PAID"
      | "CANCELLED"
      | "REFUNDED";
    // billingStatus → 레거시 paymentState 파생 (R3 하위호환 매핑).
    const toPaymentState = (bs: BillingStatus): PaymentState =>
      bs === "PAID"
        ? "paid"
        : bs === "CANCELLED"
          ? "cancelled"
          : bs === "REFUNDED"
            ? "refunded"
            : "unpaid";

    // [Phase 2a R1] 정산 기준 월 확정 — 미전송/형식오류 시 현재 KST 월 폴백.
    const selectedYearMonth = this.resolveSettlementYearMonth(yearMonth);
    // 월 스코프 판정 — yearMonth 를 **유효하게 명시한** 호출만 선불 행에 월귀속 필터를
    //   적용한다(정산 허브와 동일 계약). 미전송/무효(admin 결제 관리 등 레거시 소비처)는
    //   종전 그대로 "최신 Enrollment 스냅샷"으로 응답해 회귀를 막는다.
    const monthScoped =
      !!yearMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth);
    const [selY, selM] = selectedYearMonth.split("-").map(Number);
    // scheduledDate(@db.Date) 선택월 경계 — KST 해당 월의 UTC 자정 [gte, lt).
    const monthStart = new Date(Date.UTC(selY, selM - 1, 1));
    const monthEnd = new Date(Date.UTC(selY, selM, 1));

    // [Phase 2a R4] 후불 판정 = 선택월 BillingLine (기존 "최근 확정월" 폐기).
    //   후불 enrollment 는 approved 에 머물고 Payment 무연결이라, 확정 정산 라인으로만
    //   정확히 판정된다(선수정보 결제 탭 미납 오표시의 직접 원인 해소).
    type PostpaidLineInfo = {
      // 연결 Payment 의 terminal 상태 우선 판정 (라인 stale 방지).
      status: "PAID" | "BILLED" | "REFUNDED";
      amount: number; // 청구액(라인 amount)
      refundedAmount: number; // 환불 총액
      paymentMethod: string | null;
      paidAt: Date | null;
      payerId: string | null;
      payerName: string | null;
    };
    const postpaidLineByUser = new Map<string, PostpaidLineInfo>();
    const monthlyBilling = await this.prisma.monthlyPostpaidBilling.findUnique({
      where: { classId_yearMonth: { classId, yearMonth: selectedYearMonth } },
      select: {
        status: true,
        items: {
          select: {
            userId: true,
            amount: true,
            paymentStatus: true,
            payment: {
              select: {
                paymentStatus: true,
                paymentMethod: true,
                completedAt: true,
                // 순수납액 계산용 — 환불 로그 합산(라인 paymentStatus 는 환불 시 되돌지 않아 stale).
                refundLogs: { select: { refundAmount: true } },
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    const billingConfirmed = monthlyBilling?.status === "confirmed";
    if (billingConfirmed) {
      for (const ln of monthlyBilling?.items ?? []) {
        const payer = ln.payment?.user;
        const payStatus = ln.payment?.paymentStatus ?? null;
        const refundedAmount = (ln.payment?.refundLogs ?? []).reduce(
          (sum, r) => sum + (r.refundAmount ?? 0),
          0,
        );
        // 연결 Payment terminal 상태를 stale 라인보다 우선:
        //   환불(부분 포함) → REFUNDED / 완료 → PAID / 그 외 → BILLED(청구·미결제).
        const isRefunded =
          payStatus === "refunded" || payStatus === "partially_refunded";
        const status: PostpaidLineInfo["status"] = isRefunded
          ? "REFUNDED"
          : ln.paymentStatus === "paid" || payStatus === "completed"
            ? "PAID"
            : "BILLED";
        postpaidLineByUser.set(ln.userId, {
          status,
          amount: ln.amount,
          refundedAmount,
          paymentMethod: ln.payment?.paymentMethod ?? null,
          paidAt: ln.payment?.completedAt ?? null,
          payerId: payer?.id ?? null,
          payerName: payer
            ? `${payer.lastName ?? ""}${payer.firstName ?? ""}`.trim() ||
              payer.email
            : null,
        });
      }
    }

    // 후불 미확정 월 예상액용 수업 단위 단가 폴백 — **전체 POSTPAID 상품이 정확히 1개**이고
    //   그 상품에 단가가 있을 때만 허용. `feePerSession != null` 로 먼저 거르면
    //   A(단가 null) + B(단가 有) 조합에서 필터 결과가 B 하나가 되어 학생 A 에게 B 단가가
    //   폴백되는 결함이 남는다(§ Codex 사이클2 지적2). 전체 후불 상품 수로 판정해야 안전.
    const postpaidProducts = cls.products.filter(
      (p) => p.billingTiming === "POSTPAID",
    );
    const classPostpaidUnit =
      postpaidProducts.length === 1 && postpaidProducts[0].feePerSession != null
        ? Number(postpaidProducts[0].feePerSession)
        : null;

    // [Phase C] 선택월 출석 집계 — "출석 N회"(기존 키) + 후불 예상액 산출 공용.
    //   취소(isCancelled) 제외 일정의 present 출석을 회원별로 카운트. 결제 상태와 독립.
    const attendanceSchedules = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: { gte: monthStart, lt: monthEnd },
        isCancelled: false,
      },
      select: {
        attendances: {
          where: { attendanceStatus: "present" },
          select: { memberId: true },
        },
      },
    });
    const attendanceByUser = new Map<string, number>();
    for (const s of attendanceSchedules) {
      for (const a of s.attendances) {
        attendanceByUser.set(
          a.memberId,
          (attendanceByUser.get(a.memberId) ?? 0) + 1,
        );
      }
    }

    // ── 선불 선택월 귀속 거래 사전 계산 (월 스코프 전용) ─────────────────
    //   멤버십 활동 증거와 행 생성이 같은 판정 결과를 공유하도록 1회만 계산.
    const prepaidMatchedByChild = new Map<
      string,
      { en: (typeof enrollments)[number]; att: AttributionResult }
    >();
    if (monthScoped) {
      for (const [childId, list] of enrollmentsByChild) {
        // 완료 결제 행 우선 2-pass — 같은 달에 실거래(결제·환불)와 이탈 흔적(재결제
        //   pending→expired)이 공존하면, "첫 매칭=최신"만으로는 최신 이탈이 실거래를
        //   가려 환불 학생이 취소로 오표기된다. 돈이 오간 행(payment.completedAt)을
        //   먼저 훑고, 없을 때만 종전대로 최신 행을 매칭한다. 허브는 행 합산이라
        //   가림이 없으므로 이 우선순위가 허브 의미와 화면을 정합시킨다.
        const passes: ((e: (typeof enrollments)[number]) => boolean)[] = [
          (e) => e.payment?.completedAt != null,
          () => true,
        ];
        matchChild: for (const pass of passes) {
          for (const cand of list) {
            if (!pass(cand)) continue;
            if (
              this.resolveRowBillingTiming(
                cls.billingMode,
                cand.product?.billingTiming,
              ) !== "PREPAID"
            ) {
              continue;
            }
            const att = resolvePrepaidAttribution({
              billingTiming: "PREPAID",
              feeType: cand.product?.feeType,
              billingMonth: cand.product?.billingMonth,
              enrollmentStatus: cand.status,
              enrollmentPaidAt: cand.paidAt,
              productPrice: cand.product?.price,
              payment: cand.payment,
            });
            if (
              !att.attributionUnknown &&
              att.yearMonth === selectedYearMonth
            ) {
              prepaidMatchedByChild.set(childId, { en: cand, att });
              break matchChild; // pass 내 updatedAt desc — 첫 매칭이 최신 거래
            }
          }
        }
      }
    }

    // ── 선택월 로스터 멤버십 (월 스코프 전용 · 허브와 동일 계약) ─────────
    //   "그 달의 수강생"만 명단·집계에 포함. 활동 증거 = 출석·후불 라인·선불 귀속 거래.
    //   미전송(admin) 호출은 종전 전체 명단 유지.
    const classEndedMonth =
      cls.endedAt != null ? instantToKstYearMonth(cls.endedAt) : null;
    const classActiveForMonth =
      classEndedMonth != null
        ? classEndedMonth >= selectedYearMonth
        : cls.isActive !== false;
    const billingLineUserIds = new Set(
      (monthlyBilling?.items ?? []).map((i) => i.userId),
    );
    const visibleRegistrations = monthScoped
      ? registrations.filter((reg) =>
          isRosterMemberForMonth(
            reg.registrationDate,
            reg.status,
            selectedYearMonth,
            classActiveForMonth,
            (attendanceByUser.get(reg.userId) ?? 0) > 0 ||
              billingLineUserIds.has(reg.userId) ||
              prepaidMatchedByChild.has(reg.userId),
          ),
        )
      : registrations;

    const students = visibleRegistrations.map((reg) => {
      const contract = contractByChild.get(reg.userId);
      const lastTx = lastTransactionByChild.get(reg.userId);
      // 종전 스냅샷(updatedAt 최신 행) — 계약도 거래도 없는 자녀(취소·이탈만 한 학생)의
      //   표시 폴백. 이 폴백 덕에 단일 행 자녀의 표기는 종전과 동일하다.
      const latest = enrollmentsByChild.get(reg.userId)?.[0];
      /** 상품·상태 표기 — 현재 수강 기록 우선, 없으면 최근 실거래 → 최신 스냅샷. */
      const displayEn = contract ?? lastTx ?? latest;
      /** 결제·환불 표기 — 최근 실거래 우선(이탈 행이 결제 이력을 가리지 않게). */
      const txEn = lastTx ?? latest;
      const fullName =
        `${reg.user.lastName ?? ""}${reg.user.firstName ?? ""}`.trim() ||
        reg.user.email;
      const attendanceCount = attendanceByUser.get(reg.userId) ?? 0;

      // [Phase 2a R2] 클래스 모드 판정 폐기 — 학생별 유효 결제방식 결정.
      //   BOTH 수업은 "현재 수강 기록"의 상품 billingTiming 을 사용한다 — 과거 선불
      //   이력이 현재 후불 수강을 PREPAID 로 오판하지 않게(contract 가 최신 approved).
      const billingTiming = this.resolveRowBillingTiming(
        cls.billingMode,
        displayEn?.product?.billingTiming,
      );

      // ── 후불(POSTPAID) 행: 선택월 확정 BillingLine 기준 ──────────────
      if (billingTiming === "POSTPAID") {
        const ln = postpaidLineByUser.get(reg.userId);
        if (billingConfirmed && ln) {
          const billingStatus: BillingStatus = ln.status;
          // 환불 건은 유효 청구/미수에서 제외(§4-2): billedAmount=null·outstanding=0.
          //   순수납액 = 청구액 − 환불총액(부분 환불이면 잔여 유지, 전액이면 0).
          const isRefunded = billingStatus === "REFUNDED";
          const billedAmount = isRefunded ? null : ln.amount;
          const paidAmount =
            billingStatus === "PAID"
              ? ln.amount
              : isRefunded
                ? Math.max(0, ln.amount - ln.refundedAmount)
                : 0;
          const outstandingAmount =
            billedAmount != null ? Math.max(0, billedAmount - paidAmount) : 0;
          return {
            registrationId: reg.id,
            memberId: reg.userId,
            memberName: fullName,
            memberType: reg.user.userType,
            registrationDate: reg.registrationDate,
            enrollmentId: displayEn?.id ?? null,
            enrollmentStatus: displayEn?.status ?? null,
            productName: displayEn?.product?.productName ?? null,
            amount: ln.amount,
            paymentMethod: ln.paymentMethod,
            paidAt: ln.paidAt,
            paymentState: toPaymentState(billingStatus),
            payerId: ln.payerId,
            payerName: ln.payerName,
            attendanceCount,
            // 신규 5-state 계약 (Dual Emit)
            billingTiming,
            billingStatus,
            billedAmount,
            estimatedAmount: null,
            paidAmount,
            outstandingAmount,
          };
        }
        // 미확정 월(UNSETTLED) — 예상액 = 선택월 출석 × 후불 단가.
        const rowUnit =
          displayEn?.product?.feePerSession != null
            ? Number(displayEn.product.feePerSession)
            : classPostpaidUnit;
        const estimatedAmount =
          rowUnit != null ? attendanceCount * rowUnit : null;
        return {
          registrationId: reg.id,
          memberId: reg.userId,
          memberName: fullName,
          memberType: reg.user.userType,
          registrationDate: reg.registrationDate,
          enrollmentId: displayEn?.id ?? null,
          enrollmentStatus: displayEn?.status ?? null,
          productName: displayEn?.product?.productName ?? null,
          amount: null,
          paymentMethod: null,
          paidAt: null,
          paymentState: "unpaid" as PaymentState,
          payerId: null,
          payerName: null,
          attendanceCount,
          billingTiming,
          billingStatus: "UNSETTLED" as BillingStatus,
          billedAmount: null,
          estimatedAmount,
          paidAmount: 0,
          outstandingAmount: 0,
        };
      }

      // ── 선불(PREPAID) 행 · 월 스코프 모드: 선택월 귀속 거래만 표시 ──────
      //   허브(settlement-summary)와 동일 SoT(resolvePrepaidAttribution) — 귀속월
      //   (MONTHLY_FIXED=billingMonth / 완료=completedAt / pending=createdAt / 레거시=paidAt)
      //   == 선택월인 거래를 최신순으로 채택. 없으면 명단은 유지하되 "이 달 청구 없음"
      //   (UNSETTLED·금액 0)으로 응답해 행 합계가 허브 소계와 정렬되게 한다.
      if (monthScoped && billingTiming === "PREPAID") {
        // 사전 계산(prepaidMatchedByChild)과 동일 판정 공유 — 멤버십/행 불일치 방지.
        const matched = prepaidMatchedByChild.get(reg.userId) ?? null;
        if (matched) {
          const mPayer = matched.en.payment?.user;
          let mStatus: BillingStatus = matched.att.billingStatus;
          let mBilled = matched.att.billedAmount;
          let mPaid = matched.att.paidAmount;
          // Phase 2a 행 계약 보존 — R1(허브 집계)은 선불 pending 을 UNSETTLED(미집계)로
          //   보지만, 이 화면의 5-state 는 pending 결제를 BILLED(청구·미결제)로 표시해 왔다.
          //   이번 변경은 "월 필터 추가"에 한정하므로 표시 의미는 종전대로 유지한다.
          if (
            mStatus === "UNSETTLED" &&
            matched.en.payment?.paymentStatus === "pending"
          ) {
            mStatus = "BILLED";
            mBilled =
              matched.en.payment?.amount ?? matched.en.product?.price ?? null;
            mPaid = 0;
          }
          const outstandingAmount =
            mBilled != null ? Math.max(0, mBilled - mPaid) : 0;
          return {
            registrationId: reg.id,
            memberId: reg.userId,
            memberName: fullName,
            memberType: reg.user.userType,
            registrationDate: reg.registrationDate,
            enrollmentId: matched.en.id,
            enrollmentStatus: matched.en.status,
            productName: matched.en.product?.productName ?? null,
            amount:
              matched.en.payment?.amount ?? matched.en.product?.price ?? null,
            paymentMethod: matched.en.payment?.paymentMethod ?? null,
            paidAt:
              matched.en.paidAt ?? matched.en.payment?.completedAt ?? null,
            paymentState: toPaymentState(mStatus),
            payerId: mPayer?.id ?? null,
            payerName: mPayer
              ? `${mPayer.lastName ?? ""}${mPayer.firstName ?? ""}`.trim() ||
                mPayer.email
              : null,
            attendanceCount,
            billingTiming,
            billingStatus: mStatus,
            billedAmount: mBilled,
            estimatedAmount: null,
            paidAmount: mPaid,
            outstandingAmount,
          };
        }
        // 선택월 귀속 거래 없음 — 명단 유지(Phase 1 계약 2) + 이 달 청구·수납 0.
        //   payerName 은 roster 탭(월 비종속 명단) 표기용 — 최근 실거래의 결제자를
        //   우선한다(이탈 pending/expired 행이 실제 결제자를 가리지 않게).
        const latestPayer = txEn?.payment?.user;
        return {
          registrationId: reg.id,
          memberId: reg.userId,
          memberName: fullName,
          memberType: reg.user.userType,
          registrationDate: reg.registrationDate,
          enrollmentId: displayEn?.id ?? null,
          enrollmentStatus: displayEn?.status ?? null,
          productName: null,
          amount: null,
          paymentMethod: null,
          paidAt: null,
          paymentState: "unpaid" as PaymentState,
          payerId: latestPayer?.id ?? null,
          payerName: latestPayer
            ? `${latestPayer.lastName ?? ""}${latestPayer.firstName ?? ""}`.trim() ||
              latestPayer.email
            : null,
          attendanceCount,
          billingTiming,
          billingStatus: "UNSETTLED" as BillingStatus,
          billedAmount: null,
          estimatedAmount: null,
          paidAmount: 0,
          outstandingAmount: 0,
        };
      }

      // ── 선불(PREPAID)·미배정(UNASSIGNED) 행: 최근 실거래(txEn) 기준 ──────
      //   종전 "최신 행" 기준은 이탈 pending/expired 가 결제·환불 이력을 가렸다.
      //   거래 없는 자녀는 txEn 이 최신 스냅샷으로 폴백해 종전 표기 유지.
      const payer = txEn?.payment?.user;
      const payerName = payer
        ? `${payer.lastName ?? ""}${payer.firstName ?? ""}`.trim() ||
          payer.email
        : null;
      const legacyAmount =
        txEn?.payment?.amount ?? txEn?.product?.price ?? null;
      const payStatus = txEn?.payment?.paymentStatus ?? null;
      const refundedAmount = (txEn?.payment?.refundLogs ?? []).reduce(
        (sum, r) => sum + (r.refundAmount ?? 0),
        0,
      );

      // 5-state 판정 — **연결 Payment terminal 상태를 Enrollment 상태보다 우선**한다.
      //   환불/취소는 Payment 만 갱신되고 Enrollment 는 paid 로 남기 때문(부분 환불이 PAID 로
      //   오분류되던 사이클1/2 잔여 결함 해소).
      //   · UNASSIGNED(BOTH 유효상품 없음) → 정산 제외(UNSETTLED, 금액 0)
      //   · 환불(전액/부분) → REFUNDED, 순수납 = 청구 − 환불총액
      //   · 취소(Payment cancelled OR enrollment cancelled/rejected/expired) → CANCELLED
      //   · 결제완료(Payment completed OR enrollment paid/completed) → PAID
      //     ('completed' enrollment = 크레딧 만료 후 상태로, 결제 완료 사실이 유지된다)
      //   · pending 결제(실청구) → BILLED / 그 외 → UNSETTLED
      //   ※ ClassRegistration.status='inactive'(배치 해제)는 **명단 포함 여부**에만 쓰고
      //     결제 상태를 덮어쓰지 않는다 — 수동 배치 해제·크레딧 만료 배치는 registration 만
      //     inactive 로 바꾸고 Payment/Enrollment 는 유지하므로, 완납 학생이 UNSETTLED 로
      //     사라지던 결함(Codex 사이클3)을 방지한다.
      let billingStatus: BillingStatus;
      if (billingTiming === "UNASSIGNED") {
        billingStatus = "UNSETTLED";
      } else if (
        payStatus === "refunded" ||
        payStatus === "partially_refunded"
      ) {
        billingStatus = "REFUNDED";
      } else if (
        payStatus === "cancelled" ||
        (txEn?.status != null && TERMINAL_NO_MONEY.includes(txEn.status))
      ) {
        billingStatus = "CANCELLED";
      } else if (
        payStatus === "completed" ||
        txEn?.status === ENROLLMENT_STATUS.PAID ||
        txEn?.status === ENROLLMENT_STATUS.COMPLETED
      ) {
        billingStatus = "PAID";
      } else if (payStatus === "pending") {
        billingStatus = "BILLED";
      } else {
        billingStatus = "UNSETTLED";
      }

      // billedAmount 는 확정 청구(PAID/BILLED)에만. UNSETTLED/CANCELLED/REFUNDED/UNASSIGNED 는
      //   null → outstanding 0. 환불은 순수납(청구−환불총액) 유지, 미수 재분류 금지.
      const billedAmount =
        billingStatus === "PAID" || billingStatus === "BILLED"
          ? legacyAmount
          : null;
      const paidAmount =
        billingStatus === "PAID"
          ? (legacyAmount ?? 0)
          : billingStatus === "REFUNDED"
            ? Math.max(0, (legacyAmount ?? 0) - refundedAmount)
            : 0;
      const outstandingAmount =
        billedAmount != null ? Math.max(0, billedAmount - paidAmount) : 0;

      return {
        registrationId: reg.id,
        memberId: reg.userId,
        memberName: fullName,
        memberType: reg.user.userType,
        registrationDate: reg.registrationDate,
        enrollmentId: displayEn?.id ?? null,
        enrollmentStatus: displayEn?.status ?? null,
        productName: displayEn?.product?.productName ?? null,
        amount: legacyAmount,
        paymentMethod: txEn?.payment?.paymentMethod ?? null,
        paidAt: txEn?.paidAt ?? txEn?.payment?.completedAt ?? null,
        // 레거시 paymentState 는 billingStatus 에서 파생(R3) — counts/totalPaidAmount 정합.
        paymentState: toPaymentState(billingStatus),
        payerId: payer?.id ?? null,
        payerName,
        attendanceCount,
        billingTiming,
        billingStatus,
        billedAmount,
        estimatedAmount: null,
        paidAmount,
        outstandingAmount,
      };
    });

    // ── [명단 밖 확정 청구 보완] 확정 후불 청구 라인이 있으나 registration 이
    //   없는 학생도 행 생성 — 명단 부재로 확정 청구·수납·미수가 화면에서 누락되지
    //   않게(허브의 "로스터 밖 후불 대상" 계약과 정합). 출석은 active 명단이 전제라
    //   실질 발생 경로는 확정 청구 라인뿐이다.
    const registeredIds = new Set(registrations.map((r) => r.userId));
    const orphanBilledIds = [...postpaidLineByUser.keys()].filter(
      (uid) => !registeredIds.has(uid),
    );
    if (orphanBilledIds.length > 0) {
      const orphanUsers = await this.prisma.user.findMany({
        where: { id: { in: orphanBilledIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userType: true,
        },
      });
      for (const u of orphanUsers) {
        const ln = postpaidLineByUser.get(u.id);
        if (!ln) continue;
        const billingStatus: BillingStatus = ln.status;
        const isRefunded = billingStatus === "REFUNDED";
        const billedAmount = isRefunded ? null : ln.amount;
        const paidAmount =
          billingStatus === "PAID"
            ? ln.amount
            : isRefunded
              ? Math.max(0, ln.amount - ln.refundedAmount)
              : 0;
        const outstandingAmount =
          billedAmount != null ? Math.max(0, billedAmount - paidAmount) : 0;
        students.push({
          // 합성 행 — registration 부재. FE 는 key 로만 사용.
          registrationId: `billing-${u.id}`,
          memberId: u.id,
          memberName:
            `${u.lastName ?? ""}${u.firstName ?? ""}`.trim() || u.email,
          memberType: u.userType,
          registrationDate: null,
          enrollmentId: null,
          enrollmentStatus: null,
          productName: null,
          amount: ln.amount,
          paymentMethod: ln.paymentMethod,
          paidAt: ln.paidAt,
          paymentState: toPaymentState(billingStatus),
          payerId: ln.payerId,
          payerName: ln.payerName,
          attendanceCount: attendanceByUser.get(u.id) ?? 0,
          billingTiming: "POSTPAID",
          billingStatus,
          billedAmount,
          estimatedAmount: null,
          paidAmount,
          outstandingAmount,
        } as unknown as (typeof students)[number]);
      }
    }

    const counts = students.reduce(
      (acc, s) => {
        acc[s.paymentState] = (acc[s.paymentState] ?? 0) + 1;
        return acc;
      },
      { paid: 0, unpaid: 0, cancelled: 0, refunded: 0 } as Record<
        PaymentState,
        number
      >,
    );

    // [Phase 2a R6] 5-state 카운트 — 레거시 counts 4키와 병행 emit.
    const billingStatusCounts = students.reduce(
      (acc, s) => {
        acc[s.billingStatus] = (acc[s.billingStatus] ?? 0) + 1;
        return acc;
      },
      {
        UNSETTLED: 0,
        BILLED: 0,
        PAID: 0,
        CANCELLED: 0,
        REFUNDED: 0,
      } as Record<BillingStatus, number>,
    );

    // [Phase 2a] 총수금 = 행별 순수납액(paidAmount) 합. 부분 환불의 순수납(청구−환불)을
    //   포함하고, 레거시 "paymentState=paid 행의 amount 합" 과 정상 케이스는 동일값이라
    //   Dual Emit 호환(환불 건만 정확히 순수납으로 반영 — 행/상단 합계 불일치 해소).
    const totalPaidAmount = students.reduce((sum, s) => sum + s.paidAmount, 0);

    return {
      classId: cls.id,
      className: cls.className,
      // [Phase B 연동] 결제 방식 — 프론트 결제 탭 모드 분기 (선불/후불). 기본 PREPAID.
      billingMode: cls.billingMode ?? "PREPAID",
      // [Phase 2a] 정산 기준 월 — 프론트 월 선택 UI 반영용(신규 키).
      yearMonth: selectedYearMonth,
      teamId: cls.team?.id ?? cls.teamId,
      teamName: cls.team?.name ?? "",
      teamCode: cls.team?.teamCode ?? "",
      products: cls.products,
      total: students.length,
      counts,
      billingStatusCounts,
      totalPaidAmount,
      // 선택월 비취소 일정 수 — 프론트 "출석 N/M회" 분모(canonical 신규 키).
      //   attendanceCount 와 같은 창(monthStart~monthEnd, isCancelled=false)이라 정합.
      totalSessions: attendanceSchedules.length,
      // [만료 회원] 재등록 대상 관리 목록 — 월 필터 무관(additive).
      expiredMembers,
      students,
    };
  }

  /** [Phase 2a R1] 정산 기준 월 확정 — "YYYY-MM" 유효 시 그대로, 아니면 현재 KST 월. */
  private resolveSettlementYearMonth(yearMonth?: string): string {
    // 월 범위(01-12)까지 검증 — 형식만 맞는 2026-13/2026-00 이 Date.UTC 에서 조용히
    //   인접 월로 롤오버되는 오월 폴백을 차단(형식 통과 ≠ 의미 유효). 무효 시 당월 폴백.
    if (yearMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth))
      return yearMonth;
    const base = kstTodayUtcMidnight();
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  /**
   * [Phase 2a R2] 선수별 유효 결제방식 판정 — 클래스 모드 하드코딩 폐기.
   *  - PREPAID/POSTPAID 수업: 전원 해당 방식
   *  - BOTH 수업: 학생 enrollment 상품의 billingTiming(없으면 UNASSIGNED)
   */
  private resolveRowBillingTiming(
    classBillingMode: string | null,
    enrollmentProductBillingTiming?: string | null,
  ): "PREPAID" | "POSTPAID" | "UNASSIGNED" {
    const mode = classBillingMode ?? "PREPAID";
    if (mode === "PREPAID") return "PREPAID";
    if (mode === "POSTPAID") return "POSTPAID";
    // BOTH — 학생 상품 결제방식 사용.
    if (enrollmentProductBillingTiming === "POSTPAID") return "POSTPAID";
    if (enrollmentProductBillingTiming === "PREPAID") return "PREPAID";
    return "UNASSIGNED";
  }

  async updateClass(
    coachUserId: string,
    teamId: string,
    classId: string,
    updateDto: UpdateClassDto,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수업을 수정할 수 있습니다.",
    );

    // 수업 존재 및 클럽 소속 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // trainingType 변경 차단 — 등록 후 유형 전환 금지 (사용자 정책 2026-05-11)
    // 이미 등록된 enrollment/ClassRegistration 의 결제·정산 흐름이 깨질 위험 방지.
    if (
      updateDto.trainingType !== undefined &&
      updateDto.trainingType !== classRecord.trainingType
    ) {
      throw new BadRequestException(
        "수업 유형(정규/레슨)은 등록 후 변경할 수 없습니다.",
      );
    }

    // 시간 검증
    if (
      updateDto.startTime &&
      updateDto.endTime &&
      new Date(updateDto.startTime) >= new Date(updateDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(updateDto.daySchedules, updateDto.dateSchedules);

    // [Lifecycle v4.1 §7.1] spot(1회용) — 일정 1개 초과 차단.
    //   trainingType 은 수정 시 변경 불가 정책이므로 기존 저장값 기준으로 판정.
    if (
      classRecord.trainingType === "spot" &&
      (updateDto.dateSchedules?.length ?? 0) > 1
    ) {
      throw new BadRequestException(
        "1회용 수업은 일정을 1개만 등록할 수 있습니다.",
      );
    }
    // [spot 선불 단건] 1회용 수업은 정기권 미사용 — 수정 경로의 월 결제 전송 차단.
    if (classRecord.trainingType === "spot" && updateDto.monthlyPrice) {
      throw new BadRequestException(
        "1회용 수업은 정기권(월 결제)을 등록할 수 없습니다.",
      );
    }

    // 2026-05-12: 배정 코치 동기화 사전 검증 — 회의록 정합 (Team owner + CoachProfile 통합).
    //   - DIRECTOR/감독: Team.coachId 매핑 — CoachProfile 없을 수 있음
    //   - COACH/학원 감독: CoachProfile.teamId 매핑
    // undefined = 변경 없음 / [] = 전부 제거 / 배열 = 동기화 (1번째 = LEAD).
    let assignedCoachUserIds: string[] | undefined = undefined;
    if (updateDto.coachUserIds !== undefined) {
      if (updateDto.coachUserIds.length === 0) {
        assignedCoachUserIds = [];
      } else {
        const [validProfiles, teamOwners] = await Promise.all([
          this.prisma.coachProfile.findMany({
            where: {
              userId: { in: updateDto.coachUserIds },
              teamId: classRecord.teamId,
            },
            select: { userId: true },
          }),
          this.prisma.team.findMany({
            where: {
              id: classRecord.teamId,
              coachId: { in: updateDto.coachUserIds },
            },
            select: { coachId: true },
          }),
        ]);
        const validSet = new Set<string>([
          ...validProfiles.map((p) => p.userId),
          ...teamOwners.map((t) => t.coachId),
        ]);
        assignedCoachUserIds = updateDto.coachUserIds.filter((id) =>
          validSet.has(id),
        );
      }
    }
    const newLeadCoachId =
      assignedCoachUserIds && assignedCoachUserIds.length > 0
        ? assignedCoachUserIds[0]
        : undefined;

    // 신규 추가 코치 알림 발송용 — 기존 ACCEPTED 배정자와 비교
    const newlyAddedCoachIds: string[] = [];
    if (assignedCoachUserIds !== undefined) {
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { coachUserId: true },
      });
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      for (const uid of assignedCoachUserIds) {
        if (!existingSet.has(uid) && uid !== coachUserId) {
          newlyAddedCoachIds.push(uid);
        }
      }
    }

    // [추가 2026-05-13] ageMin/ageMax → category(U8~U12) 자동 도출.
    //  수업 수정 후 수업목록/명단관리에서 ageRange 가 즉시 라벨로 노출되도록.
    let derivedCategory = updateDto.category ?? classRecord.category;
    const newAgeMin = updateDto.ageMin ?? classRecord.ageMin;
    const newAgeMax = updateDto.ageMax ?? classRecord.ageMax;
    if (updateDto.category === undefined && newAgeMax != null) {
      if (newAgeMax >= 8 && newAgeMax <= 12) derivedCategory = `U${newAgeMax}`;
    }

    // [2026-06-05] daySchedules 재동기화 — updateClass 트랜잭션 내에서 처리
    const hasDaySchedulesUpdate = (updateDto.daySchedules?.length ?? 0) > 0;
    const representativeUpdate = hasDaySchedulesUpdate
      ? deriveRepresentative(updateDto.daySchedules)
      : null;

    // dateSchedules 대표값 산출 (전송 시에만)
    const hasDateSchedulesUpdate = updateDto.dateSchedules !== undefined;
    const dateRepresentativeUpdate =
      hasDateSchedulesUpdate &&
      updateDto.dateSchedules &&
      updateDto.dateSchedules.length > 0
        ? deriveRepresentativeFromDateSchedules(updateDto.dateSchedules)
        : null;

    // 수강료 업데이트 (ClassProduct) — 다른 write 보다 먼저 수행한다.
    //   가격 잠금 400 이 선행 쓰기(수업 필드·코치 배정) 이후에 발생하면 부분 반영이
    //   남으므로, 거부 가능성이 있는 이 블록을 첫 write 로 배치 (P2-H2).
    //   reconcile 내부의 sales lock + tx 재조회 판정이 최종 가드.
    if (
      updateDto.singlePrice !== undefined ||
      updateDto.monthlyPrice !== undefined
    ) {
      const products = buildClassProducts(classId, {
        singlePrice: updateDto.singlePrice,
        monthlyPrice: updateDto.monthlyPrice,
        packageWeeks: updateDto.packageWeeks,
        packageTotalSessions: updateDto.packageTotalSessions,
        // 기존 수업의 결제방식 기준으로 PER_SESSION 판매/비판매·billingTiming 결정 (B2).
        billingMode: classRecord.billingMode,
        // [spot 선불 단건] 신규 정책 spot(선불) 수정 저장이 판매 1회권 구성을 유지하도록 전달.
        trainingType: classRecord.trainingType,
      });

      // [M-1] id 보존 reconcile — enrollment/payment 참조 ClassProduct 의 FK 단절 방지.
      const priceChanges = await this.prisma.$transaction(async (tx) =>
        this.reconcileClassProducts(
          tx,
          classId,
          products,
          classRecord.billingMode,
        ),
      );
      // [Phase 5 §3-4] 커밋 후 알림 — 다건 변경은 금액 표기 없이 1건으로 합산 발송.
      if (priceChanges.length > 0) {
        const change =
          priceChanges.length === 1
            ? priceChanges[0]
            : { oldAmount: null, newAmount: null };
        await this.notifyClassPriceChanged(classId, change);
      }
    }

    const updatedClass = await this.prisma.$transaction(async (txUpdate) => {
      // [2026-06-05] daySchedules 전송 시: ClassDaySchedule 전체 교체
      if (updateDto.daySchedules !== undefined) {
        await txUpdate.classDaySchedule.deleteMany({ where: { classId } });
        if (updateDto.daySchedules.length > 0) {
          await txUpdate.classDaySchedule.createMany({
            data: updateDto.daySchedules.map((ds) => ({
              classId,
              dayOfWeek: ds.dayOfWeek,
              startTime: ds.startTime,
              endTime: ds.endTime,
              venueId: ds.venueId ?? null,
            })),
            skipDuplicates: true,
          });
        }
      }

      // dateSchedules 전송 시: 날짜 기준 diff 동기화 (미전송 시 기존 보존).
      //   전체 삭제·재생성은 출석/RSVP/감사로그(onDelete: Cascade)와 취소 이력을 연쇄 삭제하므로 금지.
      //   불가침(payload 와 무관하게 보존): 지난 회차(오늘 KST 이전) · 취소 회차 · 출석 기록 보유 회차.
      //   같은 날짜 유지 = ID 보존 update(RSVP 유지) / 빠진 미래 날짜 = 삭제 / 새 날짜 = 생성.
      if (hasDateSchedulesUpdate) {
        const todayUtcMidnight = kstTodayUtcMidnight();
        const existingSchedules = await txUpdate.classSchedule.findMany({
          where: { classId },
          select: {
            id: true,
            scheduledDate: true,
            isCancelled: true,
            _count: { select: { attendances: true } },
          },
        });
        const isImmutable = (s: (typeof existingSchedules)[number]) =>
          s.isCancelled ||
          s.scheduledDate < todayUtcMidnight ||
          s._count.attendances > 0;
        // 편집 가능한 기존 회차 — 날짜(YYYY-MM-DD)당 활성 1개 정책이라 날짜 키 Map 으로 매칭.
        const editableByDate = new Map<string, string>();
        // 불가침 "활성" 회차가 점유한 날짜 — 같은 날짜 신규 생성 시 중복이 되므로 생성 스킵.
        //   (취소 회차는 재등록 허용 정책이라 점유로 치지 않는다)
        const immutableActiveDates = new Set<string>();
        for (const s of existingSchedules) {
          const dateKey = dateOnlyToString(s.scheduledDate);
          if (!isImmutable(s)) editableByDate.set(dateKey, s.id);
          else if (!s.isCancelled) immutableActiveDates.add(dateKey);
        }
        // 수신 회차 — 지난 날짜는 무시(구버전 payload 하위호환: 지난 회차는 항상 보존).
        const incoming = (updateDto.dateSchedules ?? []).filter(
          (s) => dateOnlyToUtc(s.date) >= todayUtcMidnight,
        );
        const incomingDates = new Set(incoming.map((s) => s.date));

        // spot(1회용) — 보존되는 불가침 활성 회차 + 수신 회차 합계 1개 초과 차단
        //   (payload 단독 검증(위 2420)은 보존분을 못 보므로 diff 확정 시점에 재검증).
        if (
          classRecord.trainingType === "spot" &&
          immutableActiveDates.size + incomingDates.size > 1
        ) {
          throw new BadRequestException(
            "1회용 수업은 일정을 1개만 등록할 수 있습니다.",
          );
        }

        const toCreate: {
          classId: string;
          scheduledDate: Date;
          startTime: string;
          endTime: string;
          venueId: string | null;
        }[] = [];
        for (const s of incoming) {
          const editableId = editableByDate.get(s.date);
          if (editableId) {
            await txUpdate.classSchedule.update({
              where: { id: editableId },
              data: {
                startTime: s.startTime,
                endTime: s.endTime,
                venueId: s.venueId ?? null,
              },
            });
          } else if (!immutableActiveDates.has(s.date)) {
            toCreate.push({
              classId,
              scheduledDate: dateOnlyToUtc(s.date),
              startTime: s.startTime,
              endTime: s.endTime,
              venueId: s.venueId ?? null,
            });
          }
        }
        if (toCreate.length > 0) {
          await txUpdate.classSchedule.createMany({ data: toCreate });
        }
        // 편집 가능한 기존 회차 중 수신 목록에서 빠진 날짜만 삭제.
        const toDeleteIds = [...editableByDate.entries()]
          .filter(([dateKey]) => !incomingDates.has(dateKey))
          .map(([, id]) => id);
        if (toDeleteIds.length > 0) {
          await txUpdate.classSchedule.deleteMany({
            where: { id: { in: toDeleteIds } },
          });
        }
      }

      return txUpdate.class.update({
        where: { id: classId },
        data: {
          className: updateDto.className ?? classRecord.className,
          description: updateDto.description ?? classRecord.description,
          instructorName:
            updateDto.instructorName ?? classRecord.instructorName,
          capacity: updateDto.capacity ?? classRecord.capacity,
          // targetBirthYears 전송 시 SoT 갱신 + ageMin/ageMax 파생 재계산(빈 배열=전 연령→null).
          //   미전송(undefined) 시 기존 ageMin/ageMax 유지(하위호환).
          ...(updateDto.targetBirthYears !== undefined
            ? {
                targetBirthYears: updateDto.targetBirthYears,
                ...this.deriveAgeRangeFromBirthYears(
                  updateDto.targetBirthYears,
                ),
              }
            : {
                ageMin: updateDto.ageMin ?? classRecord.ageMin,
                ageMax: updateDto.ageMax ?? classRecord.ageMax,
              }),
          levelRequired: updateDto.levelRequired ?? classRecord.levelRequired,
          // 우선순위: dateSchedules 대표값 > daySchedules 대표값 > 단일 startTime > 기존값 유지
          startTime:
            dateRepresentativeUpdate?.startTime ??
            representativeUpdate?.startTime ??
            updateDto.startTime ??
            classRecord.startTime,
          endTime:
            dateRepresentativeUpdate?.endTime ??
            representativeUpdate?.endTime ??
            updateDto.endTime ??
            classRecord.endTime,
          isActive: updateDto.isActive ?? classRecord.isActive,
          // trainingType 은 변경 차단 정책에 따라 기존 값 그대로 유지
          trainingType: classRecord.trainingType,
          // coachId 우선순위: coachUserIds[0] (LEAD) > coachId 명시 > 기존 값
          coachId:
            newLeadCoachId ??
            (updateDto.coachId !== undefined
              ? updateDto.coachId
              : classRecord.coachId),
          venueId:
            dateRepresentativeUpdate !== null
              ? (dateRepresentativeUpdate.venueId ?? null)
              : representativeUpdate?.venueId !== undefined
                ? (representativeUpdate.venueId ?? null)
                : updateDto.venueId !== undefined
                  ? updateDto.venueId
                  : classRecord.venueId,
          // classDays 우선순위: dateSchedules 기반 요일 집합 > daySchedules 요일 집합 > updateDto.classDays > 기존 유지
          classDays:
            dateRepresentativeUpdate?.classDays !== undefined
              ? dateRepresentativeUpdate.classDays
              : hasDateSchedulesUpdate && updateDto.dateSchedules?.length === 0
                ? []
                : representativeUpdate?.classDays !== undefined
                  ? representativeUpdate.classDays
                  : updateDto.classDays !== undefined
                    ? updateDto.classDays
                    : undefined,
          category: derivedCategory,
          // [2026-08-04] 공개 범위 — 미전송 시 기존 값 유지.
          visibility: updateDto.visibility ?? classRecord.visibility,
          // [2026-08-04] 수업 지역 — 미전송 필드는 기존 값 유지.
          //   시/도만 바꾸고 시군구를 안 보내면 조합이 깨지므로 mergeClassRegion 이 시군구를 비운다.
          ...mergeClassRegion(classRecord, updateDto),
        },
        include: {
          team: {
            select: {
              name: true,
            },
          },
        },
      });
    });

    // [2026-08-04] 공개범위·노출 팀 반영 — SELECTED_TEAMS 일 때만 노출 지정이 유효하고,
    //   그 밖으로 전환되면 기존 지정을 정리한다.
    await this.applyClassVisibilityUpdate(
      classId,
      classRecord.visibility,
      updateDto,
    );

    // [추가 2026-05-13] ageMin/ageMax 변경 시 매칭 PLAYER 자동 배치.
    //  팀 PLAYER(TEEN/CHILD) 중 새 ageRange 에 부합하는 학생을 ClassRegistration(active) 으로 upsert.
    //  결제 흐름(Enrollment) 은 별개 — 명단상 배치만 자동화. 정원(capacity) 초과는 자동 배치 제한.
    const ageChanged =
      (updateDto.ageMin !== undefined &&
        updateDto.ageMin !== classRecord.ageMin) ||
      (updateDto.ageMax !== undefined &&
        updateDto.ageMax !== classRecord.ageMax);
    if (
      ageChanged &&
      classRecord.teamId &&
      newAgeMin != null &&
      newAgeMax != null
    ) {
      const matched = await this.prisma.teamMember.findMany({
        where: {
          teamId: classRecord.teamId,
          leftAt: null,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
          playerAge: { gte: newAgeMin, lte: newAgeMax },
        },
        select: { user: { select: { id: true } } },
      });
      const capacity = updatedClass.capacity ?? Number.MAX_SAFE_INTEGER;
      const currentActive = await this.prisma.classRegistration.count({
        where: { classId, status: "active" },
      });
      let slot = capacity - currentActive;
      // N+1 해소: matched 사용자 id 일괄 추출 후 existing registration 한 번에 조회
      const matchedUserIds = matched
        .map((m) => m.user?.id)
        .filter((id): id is string => !!id);
      const existingRegistrations =
        matchedUserIds.length > 0
          ? await this.prisma.classRegistration.findMany({
              where: { classId, userId: { in: matchedUserIds } },
              select: { userId: true, status: true },
            })
          : [];
      const existingByUser = new Map(
        existingRegistrations.map((e) => [e.userId, e.status]),
      );
      // 누락/비활성 사용자만 upsert (단순화: createMany skipDuplicates 사용)
      const toUpsertIds: string[] = [];
      for (const m of matched) {
        const uid = m.user?.id;
        if (!uid || slot <= 0) break;
        if (existingByUser.get(uid) === "active") continue;
        toUpsertIds.push(uid);
        slot -= 1;
      }
      if (toUpsertIds.length > 0) {
        const existingIds = new Set(existingRegistrations.map((e) => e.userId));
        const newIds = toUpsertIds.filter((id) => !existingIds.has(id));
        const reactivateIds = toUpsertIds.filter((id) => existingIds.has(id));
        await Promise.all([
          newIds.length > 0
            ? this.prisma.classRegistration.createMany({
                data: newIds.map((userId) => ({
                  classId,
                  userId,
                  status: "active" as const,
                })),
                skipDuplicates: true,
              })
            : Promise.resolve(),
          reactivateIds.length > 0
            ? this.prisma.classRegistration.updateMany({
                where: {
                  classId,
                  userId: { in: reactivateIds },
                },
                data: { status: "active" },
              })
            : Promise.resolve(),
        ]);
      }
    }

    // 2026-05-12: ClassCoachAssignment 동기화 (제거 → REMOVED, 신규 추가 → ACCEPTED)
    if (assignedCoachUserIds !== undefined) {
      const now = new Date();
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { id: true, coachUserId: true },
      });
      const newSet = new Set(assignedCoachUserIds);
      // 제거된 코치 → REMOVED
      const toRemoveIds = existing
        .filter((a) => !newSet.has(a.coachUserId))
        .map((a) => a.id);
      if (toRemoveIds.length > 0) {
        await this.prisma.classCoachAssignment.updateMany({
          where: { id: { in: toRemoveIds } },
          data: { status: "REMOVED" },
        });
      }
      // 신규 추가 코치 → ACCEPTED (LEAD/ASSISTANT 자동)
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      const toAdd = assignedCoachUserIds.filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await this.prisma.classCoachAssignment.createMany({
          data: toAdd.map((userId) => ({
            classId,
            coachUserId: userId,
            invitedBy: coachUserId,
            role: userId === assignedCoachUserIds![0] ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }
      // 기존 LEAD 가 1번째가 아닌 경우 role 재조정 (LEAD ↔ ASSISTANT)
      if (assignedCoachUserIds.length > 0) {
        const leadId = assignedCoachUserIds[0];
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: leadId,
            role: { not: "LEAD" },
          },
          data: { role: "LEAD" },
        });
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: { not: leadId },
            role: "LEAD",
          },
          data: { role: "ASSISTANT" },
        });
      }
    }

    // 캐시 무효화
    await this.invalidateClassCache(teamId);

    // 2026-05-12: 신규 추가 코치에게 "수업 배정 알림" 발송 (등록자 본인 제외).
    //  - createClass 와 동일 패턴 (회의록 5:50 "감독 공지" 정합).
    //  - 알림 페이지(/notifications) + 종 아이콘 배지에 즉시 반영.
    if (newlyAddedCoachIds.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: coachUserId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "DIRECTOR"
          ? "감독"
          : inviter?.userType === "ACADEMY_DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: newlyAddedCoachIds.map((userId) => ({
          userId,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${updatedClass.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    return {
      id: updatedClass.id,
      className: updatedClass.className,
      instructorName: updatedClass.instructorName,
      name: updatedClass.team?.name ?? "",
      isActive: updatedClass.isActive,
      updatedAt: new Date(),
    };
  }

  /**
   * 수업 삭제 차단 참조 카운트 — 가드(deleteClass/deleteAcademyClass) + deletable 플래그 공용 헬퍼.
   *
   * 유효 신청(취소/만료/거절 제외) · 발급 크레딧 · 후불 청구 라인 · 출석 기록 4종을 병렬 집계해
   * 합산한다. 합산 0 이면 빈 수업(일정/상품만 존재) → 삭제 허용. 1 이상이면 회계·이력 보존을 위해 삭제 차단.
   * 관계 경로(schema.prisma 검증): memberCredit.classId(:895) ·
   *   monthlyPostpaidBillingLine.billing.classId(MonthlyPostpaidBilling.classId :676) ·
   *   classAttendance.schedule.classId(ClassSchedule.classId :785).
   */
  private async countClassBlockingRefs(classId: string): Promise<number> {
    const [
      activeEnroll,
      creditCount,
      postpaidCount,
      attendanceCount,
      activeNoticeCount,
    ] = await Promise.all([
      this.prisma.enrollment.count({
        where: {
          classId,
          status: { notIn: ["cancelled", "expired", "rejected"] },
        },
      }),
      this.prisma.memberCredit.count({ where: { classId } }),
      this.prisma.monthlyPostpaidBillingLine.count({
        where: { billing: { classId } },
      }),
      this.prisma.classAttendance.count({
        where: { schedule: { classId } },
      }),
      // [Codex R1 H-04] 게시 중 단위 공지 — FK RESTRICT 라 비제어 DB 오류가 되기 전에
      // 가드에서 차단 (soft 삭제된 공지 잔재는 삭제 트랜잭션이 정리)
      countActiveUnitNotices(this.prisma, { classId }),
    ]);
    return (
      activeEnroll +
      creditCount +
      postpaidCount +
      attendanceCount +
      activeNoticeCount
    );
  }

  /**
   * 수업 삭제 (감독만)
   */
  async deleteClass(coachUserId: string, teamId: string, classId: string) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수업을 삭제할 수 있습니다.",
    );

    // 수업 존재 및 클럽 소속 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // [수정 2026-06-29] B안 가드 — 유효 신청/크레딧/후불청구/출석/게시 중 공지 중
    //   하나라도 있으면 삭제 불가. countClassBlockingRefs 헬퍼 합산(가드+deletable 공용 · DRY).
    if ((await this.countClassBlockingRefs(classId)) > 0) {
      throw new ConflictException(
        "신청자 또는 결제·출석·공지 이력이 있는 수업은 삭제할 수 없습니다.",
      );
    }

    // [Codex R1 H-04] soft 삭제된 공지 잔재만 정리(FK RESTRICT 점유 해제) 후 삭제.
    // [R2] 가드 count 이후 레이스로 생긴 active 공지는 FK 가 delete 를 막는다 —
    //      P2003 을 제어된 Conflict 로 변환해 공지를 보존한다.
    try {
      await this.prisma.$transaction(async (tx) => {
        await cleanupUnitNoticesForDelete(tx, { classId });
        await tx.class.delete({ where: { id: classId } });
      });
    } catch (error) {
      if (isForeignKeyRestrictError(error)) {
        throw new ConflictException(
          "신청자 또는 결제·출석·공지 이력이 있는 수업은 삭제할 수 없습니다.",
        );
      }
      throw error;
    }

    // 캐시 무효화
    await this.invalidateClassCache(teamId);

    return {
      id: classId,
      deletedAt: new Date(),
    };
  }

  /**
   * 학원(아카데미) 수업 수정 — PR-E C3 fix.
   *
   * 기존 `updateClass` 의 핵심 로직(필드 갱신·ClassCoachAssignment 동기화·ClassProduct 갱신)을
   * academyId 컨텍스트로 재구성. teamMember 기반 ageRange 자동 배치는 학원에 부적합하여 제외.
   * 권한: 학원 감독(directorId) 본인 또는 활성 학원 코치(AcademyCoach.isActive).
   */
  async updateAcademyClass(
    userId: string,
    academyId: string,
    classId: string,
    updateDto: UpdateClassDto,
  ) {
    await this.assertAcademyManagerPermission(
      userId,
      academyId,
      "이 아카데미의 감독/코치만 수업을 수정할 수 있습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classRecord || classRecord.academyId !== academyId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    if (
      updateDto.trainingType !== undefined &&
      updateDto.trainingType !== classRecord.trainingType
    ) {
      throw new BadRequestException(
        "수업 유형(정규/레슨)은 등록 후 변경할 수 없습니다.",
      );
    }

    if (
      updateDto.startTime &&
      updateDto.endTime &&
      new Date(updateDto.startTime) >= new Date(updateDto.endTime)
    ) {
      throw new BadRequestException("시작 시간이 종료 시간보다 빨라야 합니다.");
    }
    // 회차(요일/날짜별) 시간 순서 검증
    assertScheduleTimeRanges(updateDto.daySchedules, updateDto.dateSchedules);

    // 학원 코치 배정 검증 — createAcademyClass 패턴 미러링
    let assignedCoachUserIds: string[] | undefined = undefined;
    if (updateDto.coachUserIds !== undefined) {
      if (updateDto.coachUserIds.length === 0) {
        assignedCoachUserIds = [];
      } else {
        const [academy, validCoaches] = await Promise.all([
          this.prisma.academy.findUnique({
            where: { id: academyId },
            select: { directorId: true },
          }),
          this.prisma.academyCoach.findMany({
            where: {
              academyId,
              userId: { in: updateDto.coachUserIds },
              isActive: true,
            },
            select: { userId: true },
          }),
        ]);
        const validSet = new Set<string>([
          ...validCoaches.map((c) => c.userId),
          ...(academy?.directorId ? [academy.directorId] : []),
        ]);
        assignedCoachUserIds = updateDto.coachUserIds.filter((id) =>
          validSet.has(id),
        );
      }
    }
    const newLeadCoachId =
      assignedCoachUserIds && assignedCoachUserIds.length > 0
        ? assignedCoachUserIds[0]
        : undefined;

    const newlyAddedCoachIds: string[] = [];
    if (assignedCoachUserIds !== undefined) {
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { coachUserId: true },
      });
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      for (const uid of assignedCoachUserIds) {
        if (!existingSet.has(uid) && uid !== userId) {
          newlyAddedCoachIds.push(uid);
        }
      }
    }

    const newAgeMax = updateDto.ageMax ?? classRecord.ageMax;
    let derivedCategory = updateDto.category ?? classRecord.category;
    if (updateDto.category === undefined && newAgeMax != null) {
      if (newAgeMax >= 8 && newAgeMax <= 12) derivedCategory = `U${newAgeMax}`;
    }

    // [2026-06-05] daySchedules 재동기화 (학원 도메인)
    const hasDaySchedulesAcademyUpdate =
      (updateDto.daySchedules?.length ?? 0) > 0;
    const representativeAcademyUpdate = hasDaySchedulesAcademyUpdate
      ? deriveRepresentative(updateDto.daySchedules)
      : null;

    // ClassProduct 갱신 — 다른 write 보다 먼저 수행한다.
    //   가격 잠금 400 이 선행 쓰기 이후에 발생하면 부분 반영이 남으므로,
    //   거부 가능성이 있는 이 블록을 첫 write 로 배치 (P2-H2).
    //   reconcile 내부의 sales lock + tx 재조회 판정이 최종 가드.
    if (
      updateDto.singlePrice !== undefined ||
      updateDto.monthlyPrice !== undefined
    ) {
      const products = buildClassProducts(classId, {
        singlePrice: updateDto.singlePrice,
        monthlyPrice: updateDto.monthlyPrice,
        packageWeeks: updateDto.packageWeeks,
        packageTotalSessions: updateDto.packageTotalSessions,
        // 기존 수업의 결제방식 기준으로 PER_SESSION 판매/비판매·billingTiming 결정 (B2).
        billingMode: classRecord.billingMode,
        // [spot 선불 단건] 신규 정책 spot(선불) 수정 저장이 판매 1회권 구성을 유지하도록 전달.
        trainingType: classRecord.trainingType,
      });

      // [M-1] id 보존 reconcile — enrollment/payment 참조 ClassProduct 의 FK 단절 방지.
      const priceChanges = await this.prisma.$transaction(async (tx) =>
        this.reconcileClassProducts(
          tx,
          classId,
          products,
          classRecord.billingMode,
        ),
      );
      // [Phase 5 §3-4] 커밋 후 알림 — 다건 변경은 금액 표기 없이 1건으로 합산 발송.
      if (priceChanges.length > 0) {
        const change =
          priceChanges.length === 1
            ? priceChanges[0]
            : { oldAmount: null, newAmount: null };
        await this.notifyClassPriceChanged(classId, change);
      }
    }

    const updatedClass = await this.prisma.$transaction(
      async (txAcademyUpdate) => {
        // daySchedules 전송 시 — ClassDaySchedule 전체 교체
        if (updateDto.daySchedules !== undefined) {
          await txAcademyUpdate.classDaySchedule.deleteMany({
            where: { classId },
          });
          if (updateDto.daySchedules.length > 0) {
            await txAcademyUpdate.classDaySchedule.createMany({
              data: updateDto.daySchedules.map((ds) => ({
                classId,
                dayOfWeek: ds.dayOfWeek,
                startTime: ds.startTime,
                endTime: ds.endTime,
                venueId: ds.venueId ?? null,
              })),
              skipDuplicates: true,
            });
          }
        }

        return txAcademyUpdate.class.update({
          where: { id: classId },
          data: {
            className: updateDto.className ?? classRecord.className,
            description: updateDto.description ?? classRecord.description,
            instructorName:
              updateDto.instructorName ?? classRecord.instructorName,
            capacity: updateDto.capacity ?? classRecord.capacity,
            // targetBirthYears 전송 시 SoT 갱신 + ageMin/ageMax 파생 재계산(빈 배열=전 연령→null).
            //   미전송(undefined) 시 기존 ageMin/ageMax 유지(하위호환).
            ...(updateDto.targetBirthYears !== undefined
              ? {
                  targetBirthYears: updateDto.targetBirthYears,
                  ...this.deriveAgeRangeFromBirthYears(
                    updateDto.targetBirthYears,
                  ),
                }
              : {
                  ageMin: updateDto.ageMin ?? classRecord.ageMin,
                  ageMax: updateDto.ageMax ?? classRecord.ageMax,
                }),
            levelRequired: updateDto.levelRequired ?? classRecord.levelRequired,
            startTime:
              representativeAcademyUpdate?.startTime ??
              updateDto.startTime ??
              classRecord.startTime,
            endTime:
              representativeAcademyUpdate?.endTime ??
              updateDto.endTime ??
              classRecord.endTime,
            isActive: updateDto.isActive ?? classRecord.isActive,
            trainingType: classRecord.trainingType,
            coachId:
              newLeadCoachId ??
              (updateDto.coachId !== undefined
                ? updateDto.coachId
                : classRecord.coachId),
            venueId:
              representativeAcademyUpdate?.venueId !== undefined
                ? (representativeAcademyUpdate.venueId ?? null)
                : updateDto.venueId !== undefined
                  ? updateDto.venueId
                  : classRecord.venueId,
            classDays:
              representativeAcademyUpdate?.classDays !== undefined
                ? representativeAcademyUpdate.classDays
                : updateDto.classDays !== undefined
                  ? updateDto.classDays
                  : undefined,
            category: derivedCategory,
            // [2026-08-04] 공개 범위 — 미전송 시 기존 값 유지.
            visibility: updateDto.visibility ?? classRecord.visibility,
            // [2026-08-04] 수업 지역 — 미전송 필드는 기존 값 유지.
            //   시/도만 바꾸고 시군구를 안 보내면 조합이 깨지므로 mergeClassRegion 이 시군구를 비운다.
            ...mergeClassRegion(classRecord, updateDto),
          },
        });
      },
    );

    if (assignedCoachUserIds !== undefined) {
      const now = new Date();
      const existing = await this.prisma.classCoachAssignment.findMany({
        where: { classId, status: "ACCEPTED" },
        select: { id: true, coachUserId: true },
      });
      const newSet = new Set(assignedCoachUserIds);
      const toRemoveIds = existing
        .filter((a) => !newSet.has(a.coachUserId))
        .map((a) => a.id);
      if (toRemoveIds.length > 0) {
        await this.prisma.classCoachAssignment.updateMany({
          where: { id: { in: toRemoveIds } },
          data: { status: "REMOVED" },
        });
      }
      const existingSet = new Set(existing.map((a) => a.coachUserId));
      const toAdd = assignedCoachUserIds.filter((id) => !existingSet.has(id));
      if (toAdd.length > 0) {
        await this.prisma.classCoachAssignment.createMany({
          data: toAdd.map((cid) => ({
            classId,
            coachUserId: cid,
            invitedBy: userId,
            role: cid === assignedCoachUserIds![0] ? "LEAD" : "ASSISTANT",
            status: "ACCEPTED",
            respondedAt: now,
          })),
          skipDuplicates: true,
        });
      }
      if (assignedCoachUserIds.length > 0) {
        const leadId = assignedCoachUserIds[0];
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: leadId,
            role: { not: "LEAD" },
          },
          data: { role: "LEAD" },
        });
        await this.prisma.classCoachAssignment.updateMany({
          where: {
            classId,
            status: "ACCEPTED",
            coachUserId: { not: leadId },
            role: "LEAD",
          },
          data: { role: "ASSISTANT" },
        });
      }
    }

    // [2026-05-15 → 2026-08-04] 공개범위·노출 팀 반영.
    //   visibility 가 SELECTED_TEAMS 일 때만 노출 지정이 유효하며,
    //   그 밖으로 전환되면 기존 지정을 정리한다.
    await this.applyClassVisibilityUpdate(
      classId,
      classRecord.visibility,
      updateDto,
    );

    // 신규 코치 배정 알림 발송
    if (newlyAddedCoachIds.length > 0) {
      const inviter = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, userType: true },
      });
      const inviterName = inviter
        ? `${inviter.lastName ?? ""}${inviter.firstName ?? ""}`.trim()
        : "감독";
      const inviterRole =
        inviter?.userType === "DIRECTOR"
          ? "감독"
          : inviter?.userType === "ACADEMY_DIRECTOR"
            ? "감독"
            : "코치";
      await this.prisma.notification.createMany({
        data: newlyAddedCoachIds.map((uid) => ({
          userId: uid,
          notificationType: "class_coach_assigned",
          title: "수업 배정 알림",
          message: `${inviterName} ${inviterRole}이 ${updatedClass.className} 수업에 배정했습니다.`,
          isRead: false,
        })),
      });
    }

    return {
      id: updatedClass.id,
      className: updatedClass.className,
      instructorName: updatedClass.instructorName,
      name: "",
      isActive: updatedClass.isActive,
      updatedAt: new Date(),
    };
  }

  /**
   * 학원(아카데미) 수업 삭제 — PR-E C3 fix.
   *
   * deleteClass(:1708) 의 학원 버전. 활성 수강생 가드 동일.
   * 권한: 학원 감독(directorId) 본인 또는 활성 학원 코치.
   */
  async deleteAcademyClass(userId: string, academyId: string, classId: string) {
    await this.assertAcademyManagerPermission(
      userId,
      academyId,
      "이 아카데미의 감독/코치만 수업을 삭제할 수 있습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, academyId: true },
    });
    if (!classRecord || classRecord.academyId !== academyId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // [수정 2026-06-29] B안 가드 — 유효 신청/크레딧/후불청구/출석/게시 중 공지 중
    //   하나라도 있으면 삭제 불가. countClassBlockingRefs 헬퍼 합산(가드+deletable 공용 · DRY).
    if ((await this.countClassBlockingRefs(classId)) > 0) {
      throw new ConflictException(
        "신청자 또는 결제·출석·공지 이력이 있는 수업은 삭제할 수 없습니다.",
      );
    }

    // [Codex R1 H-04] soft 삭제된 공지 잔재만 정리 후 삭제 · [R2] 레이스 P2003 → Conflict
    try {
      await this.prisma.$transaction(async (tx) => {
        await cleanupUnitNoticesForDelete(tx, { classId });
        await tx.class.delete({ where: { id: classId } });
      });
    } catch (error) {
      if (isForeignKeyRestrictError(error)) {
        throw new ConflictException(
          "신청자 또는 결제·출석·공지 이력이 있는 수업은 삭제할 수 없습니다.",
        );
      }
      throw error;
    }

    return { id: classId, deletedAt: new Date() };
  }

  /**
   * 수업 활성/비활성 토글
   */
  async toggleClassStatus(
    userId: string,
    teamId: string,
    classId: string,
    isActive: boolean,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      userId,
      teamId,
      "이 클럽의 수업 상태를 변경할 권한이 없습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { isActive },
      select: { id: true, isActive: true },
    });
    await this.invalidateClassCache(teamId);
    return updated;
  }

  /**
   * [신규 2026-05-13] 명단관리 — 학생을 수업에 배치.
   *  코치/감독 권한 검증 후 ClassRegistration(active) 생성 또는 복구.
   *  enrollment(결제) 흐름과는 별도로 명단상 배치만 처리. 결제는 후속으로 학부모가 진행.
   */
  async assignStudentToClass(
    coachUserId: string,
    classId: string,
    studentUserId: string,
  ): Promise<{
    success: boolean;
    classId: string;
    userId: string;
    status: string;
  }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true, capacity: true },
    });
    if (!cls) throw new NotFoundException("수업을 찾을 수 없습니다.");
    if (!cls.teamId) {
      throw new BadRequestException(
        "팀 소속 수업에서만 명단을 관리할 수 있습니다.",
      );
    }
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      cls.teamId,
      "이 수업의 감독/코치만 학생을 배치할 수 있습니다.",
    );
    const student = await this.prisma.user.findUnique({
      where: { id: studentUserId },
      select: { id: true, userType: true },
    });
    if (!student) throw new NotFoundException("학생을 찾을 수 없습니다.");

    // 정원 체크 — 0 = 무제한(정원 미운영). 신청 경로(createEnrollment)와 동일 해석.
    if (cls.capacity != null && cls.capacity > 0) {
      const activeCount = await this.prisma.classRegistration.count({
        where: { classId, status: "active" },
      });
      if (activeCount >= cls.capacity) {
        throw new BadRequestException("정원이 모두 찼습니다.");
      }
    }

    // upsert — 이미 inactive 등록이 있으면 active 로 복구
    const reg = await this.prisma.classRegistration.upsert({
      where: { classId_userId: { classId, userId: studentUserId } },
      update: { status: "active" },
      create: { classId, userId: studentUserId, status: "active" },
      select: { id: true, status: true },
    });
    await this.invalidateClassCache(cls.teamId);
    return {
      success: true,
      classId,
      userId: studentUserId,
      status: reg.status,
    };
  }

  /**
   * [신규 2026-05-13] 명단관리 — 학생 배치 해제(soft).
   *  ClassRegistration.status = 'inactive' 로 변경.
   */
  async unassignStudentFromClass(
    coachUserId: string,
    classId: string,
    studentUserId: string,
  ): Promise<{ success: boolean }> {
    const cls = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true },
    });
    if (!cls) throw new NotFoundException("수업을 찾을 수 없습니다.");
    if (!cls.teamId) {
      throw new BadRequestException(
        "팀 소속 수업에서만 명단을 관리할 수 있습니다.",
      );
    }
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      cls.teamId,
      "이 수업의 감독/코치만 학생 배치를 해제할 수 있습니다.",
    );
    await this.prisma.classRegistration.updateMany({
      where: { classId, userId: studentUserId },
      data: { status: "inactive" },
    });
    await this.invalidateClassCache(cls.teamId);
    return { success: true };
  }

  /**
   * 수업 일정 일괄 생성 — 기간 + 요일 + 시간 기반
   *
   * startDate ~ endDate 범위에서 classDays 에 포함된 요일만 선택해
   * ClassSchedule 일괄 생성. 이미 같은 날짜가 존재하면 skip.
   * 각 신규 일정에 대해 결제 완료 수강생 RSVP 자동 생성.
   *
   * @returns { created, skipped, schedules: [...] }
   */
  async createBulkClassSchedules(
    coachUserId: string,
    teamId: string,
    classId: string,
    dto: {
      startDate?: string;
      endDate?: string;
      classDays?: string[];
      startTime?: string;
      endTime?: string;
      dates?: string[];
      venueId?: string;
    },
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 일정을 생성할 수 있습니다.",
    );

    // 수업 존재 + 승인 상태 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      // [2026-06-05] ClassDaySchedule 로드 — 요일별 시각 적용용
      include: {
        dayScheduleEntries: {
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
      },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    if (classRecord.approvalStatus !== "APPROVED") {
      throw new ForbiddenException(
        "승인된 수업에만 일정을 생성할 수 있습니다.",
      );
    }

    // candidateDates 산출 — dates(미니달력 선택) 모드 우선, 없으면 기존 기간+요일 모드.
    const useDates = !!(dto.dates && dto.dates.length > 0);
    let candidateDates: Date[];
    // 요일 모드 회차별 시각·장소 (날짜 문자열 → 저장값) — 요일 규칙에서 산출.
    const weekdayTimeByDate = new Map<
      string,
      {
        startTime: string | null;
        endTime: string | null;
        venueId: string | null;
      }
    >();
    if (useDates) {
      // 미니달력으로 선택한 날짜 배열 — 자정 기준 ClassSchedule 생성.
      //   시각·장소는 ClassSchedule.startTime/endTime/venueId 필드로 별도 저장(오픈클래스 방식 통일).
      candidateDates = dto.dates!.map((d) => dateOnlyToUtc(d));
      if (candidateDates.some((d) => isNaN(d.getTime()))) {
        throw new ForbiddenException("올바른 날짜 형식을 입력해주세요.");
      }
    } else {
      if (
        !dto.startDate ||
        !dto.endDate ||
        !dto.classDays ||
        dto.classDays.length === 0
      ) {
        throw new ForbiddenException(
          "기간(시작일·종료일)과 요일을 지정하거나 날짜를 선택해주세요.",
        );
      }
      // 날짜 범위 · 요일 · 시간 파싱
      // 검증용 파싱 — 서버 TZ 의존 제거(UTC 자정 기준, 날짜 유효성·역전 비교만 사용)
      const start = dateOnlyToUtc(dto.startDate);
      const end = dateOnlyToUtc(dto.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new ForbiddenException("시작일이 종료일보다 이후일 수 없습니다.");
      }

      const dayMap: Record<string, number> = {
        일: 0,
        월: 1,
        화: 2,
        수: 3,
        목: 4,
        금: 5,
        토: 6,
      };
      const targetDows = new Set(
        dto.classDays.map((d) => dayMap[d]).filter((v) => v !== undefined),
      );
      if (targetDows.size === 0) {
        throw new ForbiddenException("유효한 요일을 선택해주세요.");
      }

      // [2026-06-05] ClassDaySchedule 요일별 시각 맵 구성 — 규칙이 있으면 요일별, 없으면 단일 폴백
      const bulkDayTimeMap = buildDayTimeMap(
        classRecord.dayScheduleEntries?.map((e) => ({
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
        })) ?? [],
      );
      const hasBulkDaySchedules = bulkDayTimeMap.size > 0;
      const dowToNameBulk: Record<number, string> = {
        0: "일",
        1: "월",
        2: "화",
        3: "수",
        4: "목",
        5: "금",
        6: "토",
      };
      const pad2Bulk = (n: number) => String(n).padStart(2, "0");

      // 회차 시각 — dto 지정 > 수업 ClassDaySchedule 요일별 > 미저장(null).
      //   대표값(Class.startTime) 폴백 제거. 산출 시각은 회차 row 의 startTime/endTime(text)
      //   필드에 직접 저장해 "시간 없는 회차" 생성 경로를 차단한다.
      // 기간 내 요일 매칭 날짜 수집 — scheduledDate(@db.Date)는 UTC 자정 규약이라 UTC 기준 순회.
      const dates: Date[] = [];
      const cursor = dateOnlyToUtc(dto.startDate);
      const cursorEnd = dateOnlyToUtc(dto.endDate);
      while (cursor <= cursorEnd) {
        const dow = cursor.getUTCDay();
        if (targetDows.has(dow)) {
          const dt = new Date(cursor);
          const dayName = dowToNameBulk[dow];
          const entry =
            hasBulkDaySchedules && dayName
              ? bulkDayTimeMap.get(dayName)
              : undefined;
          weekdayTimeByDate.set(dateOnlyToString(dt), {
            startTime:
              dto.startTime ??
              (entry
                ? `${pad2Bulk(entry.startHH)}:${pad2Bulk(entry.startMM)}`
                : null),
            endTime:
              dto.endTime ??
              (entry
                ? `${pad2Bulk(entry.endHH)}:${pad2Bulk(entry.endMM)}`
                : null),
            venueId: entry?.venueId ?? dto.venueId ?? null,
          });
          dates.push(dt);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      candidateDates = dates;
    }

    if (candidateDates.length === 0) {
      return { created: 0, skipped: 0, schedules: [] };
    }

    // 안전 상한 — 1회 호출에 최대 200건 (악의적/실수 방어)
    if (candidateDates.length > 200) {
      throw new ForbiddenException(
        "한 번에 생성 가능한 일정은 최대 200건입니다.",
      );
    }

    // 기존 일정 중복 제거 (정확히 동일 scheduledDate) — 취소된 일정은 제외하여 재등록 허용.
    // [설계 v4 §4.3-②] 범위 경계는 min/max 명시 계산 — candidateDates 정렬을 암묵
    //   가정하면 미정렬 입력에서 범위 밖 활성 일정을 놓쳐 중복이 생성된다.
    const candidateTimes = candidateDates.map((d) => d.getTime());
    const rangeMin = new Date(Math.min(...candidateTimes));
    const rangeMax = new Date(Math.max(...candidateTimes));
    const existing = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: {
          gte: rangeMin,
          lte: rangeMax,
        },
        isCancelled: false,
      },
      select: { scheduledDate: true },
    });
    // scheduledDate(@db.Date) 동등성은 시각 성분 무시 — UTC 날짜 문자열로 중복 판정.
    const existingSet = new Set(
      existing.map((e) => dateOnlyToString(e.scheduledDate)),
    );
    const toCreate = candidateDates.filter(
      (d) => !existingSet.has(dateOnlyToString(d)),
    );

    if (toCreate.length === 0) {
      return { created: 0, skipped: candidateDates.length, schedules: [] };
    }

    // [Lifecycle v4.1 §7.1] spot(1회용) — 기존 활성 일정 + 신규 생성 합계가 1개를 넘으면 차단.
    //   위 existing 조회는 candidate 날짜 범위 한정이라 전체 활성 일정을 별도 집계한다.
    if (classRecord.trainingType === "spot") {
      const activeCount = await this.prisma.classSchedule.count({
        where: { classId, isCancelled: false },
      });
      if (activeCount + toCreate.length > 1) {
        throw new BadRequestException(
          "1회용 수업은 일정을 1개만 등록할 수 있습니다.",
        );
      }
    }

    // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ─────────────────────────
    // [STATUS] 비활성 — 팀 bulk 일정 추가 시 RSVP 자동 생성 차단
    // [WHY] RSVP 기능 미완성 (학부모 /rsvp API 경로 오류, 코치 /coach-rsvp 진입점 0개)
    // [TO RE-ENABLE] 아래 enrollments 조회 + RSVP createMany 블록 주석 해제
    // [TO DELETE] grep "RSVP_DISABLED_2026-05-28" 으로 5곳 일괄 검색 → 블록 통째 삭제
    // [REF] docs/Planning/RSVP_FEATURE_ANALYSIS.md §6
    /*
    // 결제 완료 수강생 조회 (RSVP 자동 생성용)
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, status: "paid" },
      select: { childId: true, requestedBy: true },
    });
    */
    // ─── RSVP_DISABLED_2026-05-28 ─── END ───────────────────────────

    // 날짜 배열 모드: 선택 날짜들에 공통 시각·장소를 ClassSchedule 필드로 저장 (오픈클래스 방식 통일).
    //   요일 모드: 요일 규칙에서 산출한 회차별 시각·장소(weekdayTimeByDate)를 저장.
    const scheduleExtra = useDates
      ? {
          startTime: dto.startTime ?? null,
          endTime: dto.endTime ?? null,
          venueId: dto.venueId ?? null,
        }
      : null;

    // 트랜잭션 — 일정 일괄 생성 (RSVP 자동 생성 비활성)
    const created = await this.prisma.$transaction(async (tx) => {
      // [설계 v4 §4.3-③] schedule writer 공용 lock — 동시 bulk/취소/수정과 직렬화.
      //   tx 밖 중복 판정은 lock 대기 중 낡을 수 있어 lock 안에서 재검증한다
      //   (최종 방어는 활성 일정 부분 유니크 인덱스).
      await acquireClassScheduleLock(tx, classId);
      const freshExisting = await tx.classSchedule.findMany({
        where: {
          classId,
          scheduledDate: { gte: rangeMin, lte: rangeMax },
          isCancelled: false,
        },
        select: { scheduledDate: true },
      });
      const freshSet = new Set(
        freshExisting.map((e) => dateOnlyToString(e.scheduledDate)),
      );
      const toCreateFresh = toCreate.filter(
        (d) => !freshSet.has(dateOnlyToString(d)),
      );
      const schedules = await Promise.all(
        toCreateFresh.map((scheduledDate) =>
          tx.classSchedule.create({
            data: {
              classId,
              scheduledDate,
              ...(scheduleExtra ??
                weekdayTimeByDate.get(dateOnlyToString(scheduledDate)) ??
                {}),
            },
          }),
        ),
      );

      // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ───────────────────────
      // [STATUS] 비활성 — RSVP createMany 블록 차단
      // [TO RE-ENABLE] 위 enrollments 조회 블록과 함께 주석 해제
      /*
      // N+1 해소: 신규 schedule 들이므로 기존 RSVP 없음 — 바로 createMany skipDuplicates
      if (enrollments.length > 0 && schedules.length > 0) {
        const rsvpRows = schedules.flatMap((schedule) =>
          enrollments.map((e) => ({
            scheduleId: schedule.id,
            userId: e.requestedBy,
            childId: e.childId,
            status: "PENDING" as const,
          })),
        );
        if (rsvpRows.length > 0) {
          await tx.classRsvp.createMany({
            data: rsvpRows,
            skipDuplicates: true,
          });
        }
      }
      */
      // ─── RSVP_DISABLED_2026-05-28 ─── END ─────────────────────────

      return schedules;
    });

    return {
      created: created.length,
      skipped: candidateDates.length - created.length,
      schedules: created.map((s) => ({
        id: s.id,
        classId: s.classId,
        scheduledDate: s.scheduledDate,
        isCancelled: s.isCancelled,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * 학원(아카데미) 권한 검증 — 감독 본인 또는 소속 코치만 통과.
   *
   * createAcademyClass(line 326-346) 와 동일 패턴을 메서드로 추출.
   * bulkAddAcademySchedules 에서 재사용한다.
   */
  private async assertAcademyManagerPermission(
    userId: string,
    academyId: string,
    errorMessage = "이 아카데미의 감독 또는 코치만 작업할 수 있습니다.",
  ) {
    const academy = await this.prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true, directorId: true },
    });
    if (!academy) {
      throw new NotFoundException("아카데미를 찾을 수 없습니다.");
    }
    if (academy.directorId === userId) return;

    const academyCoach = await this.prisma.academyCoach.findUnique({
      where: { academyId_userId: { academyId, userId } },
      select: { userId: true, isActive: true },
    });
    if (!academyCoach || !academyCoach.isActive) {
      throw new ForbiddenException(errorMessage);
    }
  }

  /**
   * 학원(아카데미) 수업 일정 일괄 생성 — 기간 + 요일 + 시간.
   *
   * 팀용 `createBulkClassSchedules` (line 1853~) 미러링.
   *  - 가드: classRecord.academyId !== academyId
   *  - 최대 200건/회 상한 유지
   *  - 트랜잭션 내 schedule + RSVP createMany skipDuplicates 동일
   */
  async bulkAddAcademySchedules(
    userId: string,
    academyId: string,
    classId: string,
    dto: {
      startDate?: string;
      endDate?: string;
      classDays?: string[];
      startTime?: string;
      endTime?: string;
      dates?: string[];
      venueId?: string;
    },
  ) {
    await this.assertAcademyManagerPermission(
      userId,
      academyId,
      "이 아카데미의 감독/코치만 일정을 생성할 수 있습니다.",
    );

    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      // [2026-06-05] ClassDaySchedule 로드 — 요일별 시각 적용용
      include: {
        dayScheduleEntries: {
          select: { dayOfWeek: true, startTime: true, endTime: true },
        },
      },
    });

    if (!classRecord || classRecord.academyId !== academyId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    if (classRecord.approvalStatus !== "APPROVED") {
      throw new ForbiddenException(
        "승인된 수업에만 일정을 생성할 수 있습니다.",
      );
    }

    // candidateDates 산출 — dates(미니달력 선택) 모드 우선, 없으면 기존 기간+요일 모드.
    const useDates = !!(dto.dates && dto.dates.length > 0);
    let candidateDates: Date[];
    // 요일 모드 회차별 시각·장소 (날짜 문자열 → 저장값) — 요일 규칙에서 산출.
    const weekdayTimeByDate = new Map<
      string,
      {
        startTime: string | null;
        endTime: string | null;
        venueId: string | null;
      }
    >();
    if (useDates) {
      candidateDates = dto.dates!.map((d) => dateOnlyToUtc(d));
      if (candidateDates.some((d) => isNaN(d.getTime()))) {
        throw new ForbiddenException("올바른 날짜 형식을 입력해주세요.");
      }
    } else {
      if (
        !dto.startDate ||
        !dto.endDate ||
        !dto.classDays ||
        dto.classDays.length === 0
      ) {
        throw new ForbiddenException(
          "기간(시작일·종료일)과 요일을 지정하거나 날짜를 선택해주세요.",
        );
      }
      // 검증용 파싱 — 서버 TZ 의존 제거(UTC 자정 기준, 날짜 유효성·역전 비교만 사용)
      const start = dateOnlyToUtc(dto.startDate);
      const end = dateOnlyToUtc(dto.endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new ForbiddenException("시작일이 종료일보다 이후일 수 없습니다.");
      }

      const dayMap: Record<string, number> = {
        일: 0,
        월: 1,
        화: 2,
        수: 3,
        목: 4,
        금: 5,
        토: 6,
      };
      const targetDows = new Set(
        dto.classDays.map((d) => dayMap[d]).filter((v) => v !== undefined),
      );
      if (targetDows.size === 0) {
        throw new ForbiddenException("유효한 요일을 선택해주세요.");
      }

      // [2026-06-05] ClassDaySchedule 요일별 시각 맵 구성 — 학원 도메인
      const bulkAcademyDayTimeMap = buildDayTimeMap(
        classRecord.dayScheduleEntries?.map((e) => ({
          dayOfWeek: e.dayOfWeek,
          startTime: e.startTime,
          endTime: e.endTime,
        })) ?? [],
      );
      const hasBulkAcademyDaySchedules = bulkAcademyDayTimeMap.size > 0;
      const dowToNameBulkAcademy: Record<number, string> = {
        0: "일",
        1: "월",
        2: "화",
        3: "수",
        4: "목",
        5: "금",
        6: "토",
      };
      const pad2AcademyBulk = (n: number) => String(n).padStart(2, "0");

      // 회차 시각 — dto 지정 > 요일 규칙 > 미저장(null). 대표값(Class.startTime) 폴백 제거.
      //   산출 시각은 회차 row 의 startTime/endTime(text) 필드에 직접 저장.
      // scheduledDate(@db.Date)는 UTC 자정 규약 — UTC 기준 순회로 날짜만 정확히 저장.
      const dates: Date[] = [];
      const cursor = dateOnlyToUtc(dto.startDate);
      const cursorEnd = dateOnlyToUtc(dto.endDate);
      while (cursor <= cursorEnd) {
        const dow = cursor.getUTCDay();
        if (targetDows.has(dow)) {
          const dt = new Date(cursor);
          const dayName = dowToNameBulkAcademy[dow];
          const entry =
            hasBulkAcademyDaySchedules && dayName
              ? bulkAcademyDayTimeMap.get(dayName)
              : undefined;
          weekdayTimeByDate.set(dateOnlyToString(dt), {
            startTime:
              dto.startTime ??
              (entry
                ? `${pad2AcademyBulk(entry.startHH)}:${pad2AcademyBulk(entry.startMM)}`
                : null),
            endTime:
              dto.endTime ??
              (entry
                ? `${pad2AcademyBulk(entry.endHH)}:${pad2AcademyBulk(entry.endMM)}`
                : null),
            venueId: entry?.venueId ?? dto.venueId ?? null,
          });
          dates.push(dt);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      candidateDates = dates;
    }

    if (candidateDates.length === 0) {
      return { created: 0, skipped: 0, schedules: [] };
    }

    if (candidateDates.length > 200) {
      throw new ForbiddenException(
        "한 번에 생성 가능한 일정은 최대 200건입니다.",
      );
    }

    // 취소된 일정은 중복으로 보지 않음 — 취소했던 날짜에 재등록 허용.
    // [설계 v4 §4.3-②] 범위 경계 min/max 명시 계산 (정렬 암묵 가정 제거).
    const candidateTimes = candidateDates.map((d) => d.getTime());
    const rangeMin = new Date(Math.min(...candidateTimes));
    const rangeMax = new Date(Math.max(...candidateTimes));
    const existing = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        scheduledDate: { gte: rangeMin, lte: rangeMax },
        isCancelled: false,
      },
      select: { scheduledDate: true },
    });
    // scheduledDate(@db.Date) 동등성은 시각 성분 무시 — UTC 날짜 문자열로 중복 판정.
    const existingSet = new Set(
      existing.map((e) => dateOnlyToString(e.scheduledDate)),
    );
    const toCreate = candidateDates.filter(
      (d) => !existingSet.has(dateOnlyToString(d)),
    );

    if (toCreate.length === 0) {
      return { created: 0, skipped: candidateDates.length, schedules: [] };
    }

    // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ─────────────────────────
    // [STATUS] 비활성 — 아카데미 bulk 일정 추가 시 RSVP 자동 생성 차단
    // [WHY] RSVP 기능 미완성 (학부모 /rsvp API 경로 오류, 코치 /coach-rsvp 진입점 0개)
    // [TO RE-ENABLE] 아래 enrollments 조회 + RSVP createMany 블록 주석 해제
    // [TO DELETE] grep "RSVP_DISABLED_2026-05-28" 으로 5곳 일괄 검색 → 블록 통째 삭제
    // [REF] docs/Planning/RSVP_FEATURE_ANALYSIS.md §6
    /*
    const enrollments = await this.prisma.enrollment.findMany({
      where: { classId, status: "paid" },
      select: { childId: true, requestedBy: true },
    });
    */
    // ─── RSVP_DISABLED_2026-05-28 ─── END ───────────────────────────

    // 날짜 배열 모드: 선택 날짜들에 공통 시각·장소를 ClassSchedule 필드로 저장 (오픈클래스 방식 통일).
    const scheduleExtra = useDates
      ? {
          startTime: dto.startTime ?? null,
          endTime: dto.endTime ?? null,
          venueId: dto.venueId ?? null,
        }
      : null;

    const createdSchedules = await this.prisma.$transaction(async (tx) => {
      // [설계 v4 §4.3-③] schedule writer 공용 lock + lock 안 중복 재검증
      //   (팀 bulk 와 동일 — 최종 방어는 활성 일정 부분 유니크 인덱스).
      await acquireClassScheduleLock(tx, classId);
      const freshExisting = await tx.classSchedule.findMany({
        where: {
          classId,
          scheduledDate: { gte: rangeMin, lte: rangeMax },
          isCancelled: false,
        },
        select: { scheduledDate: true },
      });
      const freshSet = new Set(
        freshExisting.map((e) => dateOnlyToString(e.scheduledDate)),
      );
      const toCreateFresh = toCreate.filter(
        (d) => !freshSet.has(dateOnlyToString(d)),
      );
      const schedules = await Promise.all(
        toCreateFresh.map((scheduledDate) =>
          tx.classSchedule.create({
            data: {
              classId,
              scheduledDate,
              ...(scheduleExtra ??
                weekdayTimeByDate.get(dateOnlyToString(scheduledDate)) ??
                {}),
            },
          }),
        ),
      );

      // ─── RSVP_DISABLED_2026-05-28 ─── BEGIN ───────────────────────
      // [STATUS] 비활성 — RSVP createMany 블록 차단
      // [TO RE-ENABLE] 위 enrollments 조회 블록과 함께 주석 해제
      /*
      if (enrollments.length > 0 && schedules.length > 0) {
        const rsvpRows = schedules.flatMap((schedule) =>
          enrollments.map((e) => ({
            scheduleId: schedule.id,
            userId: e.requestedBy,
            childId: e.childId,
            status: "PENDING" as const,
          })),
        );
        if (rsvpRows.length > 0) {
          await tx.classRsvp.createMany({
            data: rsvpRows,
            skipDuplicates: true,
          });
        }
      }
      */
      // ─── RSVP_DISABLED_2026-05-28 ─── END ─────────────────────────

      return schedules;
    });

    return {
      created: createdSchedules.length,
      skipped: candidateDates.length - createdSchedules.length,
      schedules: createdSchedules.map((s) => ({
        id: s.id,
        classId: s.classId,
        scheduledDate: s.scheduledDate,
        isCancelled: s.isCancelled,
        createdAt: s.createdAt,
      })),
    };
  }

  /**
   * 수업 일정 취소
   *
   * 2026-05-14: expectedOwner 옵션 추가 — 학원 도메인 컨트롤러에서 path 의
   *   academyId 일치 검증 + 학원 권한 가드 분기 위한 보강.
   *   - expectedOwner.teamId 가 주어지면 schedule.class.teamId 일치 확인
   *   - expectedOwner.academyId 가 주어지면 schedule.class.academyId 일치 확인
   *   - 미지정 호출(기존 팀 컨트롤러)은 schedule.class.teamId 기반 기존 동작 유지
   */
  async cancelClassSchedule(
    coachUserId: string,
    scheduleId: string,
    cancellationReason?: string,
    expectedOwner?: { teamId?: string; academyId?: string },
  ) {
    // 일정 확인
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: {
        class: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    // path owner 일치 검증 (옵션)
    if (
      expectedOwner?.teamId &&
      schedule.class.teamId !== expectedOwner.teamId
    ) {
      throw new ForbiddenException("이 일정을 취소할 권한이 없습니다.");
    }
    if (
      expectedOwner?.academyId &&
      schedule.class.academyId !== expectedOwner.academyId
    ) {
      throw new ForbiddenException("이 일정을 취소할 권한이 없습니다.");
    }

    // 권한 검증 — owner 종류별 분기
    if (schedule.class.teamId) {
      // 팀 수업: 기존 팀 매니저 가드
      await this.teamsService.assertTeamManagerPermission(
        coachUserId,
        schedule.class.teamId,
        "이 일정을 취소할 권한이 없습니다.",
      );
    } else if (schedule.class.academyId) {
      // 학원 수업: 학원 감독/소속 코치 가드
      await this.assertAcademyManagerPermission(
        coachUserId,
        schedule.class.academyId,
        "이 일정을 취소할 권한이 없습니다.",
      );
    } else {
      // orphan (teamId·academyId 모두 null) — 정상 데이터에선 발생 안 함
      throw new ForbiddenException("이 일정을 취소할 권한이 없습니다.");
    }

    // 지난 회차(오늘 KST 이전)는 이미 진행된 사실 기록(출석·정산 근거) — 소급 취소 금지.
    //   취소 트랜잭션이 출석 상태 변경·크레딧 복원을 동반하므로 과거에 실행하면
    //   후불 정산(출석×단가)·선불 차감 근거가 왜곡된다.
    //   경계는 dateSchedules diff 불가침과 동일(오늘 회차는 당일 취소 허용).
    if (schedule.scheduledDate < kstTodayUtcMidnight()) {
      throw new ForbiddenException("지난 일정은 취소할 수 없습니다.");
    }

    // 일정 취소 + 출석 상태 변경 + 크레딧 복원 — 원자적 트랜잭션
    const cancelledSchedule = await this.prisma.$transaction(async (tx) => {
      // [설계 v4 §4.3-①] schedule lock(무조건) → postpaid lock(IfNeeded) 고정 순서.
      //   postpaid lock 단독은 PREPAID 수업에서 no-op 이라 동시 취소가 직렬화되지
      //   않아 크레딧이 중복 복원될 수 있었다.
      await acquireClassScheduleAndPostpaidLocksIfNeeded(tx, schedule.class.id);
      // 멱등 no-op — tx 밖에서 읽은 schedule 은 lock 대기 중 낡을 수 있으므로
      //   lock 획득 후 재조회로 판정한다. 이미 취소된 회차의 재취소(재시도·중복 탭)는
      //   에러가 아니라 현재 상태 반환 — 정산월 검증보다 먼저 (no-op 까지 막지 않도록).
      const fresh = await tx.classSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
        select: {
          id: true,
          scheduledDate: true,
          isCancelled: true,
          cancellationReason: true,
        },
      });
      if (fresh.isCancelled) {
        return fresh;
      }
      // P3-H1 — 정산 확정 월의 출석 변경은 lock 안에서 재검증 후 거부.
      await assertScheduleMonthNotSettled(tx, scheduleId);
      // [설계 v4 §4.3-①] 부수효과 단일 진입 게이트 — isCancelled:false 조건부
      //   update 의 count=1 승자만 출석·크레딧 부수효과를 실행한다(이중 방어).
      const gate = await tx.classSchedule.updateMany({
        where: { id: scheduleId, isCancelled: false },
        data: {
          isCancelled: true,
          cancellationReason,
        },
      });
      if (gate.count !== 1) {
        return { ...fresh, isCancelled: true };
      }
      const updated = await tx.classSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
        select: {
          id: true,
          scheduledDate: true,
          isCancelled: true,
          cancellationReason: true,
        },
      });

      // 취소 부수효과 — apply-draft 와 공용 헬퍼 (설계 v4 §4.1-7).
      await this.runScheduleCancelSideEffects(tx, {
        scheduleId,
        classId: schedule.class.id,
        actorUserId: coachUserId,
        cancellationReason,
      });

      return updated;
    });

    return {
      id: cancelledSchedule.id,
      scheduledDate: cancelledSchedule.scheduledDate,
      isCancelled: cancelledSchedule.isCancelled,
      cancellationReason: cancelledSchedule.cancellationReason,
      updatedAt: new Date(),
    };
  }

  /**
   * 일정 취소 부수효과 — 승자 게이트(isCancelled:false→true count=1) 통과 후에만 호출.
   *  출석 cancelled 전환 · creditDeducted=false 해제(중복 복원 근원 제거) ·
   *  수업권 복원(User×Class FIFO) · AuditLog. cancelClassSchedule/applyScheduleDraft 공용.
   */
  private async runScheduleCancelSideEffects(
    tx: Prisma.TransactionClient,
    args: {
      scheduleId: string;
      classId: string;
      actorUserId: string;
      cancellationReason?: string;
    },
  ): Promise<void> {
    const { scheduleId, classId, actorUserId, cancellationReason } = args;
    // 크레딧이 차감된 출석 기록 조회
    const deductedAttendances = await tx.classAttendance.findMany({
      where: { scheduleId, creditDeducted: true },
    });

    // 출석 상태 일괄 변경 — 차감 플래그는 아래에서 **실제 복원 성공분에만** 해제한다.
    //   복원받지 못한 출석(유효 수업권 없음·usedSessions=0)의 플래그를 지우면
    //   미복원 상태가 복원 완료처럼 고착되어 수동 복구 근거가 사라진다 (Codex R2-B1).
    //   잔존 플래그의 중복 복원 위험은 취소 멱등 no-op(재취소가 부수효과에 도달하지
    //   않음)과 apply-draft ledger replay 가 차단한다.
    await tx.classAttendance.updateMany({
      where: { scheduleId },
      data: {
        attendanceStatus: "cancelled",
      },
    });

    // 수업권 복원 (차감되었던 출석 기록에 대해서만) — 2026-04-27 (N-9): User × Class 단위
    if (deductedAttendances.length > 0) {
      const userIds = deductedAttendances.map((a) => a.memberId); // memberId 는 User.id
      const now = new Date();

      // 1) 해당 수업의 유효한 수업권 1회 조회 (userId 별 만료 임박순)
      const memberCredits = await tx.memberCredit.findMany({
        where: {
          userId: { in: userIds },
          classId,
          expiresAt: { gte: now },
          ...creditStartedWhere(now),
        },
        orderBy: { expiresAt: "asc" },
        select: {
          id: true,
          userId: true,
          totalSessions: true,
          usedSessions: true,
        },
      });

      // userId → 첫 번째 유효 수업권 매핑
      const creditByUser = new Map<string, (typeof memberCredits)[0]>();
      for (const c of memberCredits) {
        if (!creditByUser.has(c.userId)) {
          creditByUser.set(c.userId, c);
        }
      }

      const creditIdsToRestore: string[] = [];
      for (const attendance of deductedAttendances) {
        const credit = creditByUser.get(attendance.memberId);
        if (credit) {
          creditIdsToRestore.push(credit.id);
        }
      }

      // 실제 감소 성공한 creditId 집합 — flag/audit 결합의 SoT (Codex R2-B1).
      let restoredCreditIdSet = new Set<string>();
      if (creditIdsToRestore.length > 0) {
        // PR-B (v0.5): CreditDomainService.bulkRestoreOne 위임
        // (성공분만 decrement + CreditTransaction(restored) INSERT, 성공 id 반환)
        const { restoredCount, restoredCreditIds } =
          await this.creditDomain.bulkRestoreOne(tx, {
            creditIds: creditIdsToRestore,
            reason: `수업 일정 취소 - 수업권 복원 (사유: ${cancellationReason || "미기재"})`,
            adjustedBy: actorUserId,
            scheduleId,
          });
        restoredCreditIdSet = new Set(restoredCreditIds);

        if (restoredCount < creditIdsToRestore.length) {
          this.logger.warn(
            `수업권 복원 부분 실패: 대상 ${creditIdsToRestore.length}개 중 ${restoredCount}개만 복원 (나머지는 usedSessions=0 — 해당 출석의 creditDeducted 플래그는 보존)`,
          );
        }
      }

      // 복원 성공한 출석만 차감 플래그 해제 + AuditLog creditDelta:1.
      const restoredAttendanceIds: string[] = [];
      for (const attendance of deductedAttendances) {
        const credit = creditByUser.get(attendance.memberId);
        if (credit && restoredCreditIdSet.has(credit.id)) {
          restoredAttendanceIds.push(attendance.id);
        }
      }
      if (restoredAttendanceIds.length > 0) {
        await tx.classAttendance.updateMany({
          where: { id: { in: restoredAttendanceIds } },
          data: { creditDeducted: false },
        });
      }
      const restoredAttendanceIdSet = new Set(restoredAttendanceIds);

      // PR-C (v0.6): AuditLog INSERT — creditDelta 는 실제 복원 성공 여부에 결합.
      for (const attendance of deductedAttendances) {
        await this.auditLog.record(tx, {
          attendanceId: attendance.id,
          scheduleId,
          memberId: attendance.memberId,
          actorUserId,
          actionType: "clear",
          fromStatus: "present",
          toStatus: "cancelled",
          creditDelta: restoredAttendanceIdSet.has(attendance.id) ? 1 : 0,
          reason: `수업 일정 취소 (사유: ${cancellationReason || "미기재"})`,
        });
      }
    }
  }

  /**
   * [설계 v4 §4.1] 일정 draft 일괄 반영 — 단일 요청·단일 트랜잭션 all-or-nothing.
   *  additions(신규) + edits(시간·장소, baseUpdatedAt 잠금) + cancellations(취소, 동일 잠금).
   *  operationId 멱등: 같은 id·같은 payload 재요청은 저장 결과 replay(쓰기 0),
   *  같은 id·다른 payload 는 409. 버전 불일치·이미 취소·부재는 전체 롤백 + 409
   *  DRAFT_CONFLICT(conflicts 목록). 팀/학원 공용(expectedOwner 분기 — cancel 미러).
   */
  async applyScheduleDraft(
    coachUserId: string,
    classId: string,
    dto: ApplyScheduleDraftDto,
    expectedOwner?: { teamId?: string; academyId?: string },
  ) {
    const totalItems =
      dto.additions.length + dto.edits.length + dto.cancellations.length;
    // 빈 요청은 거부 — 조기 200 반환은 권한·lock·ledger(멱등 대조)를 전부 우회해
    //   operationId 계약을 깨뜨린다 (Codex R1-2). 프론트는 dirty>0 에서만 저장한다.
    if (totalItems === 0) {
      throw new BadRequestException("반영할 변경이 없습니다.");
    }
    if (totalItems > 200) {
      throw new ForbiddenException("한 번에 반영 가능한 변경은 최대 200건입니다.");
    }

    // 권한·owner 검증 — cancelClassSchedule 분기 미러.
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true, academyId: true, trainingType: true },
    });
    if (!classRecord) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    if (expectedOwner?.teamId && classRecord.teamId !== expectedOwner.teamId) {
      throw new ForbiddenException("이 수업의 일정을 변경할 권한이 없습니다.");
    }
    if (
      expectedOwner?.academyId &&
      classRecord.academyId !== expectedOwner.academyId
    ) {
      throw new ForbiddenException("이 수업의 일정을 변경할 권한이 없습니다.");
    }
    if (classRecord.teamId) {
      await this.teamsService.assertTeamManagerPermission(
        coachUserId,
        classRecord.teamId,
        "이 수업의 일정을 변경할 권한이 없습니다.",
      );
    } else if (classRecord.academyId) {
      await this.assertAcademyManagerPermission(
        coachUserId,
        classRecord.academyId,
        "이 수업의 일정을 변경할 권한이 없습니다.",
      );
    } else {
      throw new ForbiddenException("이 수업의 일정을 변경할 권한이 없습니다.");
    }

    // 시각 형식 검증 — edits 는 빈 문자열(해제)을 허용해 DTO 정규식 대신 여기서 판정.
    const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
    for (const e of dto.edits) {
      for (const t of [e.startTime, e.endTime]) {
        if (t !== undefined && t !== "" && !HHMM.test(t)) {
          throw new BadRequestException("시각은 HH:mm 형식이어야 합니다.");
        }
      }
    }

    // additions 정규화 — 날짜 dedupe + 오름차순 (§4.1-6, 프론트 계약 외 호출 방어).
    const additionByDate = new Map<string, (typeof dto.additions)[0]>();
    for (const a of dto.additions) {
      if (!additionByDate.has(a.date)) additionByDate.set(a.date, a);
    }
    const additions = Array.from(additionByDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    const today = kstTodayUtcMidnight();
    for (const a of additions) {
      // 엄격 달력 날짜 검증 — DTO IsDateString 은 full ISO 도 통과시키고, JS Date 는
      //   2026-02-30 같은 무효 날짜를 자동 보정하므로 왕복 대조로 차단 (Codex R1-4).
      const parsed = dateOnlyToUtc(a.date);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(a.date) ||
        Number.isNaN(parsed.getTime()) ||
        dateOnlyToString(parsed) !== a.date
      ) {
        throw new BadRequestException(
          "날짜는 YYYY-MM-DD 형식의 유효한 달력 날짜여야 합니다.",
        );
      }
      if (parsed < today) {
        throw new BadRequestException("지난 날짜에는 일정을 추가할 수 없습니다.");
      }
    }

    // payload digest — actor 까지 결합(설계 §4.1-8 class/actor/body 바인딩).
    //   같은 operationId 에 다른 내용/다른 행위자가 오면 409 (Codex R1-5).
    const payloadDigest = createHash("sha256")
      .update(
        JSON.stringify({
          classId,
          actorId: coachUserId,
          additions,
          edits: dto.edits,
          cancellations: dto.cancellations,
        }),
      )
      .digest("hex");

    const editIds = dto.edits.map((e) => e.scheduleId);
    const cancelIds = dto.cancellations.map((c) => c.scheduleId);
    // 수정+취소 동시 지시 금지 — 프론트 reducer invariant 의 서버 이중 방어.
    const cancelIdSet = new Set(cancelIds);
    if (
      editIds.some((id) => cancelIdSet.has(id)) ||
      new Set(editIds).size !== editIds.length ||
      cancelIdSet.size !== cancelIds.length
    ) {
      throw new BadRequestException(
        "같은 회차에 중복 지시가 있습니다. 새로고침 후 다시 시도해주세요.",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // [§4.1-3] schedule lock(무조건) → postpaid lock(IfNeeded) — writer 전체 직렬화.
      await acquireClassScheduleAndPostpaidLocksIfNeeded(tx, classId);

      // [§4.1-2] 멱등 replay — lock 획득 후 조회 (동시 같은 operationId 수렴).
      const priorOp = await tx.scheduleApplyOperation.findUnique({
        where: { id: dto.operationId },
      });
      if (priorOp) {
        if (priorOp.payloadDigest !== payloadDigest) {
          throw new ConflictException({
            errorCode: "OPERATION_MISMATCH",
            message:
              "같은 요청 ID 로 다른 내용이 전송되었습니다. 새로고침 후 다시 시도해주세요.",
          });
        }
        return priorOp.result as {
          applied: boolean;
          created: number;
          skipped: number;
          edited: number;
          cancelled: number;
        };
      }

      // [§4.1-4] 대상 row tx 내 재조회 (사전 조회값 재사용 금지 — TOCTOU 차단).
      const targetIds = [...editIds, ...cancelIds];
      const rows = targetIds.length
        ? await tx.classSchedule.findMany({
            where: { id: { in: targetIds } },
            select: {
              id: true,
              classId: true,
              scheduledDate: true,
              isCancelled: true,
              updatedAt: true,
            },
          })
        : [];
      const rowById = new Map(rows.map((r) => [r.id, r]));

      // [§4.1-5] 버전·상태 검증 — 하나라도 어긋나면 전체 롤백 + 409 DRAFT_CONFLICT.
      const conflicts: {
        scheduleId: string;
        type: "version" | "already_cancelled" | "not_found";
      }[] = [];
      const verify = (scheduleId: string, baseUpdatedAt: string) => {
        const row = rowById.get(scheduleId);
        if (!row || row.classId !== classId) {
          conflicts.push({ scheduleId, type: "not_found" });
          return null;
        }
        if (row.isCancelled) {
          conflicts.push({ scheduleId, type: "already_cancelled" });
          return null;
        }
        if (row.updatedAt.getTime() !== new Date(baseUpdatedAt).getTime()) {
          conflicts.push({ scheduleId, type: "version" });
          return null;
        }
        return row;
      };
      const editRows = dto.edits.map((e) => verify(e.scheduleId, e.baseUpdatedAt));
      const cancelRows = dto.cancellations.map((c) =>
        verify(c.scheduleId, c.baseUpdatedAt),
      );
      if (conflicts.length > 0) {
        throw new ConflictException({
          errorCode: "DRAFT_CONFLICT",
          message:
            "다른 곳에서 먼저 변경된 회차가 있습니다. 목록을 확인한 뒤 다시 저장해주세요.",
          conflicts,
        });
      }

      // 지난 회차 edit/cancel 거부 — 사실 기록 불가침 (전체 롤백).
      for (const row of [...editRows, ...cancelRows]) {
        if (row && row.scheduledDate < today) {
          throw new ForbiddenException(
            "지난 일정은 수정하거나 취소할 수 없습니다.",
          );
        }
      }

      // 정산 확정 월 검증 (cancel — P3-H1).
      for (const c of dto.cancellations) {
        await assertScheduleMonthNotSettled(tx, c.scheduleId);
      }

      // [§4.1-6] additions 활성 중복 skip (취소 날짜 재등록 허용 — 정확 날짜 매칭).
      let skipped = 0;
      let toCreate = additions;
      if (additions.length > 0) {
        const addDates = additions.map((a) => dateOnlyToUtc(a.date));
        const addTimes = addDates.map((d) => d.getTime());
        const existing = await tx.classSchedule.findMany({
          where: {
            classId,
            scheduledDate: {
              gte: new Date(Math.min(...addTimes)),
              lte: new Date(Math.max(...addTimes)),
            },
            isCancelled: false,
          },
          select: { scheduledDate: true },
        });
        const existingSet = new Set(
          existing.map((e) => dateOnlyToString(e.scheduledDate)),
        );
        toCreate = additions.filter((a) => !existingSet.has(a.date));
        skipped = additions.length - toCreate.length;
      }

      // spot(1회용) — 활성(취소 예정 차감) + 신규 합산 1개 제한 (§7.1).
      if (classRecord.trainingType === "spot") {
        const activeCount = await tx.classSchedule.count({
          where: { classId, isCancelled: false },
        });
        if (activeCount - dto.cancellations.length + toCreate.length > 1) {
          throw new BadRequestException(
            "1회용 수업은 일정을 1개만 등록할 수 있습니다.",
          );
        }
      }

      // [§4.1-7] 반영 — 전 항목 조건부 mutation (lock 과 이중 방어).
      for (const e of dto.edits) {
        const gate = await tx.classSchedule.updateMany({
          where: {
            id: e.scheduleId,
            isCancelled: false,
            updatedAt: new Date(e.baseUpdatedAt),
          },
          data: {
            ...(e.startTime !== undefined
              ? { startTime: e.startTime || null }
              : {}),
            ...(e.endTime !== undefined ? { endTime: e.endTime || null } : {}),
            ...(e.venueId !== undefined ? { venueId: e.venueId || null } : {}),
          },
        });
        if (gate.count !== 1) {
          throw new ConflictException({
            errorCode: "DRAFT_CONFLICT",
            message:
              "다른 곳에서 먼저 변경된 회차가 있습니다. 목록을 확인한 뒤 다시 저장해주세요.",
            conflicts: [{ scheduleId: e.scheduleId, type: "version" }],
          });
        }
      }
      for (const c of dto.cancellations) {
        const gate = await tx.classSchedule.updateMany({
          where: {
            id: c.scheduleId,
            isCancelled: false,
            updatedAt: new Date(c.baseUpdatedAt),
          },
          data: { isCancelled: true, cancellationReason: c.reason },
        });
        if (gate.count !== 1) {
          throw new ConflictException({
            errorCode: "DRAFT_CONFLICT",
            message:
              "다른 곳에서 먼저 변경된 회차가 있습니다. 목록을 확인한 뒤 다시 저장해주세요.",
            conflicts: [{ scheduleId: c.scheduleId, type: "version" }],
          });
        }
        // 승자만 부수효과 (출석 cancelled·creditDeducted=false·크레딧 복원·AuditLog).
        await this.runScheduleCancelSideEffects(tx, {
          scheduleId: c.scheduleId,
          classId,
          actorUserId: coachUserId,
          cancellationReason: c.reason,
        });
      }
      // createMany + skipDuplicates(ON CONFLICT DO NOTHING) — 부분 유니크 인덱스
      //   충돌을 에러 없이 skip 으로 수렴. PostgreSQL 은 제약 위반(P2002) 발생 시
      //   트랜잭션이 aborted 상태가 되어 catch 후 후속 쿼리가 전부 실패하므로,
      //   개별 create+catch 방식은 같은 트랜잭션에서 성립하지 않는다 (Codex R1-1).
      let created = 0;
      if (toCreate.length > 0) {
        const res = await tx.classSchedule.createMany({
          data: toCreate.map((a) => ({
            classId,
            scheduledDate: dateOnlyToUtc(a.date),
            startTime: a.startTime || null,
            endTime: a.endTime || null,
            venueId: a.venueId || null,
          })),
          skipDuplicates: true,
        });
        created = res.count;
        skipped += toCreate.length - res.count;
      }

      const summary = {
        applied: true,
        created,
        skipped,
        edited: dto.edits.length,
        cancelled: dto.cancellations.length,
      };
      // [§4.1-8] 멱등 ledger — 같은 트랜잭션에서 기록 (커밋과 원자).
      await tx.scheduleApplyOperation.create({
        data: {
          id: dto.operationId,
          classId,
          actorId: coachUserId,
          payloadDigest,
          result: summary,
        },
      });
      return summary;
    });

    this.logger.log(
      `[AUDIT] 일정 draft 반영: classId=${classId}, op=${dto.operationId}, created=${result.created}, skipped=${result.skipped}, edited=${result.edited}, cancelled=${result.cancelled}, by=${coachUserId}`,
    );
    return result;
  }

  /**
   * 개별 회차 시간·장소 수정 — 팀/학원 공용 (cancelClassSchedule 권한 분기 미러링).
   *  - expectedOwner 로 path owner 일치 검증 + owner 종류별 매니저 가드.
   *  - 취소된 일정은 수정 불가.
   *  - 전달된 필드만 부분 반영(venueId 빈 문자열 → null 장소 해제).
   */
  async updateClassSchedule(
    coachUserId: string,
    scheduleId: string,
    dto: { startTime?: string; endTime?: string; venueId?: string },
    expectedOwner?: { teamId?: string; academyId?: string },
  ) {
    const schedule = await this.prisma.classSchedule.findUnique({
      where: { id: scheduleId },
      include: { class: true },
    });

    if (!schedule) {
      throw new NotFoundException("일정을 찾을 수 없습니다.");
    }

    if (
      expectedOwner?.teamId &&
      schedule.class.teamId !== expectedOwner.teamId
    ) {
      throw new ForbiddenException("이 일정을 수정할 권한이 없습니다.");
    }
    if (
      expectedOwner?.academyId &&
      schedule.class.academyId !== expectedOwner.academyId
    ) {
      throw new ForbiddenException("이 일정을 수정할 권한이 없습니다.");
    }

    if (schedule.class.teamId) {
      await this.teamsService.assertTeamManagerPermission(
        coachUserId,
        schedule.class.teamId,
        "이 일정을 수정할 권한이 없습니다.",
      );
    } else if (schedule.class.academyId) {
      await this.assertAcademyManagerPermission(
        coachUserId,
        schedule.class.academyId,
        "이 일정을 수정할 권한이 없습니다.",
      );
    } else {
      throw new ForbiddenException("이 일정을 수정할 권한이 없습니다.");
    }

    if (schedule.isCancelled) {
      throw new ForbiddenException("취소된 일정은 수정할 수 없습니다.");
    }

    // 지난 회차는 읽기 전용(사실 기록) — 수업 수정 폼 diff 불가침과 동일 경계.
    if (schedule.scheduledDate < kstTodayUtcMidnight()) {
      throw new ForbiddenException("지난 일정은 수정할 수 없습니다.");
    }

    const data: {
      startTime?: string | null;
      endTime?: string | null;
      venueId?: string | null;
    } = {};
    if (dto.startTime !== undefined) data.startTime = dto.startTime || null;
    if (dto.endTime !== undefined) data.endTime = dto.endTime || null;
    if (dto.venueId !== undefined) data.venueId = dto.venueId || null;

    // [설계 v4 §4.3-③] schedule writer 공용 lock — 취소·bulk·apply-draft 와 직렬화.
    //   취소 판정은 tx 밖 조회가 lock 대기 중 낡을 수 있어 조건부 update 로 재검증
    //   (count=0 = 그 사이 취소됨 → 기존 메시지로 거부).
    const updated = await this.prisma.$transaction(async (tx) => {
      await acquireClassScheduleLock(tx, schedule.class.id);
      const gate = await tx.classSchedule.updateMany({
        where: { id: scheduleId, isCancelled: false },
        data,
      });
      if (gate.count !== 1) {
        throw new ForbiddenException("취소된 일정은 수정할 수 없습니다.");
      }
      return tx.classSchedule.findUniqueOrThrow({
        where: { id: scheduleId },
        include: { venue: { select: { id: true, name: true } } },
      });
    });

    return {
      id: updated.id,
      classId: updated.classId,
      scheduledDate: updated.scheduledDate,
      startTime: updated.startTime,
      endTime: updated.endTime,
      venue: updated.venue,
      isCancelled: updated.isCancelled,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * 특정 기간의 수업 일정 조회
   */
  async getClassSchedulesByDateRange(
    classId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    // date-only('2026-04-21') 입력 시 양 경계가 동일 UTC 자정이 되어 쿼리가 단일 시점으로 축소됨.
    // endDate를 해당 날짜 끝(23:59:59.999)까지 확장해 "그 날까지 포함" 의미를 유지한다.
    // 기간 경계는 주어진 것만 적용 — startDate·endDate 둘 다 없으면 해당 수업 전체 회차 반환.
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const schedules = await this.prisma.classSchedule.findMany({
      where: {
        classId,
        ...(startDate || endDate ? { scheduledDate: dateFilter } : {}),
      },
      include: {
        attendances: {
          select: {
            id: true,
            memberId: true,
            attendanceStatus: true,
          },
        },
        // [2026-06-09] 오픈클래스 날짜별 일정 — 장소명 표시용 venue 조인.
        venue: { select: { id: true, name: true } },
      },
      orderBy: {
        scheduledDate: "asc",
      },
    });

    return schedules;
  }

  /**
   * 여러 수업의 기간 일정 일괄 조회 — 달력 화면 전용.
   *
   * 달력은 수업 N개의 같은 기간 일정을 함께 그린다. 수업마다 단건 조회를 돌면 요청 수가
   * 수업 수에 비례해 늘어(월 전환 1회당 수업 수만큼) rate limit 을 소진하므로 한 번으로 묶는다.
   * 응답 행의 classId 로 호출측이 수업별로 재분배한다. 출석(attendances)은 달력이 쓰지 않아 제외.
   */
  async getSchedulesByClassIds(
    classIds: string[],
    startDate?: Date,
    endDate?: Date,
  ) {
    if (classIds.length === 0) return [];

    // 경계 규칙은 단건 조회(getClassSchedulesByDateRange)와 동일 — date-only 입력의
    // endDate 를 그 날 끝(23:59:59.999)까지 확장해 "그 날까지 포함" 의미를 유지.
    const dateFilter: Prisma.DateTimeFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setUTCHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    return this.prisma.classSchedule.findMany({
      where: {
        classId: { in: classIds },
        ...(startDate || endDate ? { scheduledDate: dateFilter } : {}),
      },
      select: {
        id: true,
        classId: true,
        scheduledDate: true,
        startTime: true,
        endTime: true,
        isCancelled: true,
        venue: { select: { id: true, name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    });
  }

  /**
   * 수업 상품 생성 (감독만)
   */
  async createClassProduct(
    coachUserId: string,
    teamId: string,
    classId: string,
    createProductDto: CreateClassProductDto,
  ) {
    // 권한 검증 — 3가지 경로 중 하나 만족 (assertTeamManagerPermission)
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 상품을 생성할 수 있습니다.",
    );

    // 수업 존재 및 클럽 소속 확인
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    if (!classRecord || classRecord.teamId !== teamId) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    // 발급 수량 SoT = sessionsPerMonth. 미전송 = 0(크레딧 미발급 기본).
    const resolvedSessionsPerMonth = createProductDto.sessionsPerMonth ?? 0;

    const product = await this.prisma.classProduct.create({
      data: {
        classId,
        productName: createProductDto.productName,
        description: createProductDto.description,
        price: createProductDto.price,
        sessionsPerMonth: resolvedSessionsPerMonth,
        durationDays: createProductDto.durationDays || 30,
      },
    });

    // 상품이 수업 조회 응답에 포함되므로 캐시 무효화 (학부모 결제 화면 stale 방지)
    await this.invalidateClassCache(teamId);

    return {
      id: product.id,
      classId: product.classId,
      productName: product.productName,
      description: product.description,
      price: product.price,
      sessionsPerMonth: product.sessionsPerMonth,
      durationDays: product.durationDays,
      createdAt: product.createdAt,
    };
  }

  /**
   * 수업 상품 목록 조회
   *
   * [사용자 직접 지시 2026-05-22] PARENT/CHILD/TEEN 시점에는 비활성 패키지를 응답에서 제외.
   *   `/classes/[id]` 수업 상세 + `/payment/options` 결제 화면 모두 동일하게 학부모/학생 시점
   *   에선 결제 가능한 옵션만 노출 → 시각 노이즈 최소화 + UX 일관성.
   *   COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN 은 모두 노출 (운영 디버깅 + PackageManageSection 연동).
   *   requester 미전달은 레거시 호출(테스트·내부 헬퍼) — 보수적으로 모두 노출.
   */
  async getClassProducts(classId: string, requester?: JwtUserPayload) {
    // PACKAGE_END_GUARD (2026-05-22) — Class.endTime 동반 조회.
    // 응답에 isPurchasable / expectedExpiresAt / classEndDate / disabledReason 계산 필드 부여.
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        endTime: true,
        academyId: true,
        salesOpenMonth: true,
      },
    });

    if (!classRecord) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const products = await this.prisma.classProduct.findMany({
      where: { classId },
      select: {
        id: true,
        productName: true,
        description: true,
        price: true,
        sessionsPerMonth: true,
        durationDays: true,
        // 결제 플로우(/payment/options)에서 Fee Type Selection / 횟수제 가격 계산에 필수
        feeType: true,
        billingMonth: true,
        feePerSession: true,
        sessionsPerWeek: true,
        billingTiming: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: {
        price: "asc",
      },
    });

    // PACKAGE_END_GUARD (v3 · SoT 단일화 2026-05-22):
    //   classes/utils/package-guard.util.ts:computePackageGuardMeta() 호출로 메타 주입.
    //   shouldHideInactiveFor(requester?.userType) — PARENT/CHILD/TEEN 비활성 제외.
    // classEndDate 메타 — 대표값(Class.endTime)은 날짜부가 등록일로 오염되어 폐기(null 고정).
    // [Lifecycle v4.1 §9.2] 학부모행(PARENT/CHILD/TEEN — shouldHideInactiveFor 와 동일 기준)
    //   요청은 판매 노출분(승인월+무월 레거시)만 — 결제 옵션 1차 소스가 이 API 라서
    //   미필터 시 지난 월분 카드가 노출됨 (Reviewer F2. 결제는 race 가드로 봉인되나 UX 갭).
    //   감독/관리자는 이력 확인용 전체 유지 (확인 플로우 needsUpdate 산출에 이전 분 필요).
    const roleScoped = shouldHideInactiveFor(requester?.userType)
      ? filterSellableProducts(products, classRecord.salesOpenMonth)
      : products;

    // [가격 잠금 Phase 5] 잠금 상태 3필드 emit — FE 가 저장 400 대신 사전 disabled 로
    //   안내하기 위한 additive 필드 (기존 소비처 영향 0).
    //   priceLocked 는 salesOpenMonth 비교뿐(결제 조회 0) — N+1 없음.
    //   후불 미정산 월은 클래스당 1회 산출해 POSTPAID 상품 item 에 복제.
    const hasPostpaid = roleScoped.some((p) => p.billingTiming === "POSTPAID");
    const unsettledMonths = hasPostpaid
      ? await findUnsettledPostpaidMonths(this.prisma, classId)
      : [];
    const unitPriceLocked = unsettledMonths.length > 0;

    const productsWithMeta = roleScoped.map((p) => ({
      ...p,
      ...computePackageGuardMeta(p, null),
      priceLocked: isPrepaidProductLocked(
        { feeType: p.feeType, billingMonth: p.billingMonth },
        classRecord.salesOpenMonth,
      ),
      ...(p.billingTiming === "POSTPAID"
        ? { unitPriceLocked, unsettledMonths }
        : {}),
    }));
    return shouldHideInactiveFor(requester?.userType)
      ? productsWithMeta.filter((p) => p.isPurchasable !== false)
      : productsWithMeta;
  }

  /**
   * 수업 패키지(상품) 부분 수정 (2026-05-22 신규).
   *
   * 권한: 해당 팀의 감독·코치·아카데미 원장·관리자 (assertTeamManagerPermission).
   * Soft delete 호환: isActive=false 전환은 본 메서드로 처리.
   */
  async updateClassProduct(
    coachUserId: string,
    teamId: string,
    classId: string,
    productId: string,
    dto: import("./dto/update-product.dto").UpdateClassProductDto,
  ) {
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수강권을 수정할 수 있습니다.",
    );

    // 수업 + 패키지 소속 확인 (cross-tenant 차단)
    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        classId: true,
        billingMonth: true,
        class: { select: { id: true, teamId: true, billingMode: true } },
      },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("수강권을 찾을 수 없습니다.");
    }
    if (product.class.teamId !== teamId) {
      throw new NotFoundException("수강권을 찾을 수 없습니다.");
    }
    // 판매 중지 단독 변경은 지난 월분에도 허용 — 판매 준비 화면이 갱신 원본 행을
    //   소진 처리(id 기반)하는 경로. 중지는 row 보존이라 판매 이력을 훼손하지 않는다.
    if (!this.isRetireOnlyUpdate(dto)) {
      this.assertProductMonthMutable(product.billingMonth, "수정");
    }

    // 판매 시작(openClassSales)과의 레이스 차단 — sales lock 획득 후 tx 안에서
    //   salesOpenMonth·상품을 재조회한 값으로 잠금 판정한다 (가격 잠금 §4-0 A).
    //   후불(POSTPAID/BOTH) 수업은 출석·정산과의 직렬화를 위해 postpaid lock 도
    //   고정 순서(sales→postpaid)로 함께 획득한다 (§4-0 B).
    let priceChange: {
      oldAmount: number | null;
      newAmount: number | null;
    } | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (shouldUsePostpaidLock(product.class.billingMode)) {
        await acquireClassSalesAndPostpaidLocks(tx, classId);
      } else {
        await acquireClassSalesLock(tx, classId);
      }
      const fresh = await tx.classProduct.findUnique({
        where: { id: productId },
        select: {
          feeType: true,
          billingTiming: true,
          billingMonth: true,
          isActive: true,
          price: true,
          feePerSession: true,
          sessionsPerMonth: true,
          sessionsPerWeek: true,
          durationDays: true,
          class: { select: { salesOpenMonth: true } },
        },
      });
      if (!fresh) {
        throw new NotFoundException("수강권을 찾을 수 없습니다.");
      }
      // 판매 시작된 월분은 유효금액·권리조건 변경 거부 — 비금전 필드(이름·설명·판매중지)만 허용.
      //   feeType 은 저장값·변경값 양쪽 판정 (PER_SESSION↔MONTHLY_FIXED 전환 우회 차단).
      const diff = isEntitlementOrAmountChange(fresh, dto);
      if (diff.changed) {
        assertPrepaidChangeAllowed(
          {
            storedFeeType: fresh.feeType,
            effectiveFeeType: dto.feeType,
            billingMonth: fresh.billingMonth,
          },
          fresh.class.salesOpenMonth,
        );
        // 후불 단가(출석 × feePerSession의 기준값)는 미정산 출석 존재 시 변경 거부 —
        //   정산 확정과 동일 집계로 판정 (§3-2, Phase 3).
        if (fresh.billingTiming === "POSTPAID") {
          await assertPostpaidUnitPriceMutable(tx, classId);
        }
      }

      // [가격 잠금 §3-1 단서] 무월 legacy 재활성화 차단 — 월별 판매 중 되살리면
      //   월 필터를 우회해 현재 월분과 이중 가격으로 병렬 노출된다.
      //   존재 판정은 isActive 무관(판매중지 row 도 그 달의 월별 판매 증거).
      if (
        dto.isActive === true &&
        !fresh.isActive &&
        fresh.feeType === "MONTHLY_FIXED" &&
        !fresh.billingMonth &&
        fresh.class.salesOpenMonth
      ) {
        const currentMonthProduct = await tx.classProduct.findFirst({
          where: {
            classId,
            feeType: "MONTHLY_FIXED",
            billingMonth: fresh.class.salesOpenMonth,
          },
          select: { id: true },
        });
        assertLegacyNotReactivated({
          wasActive: fresh.isActive,
          willBeActive: dto.isActive,
          feeType: fresh.feeType,
          billingMonth: fresh.billingMonth,
          hasCurrentMonthProduct: !!currentMonthProduct,
        });
      }

      // [Phase 5 §3-4] 금액 실변경 시 커밋 후 알림 발송용 payload (동일 값 재저장 미발송).
      if (diff.effectiveAmountChanged) {
        priceChange = this.resolvePriceChangeAmounts(
          fresh,
          dto,
          diff.changedFields,
        );
      }

      return tx.classProduct.update({
        where: { id: productId },
        data: {
          ...(dto.productName !== undefined && {
            productName: dto.productName,
          }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.sessionsPerMonth !== undefined && {
            sessionsPerMonth: dto.sessionsPerMonth,
          }),
          ...(dto.durationDays !== undefined && {
            durationDays: dto.durationDays,
          }),
          ...(dto.sessionsPerWeek !== undefined && {
            sessionsPerWeek: dto.sessionsPerWeek,
          }),
          // 단가 미러 — feePerSession 미전송 + price 변경이면 정산 SoT 도 동치 유지
          //   (feePerSession 보유 PER_SESSION 상품 한정, bulk/reconcile 경로와 동일 계약).
          ...(dto.feePerSession !== undefined
            ? { feePerSession: dto.feePerSession }
            : dto.price !== undefined &&
                (dto.feeType ?? fresh.feeType) === "PER_SESSION" &&
                fresh.feePerSession != null
              ? { feePerSession: dto.price }
              : {}),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          // 2026-05-22 옵션 H — feeType 수정 허용.
          ...(dto.feeType !== undefined && { feeType: dto.feeType }),
        },
        select: {
          id: true,
          classId: true,
          productName: true,
          description: true,
          price: true,
          sessionsPerMonth: true,
          durationDays: true,
          sessionsPerWeek: true,
          feePerSession: true,
          feeType: true,
          billingTiming: true,
          isActive: true,
          updatedAt: true,
        },
      });
    });

    await this.invalidateClassCache(teamId);
    const committedChange = priceChange as {
      oldAmount: number | null;
      newAmount: number | null;
    } | null;
    if (committedChange) {
      await this.notifyClassPriceChanged(classId, committedChange);
    }

    return updated;
  }

  /**
   * 수업 패키지(상품) 삭제 (2026-05-22 신규).
   *
   * 정책:
   *  - 결제·수강 이력 FK 가 존재하면 hard delete 불가 → 자동 soft delete (isActive=false).
   *  - FK 없으면 hard delete.
   * 권한: 해당 팀의 감독·코치·아카데미 원장·관리자.
   */
  async deleteClassProduct(
    coachUserId: string,
    teamId: string,
    classId: string,
    productId: string,
  ): Promise<{ id: string; deleted: "hard" | "soft" }> {
    await this.teamsService.assertTeamManagerPermission(
      coachUserId,
      teamId,
      "이 클럽의 감독/코치만 수강권을 삭제할 수 있습니다.",
    );

    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        classId: true,
        billingMonth: true,
        class: { select: { teamId: true } },
        _count: {
          select: {
            payments: true,
            enrollments: true,
          },
        },
      },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("수강권을 찾을 수 없습니다.");
    }
    if (product.class.teamId !== teamId) {
      throw new NotFoundException("수강권을 찾을 수 없습니다.");
    }
    this.assertProductMonthMutable(product.billingMonth, "삭제");

    // [가격 잠금 §3-6] 판매 시작된 월분(무월 legacy 포함)은 이력 0건이어도 hard delete
    //   금지 — 판매 계약 이력으로 row 보존(판매 중지 전환). 판정은 sales lock 획득 후
    //   tx 안에서 재조회한 값으로 (판매 시작과의 레이스 차단).
    const deleted = await this.prisma.$transaction(async (tx) => {
      await acquireClassSalesLock(tx, classId);
      const basis = await tx.class.findUniqueOrThrow({
        where: { id: classId },
        select: { salesOpenMonth: true },
      });
      const fresh = await tx.classProduct.findUnique({
        where: { id: productId },
        select: {
          feeType: true,
          billingMonth: true,
          _count: { select: { payments: true, enrollments: true } },
        },
      });
      if (!fresh) {
        throw new NotFoundException("수강권을 찾을 수 없습니다.");
      }
      const hasHistory =
        (fresh._count?.payments ?? 0) > 0 ||
        (fresh._count?.enrollments ?? 0) > 0;
      const mode = resolveProductDeletionMode(
        { feeType: fresh.feeType, billingMonth: fresh.billingMonth },
        basis.salesOpenMonth,
        hasHistory,
      );
      if (mode === "soft") {
        await tx.classProduct.update({
          where: { id: productId },
          data: { isActive: false },
        });
      } else {
        await tx.classProduct.delete({ where: { id: productId } });
      }
      return mode;
    });

    await this.invalidateClassCache(teamId);
    return { id: productId, deleted };
  }

  // ============================================================
  // 통합 패키지 CRUD (2026-05-22 신규)
  //   경로: /api/v1/classes/:classId/products (teamId 불요)
  //   Class.teamId 우선 → academyId 자동 판별 후 권한 검증.
  // ============================================================

  /**
   * Class 소유자 권한 검증 (통합). owner 종류·식별자 반환.
   *  - 팀 수업 (teamId): TeamsService.assertTeamManagerPermission
   *  - 오픈클래스 (academyId): Academy.directorId === userId 또는 ADMIN
   */
  private async assertClassManagerPermission(
    userId: string,
    userType: string,
    classId: string,
    errorMessage: string,
  ): Promise<{
    ownerType: "team" | "academy";
    ownerId: string;
    billingMode: string;
  }> {
    const klass = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, teamId: true, academyId: true, billingMode: true },
    });
    if (!klass) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }
    const billingMode = klass.billingMode ?? "PREPAID";
    if (klass.teamId) {
      await this.teamsService.assertTeamManagerPermission(
        userId,
        klass.teamId,
        errorMessage,
      );
      return { ownerType: "team", ownerId: klass.teamId, billingMode };
    }
    if (klass.academyId) {
      if (userType === "ADMIN") {
        return { ownerType: "academy", ownerId: klass.academyId, billingMode };
      }
      const academy = await this.prisma.academy.findUnique({
        where: { id: klass.academyId },
        select: { directorId: true },
      });
      if (!academy) {
        throw new NotFoundException("아카데미를 찾을 수 없습니다.");
      }
      if (academy.directorId !== userId) {
        throw new ForbiddenException(errorMessage);
      }
      return { ownerType: "academy", ownerId: klass.academyId, billingMode };
    }
    // orphan class (teamId/academyId 모두 null) — schema CHECK 위반이지만 안전 차단.
    throw new BadRequestException("수업 소유자를 확인할 수 없습니다.");
  }

  // ============================================================
  // [Lifecycle v4.1] 수업 종료/재개 (설계 §8.3~8.5 · D5)
  // ============================================================

  /**
   * 유효 잔여 선불 판정 (§8.4) — 종료 가드 입력.
   *  ① 활성 월권: 연결 상품 feeType=MONTHLY_FIXED && expiresAt > now
   *     (무차감 기간제라 used/total 무의미 — 기간만이 유효성 기준)
   *  ② 회차권·관리자 발급 잔여: 비월권(paymentId null 포함) && expiresAt > now
   *     && (total - used) > 0 — 컬럼 간 비교라 fetch 후 계산 (행 수 소량)
   */
  private async countActivePrepaidRemainders(classId: string): Promise<{
    monthlyPassCount: number;
    sessionRemainderCount: number;
  }> {
    const now = new Date();
    const [monthlyPassCount, nonMonthly] = await Promise.all([
      this.prisma.memberCredit.count({
        where: {
          classId,
          expiresAt: { gt: now },
          ...MONTHLY_PASS_CREDIT_FILTER,
        },
      }),
      this.prisma.memberCredit.findMany({
        where: {
          classId,
          expiresAt: { gt: now },
          NOT: { ...MONTHLY_PASS_CREDIT_FILTER },
        },
        select: { totalSessions: true, usedSessions: true },
      }),
    ]);
    const sessionRemainderCount = nonMonthly.filter(
      (c) => c.totalSessions - c.usedSessions > 0,
    ).length;
    return { monthlyPassCount, sessionRemainderCount };
  }

  /**
   * [수업 종료] — 조건부 마무리 액션 (§8.3).
   * 가드: 다가오는 비취소 일정 0건 && 유효 잔여 선불 0건일 때만 허용.
   * 시스템은 돈 문제를 자동 처리하지 않는다 — 사람이 정리 완료 후에만 종료.
   */
  async endClass(userId: string, userType: string, classId: string) {
    const { ownerType, ownerId } = await this.assertClassManagerPermission(
      userId,
      userType,
      classId,
      "이 수업을 종료할 권한이 없습니다.",
    );
    const klass = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: { endedAt: true },
    });
    if (klass.endedAt) {
      throw new BadRequestException("이미 종료된 수업입니다.");
    }
    const upcoming = await this.prisma.classSchedule.count({
      where: {
        classId,
        isCancelled: false,
        scheduledDate: { gte: kstTodayUtcMidnight() },
      },
    });
    const { monthlyPassCount, sessionRemainderCount } =
      await this.countActivePrepaidRemainders(classId);
    if (upcoming > 0 || monthlyPassCount > 0 || sessionRemainderCount > 0) {
      throw new BadRequestException(
        `남은 일정 ${upcoming}건 · 잔여 결제권(월 정기권 ${monthlyPassCount}건 · 회차권 ${sessionRemainderCount}건)을 정리한 후 종료할 수 있습니다.`,
      );
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { endedAt: new Date() },
      select: { id: true, endedAt: true },
    });
    this.logger.log(
      `[AUDIT] 수업 종료: classId=${classId}, by=${userId}(${userType})`,
    );
    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }
    return updated;
  }

  /** [종료 취소] 유예기간 — 실수 구제 창. 초과 시 '기존 수업 불러오기'(복사 등록)로 유도. */
  private static readonly REOPEN_GRACE_DAYS = 7;

  /**
   * [종료 취소] — 재개 (D5: 유예기간 내 허용).
   * endedAt=null 롤백. 재개 시 파생 상태는 자연히 "일정 등록 대기"부터 시작 —
   * 판매 승인 사이클(§9.3)을 통과해야만 판매 재개되므로 위험 상태가 만들어지지 않는다.
   * 유예기간(REOPEN_GRACE_DAYS) 초과 시 재개 불가 — 장기 재개는 복사 등록이 담당.
   */
  async reopenClass(userId: string, userType: string, classId: string) {
    const { ownerType, ownerId } = await this.assertClassManagerPermission(
      userId,
      userType,
      classId,
      "이 수업을 재개할 권한이 없습니다.",
    );
    const klass = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: { endedAt: true },
    });
    if (!klass.endedAt) {
      throw new BadRequestException("종료 상태가 아닌 수업입니다.");
    }
    // 유예 마감 = (endedAt + 7일)이 속한 KST 달력일의 '그 날 끝'까지 —
    //   화면 문구("N월 N일까지 취소할 수 있어요")의 관행적 읽힘(그 날 자정까지)과 판정 일치.
    //   시각 단위(+7×24h)로 자르면 종료 시각에 따라 마감일 당일 낮에 만료되는 불일치 발생.
    const graceLimit = kstDayEndExclusive(
      new Date(
        klass.endedAt.getTime() +
          ClassesService.REOPEN_GRACE_DAYS * 24 * 60 * 60 * 1000,
      ),
    );
    if (new Date() >= graceLimit) {
      throw new BadRequestException(
        `종료 후 ${ClassesService.REOPEN_GRACE_DAYS}일이 지나 재개할 수 없습니다. 새 수업 등록의 '기존 수업 불러오기'를 이용해주세요.`,
      );
    }
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: { endedAt: null },
      select: { id: true, endedAt: true },
    });
    // D5 감사 기록 — 누가·언제 재개했는지 (이전 종료 시점 포함)
    this.logger.warn(
      `[AUDIT] 수업 종료 취소(재개): classId=${classId}, 이전 endedAt=${klass.endedAt.toISOString()}, by=${userId}(${userType})`,
    );
    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }
    return updated;
  }

  /**
   * [Lifecycle v4.1 §9.3] [판매 시작] — 감독의 명시 승인으로만 판매 월 전환 (자동 전환 금지).
   * 검증: ① 미종료 ② 가장 이른 잔여 달 M 존재 ③ 월권 이력(billingMonth 有)이 있는 수업은
   *   대상월 분 패키지가 1건 이상 존재 (지난 월분 row 는 §9.2 설계상 "보존"이므로 전부-갱신을
   *   강제하지 않는다 — 노출 차단은 filterSellableProducts, 갱신 유도는 FE needsUpdate 게이트.
   *   월 패키지 0개 = 후불 전용·무월 레거시만 있는 수업은 ③ 통과).
   */
  async openClassSales(
    userId: string,
    userType: string,
    classId: string,
    // [Phase 2] true 면 검증·미갱신 해제 대상 산출까지만 수행(쓰기 0) — FE 사전 고지용.
    dryRun = false,
  ) {
    const { ownerType, ownerId } = await this.assertClassManagerPermission(
      userId,
      userType,
      classId,
      "이 수업의 판매를 시작할 권한이 없습니다.",
    );
    const klass = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: {
        endedAt: true,
        salesOpenMonth: true,
        trainingType: true,
        // [Phase 2] 미갱신 판정 — BOTH 수업의 선수별 결제방식 분기용.
        billingMode: true,
        schedules: {
          where: { isCancelled: false },
          select: { scheduledDate: true },
        },
        products: {
          where: { isActive: true, feeType: "MONTHLY_FIXED" },
          select: { id: true, productName: true, billingMonth: true },
        },
      },
    });
    if (klass.endedAt) {
      throw new BadRequestException("종료된 수업입니다. 재개 후 진행해주세요.");
    }
    const lifecycle = deriveClassLifecycle({
      endedAt: klass.endedAt,
      salesOpenMonth: klass.salesOpenMonth,
      trainingType: klass.trainingType,
      schedules: klass.schedules,
    });
    const targetMonth = lifecycle.earliestRemainingMonth;
    if (!targetMonth) {
      throw new BadRequestException(
        "다가오는 일정이 없습니다. 다음 달 일정을 먼저 등록해주세요.",
      );
    }
    // salesOpenMonth 비감소 불변식 — 이른 달 일정 추가로 대상월이 과거로 이동하면
    //   이미 판매된 월분이 잠금 판정(billingMonth ≤ salesOpenMonth)을 빠져나가므로 거부.
    assertSalesMonthNotRolledBack(targetMonth, klass.salesOpenMonth);
    // §9.2 — 지난 월분 row 는 판매 이력으로 "보존"되는 설계이므로 전부-갱신을 강제하지
    //   않는다 (강제 시 2차 사이클부터 항상 실패 — Reviewer C-1). 검증은 "판매할 물건이
    //   있는가"만: 월권 이력이 있는 수업은 대상월 분이 1건 이상 있어야 판매 시작 가능.
    //   지난 월분 노출 차단은 filterSellableProducts(월 필터)가, 빠짐없는 갱신 유도는
    //   FE 확인 플로우(needsUpdate 게이트)가 담당한다. 무월 레거시만 있는 수업은
    //   폴백 판매(§9.2 점진 전환)가 유효하므로 통과.
    const hasTargetMonthPkg = klass.products.some(
      (prd) =>
        prd.billingMonth &&
        prd.billingMonth.getTime() === targetMonth.getTime(),
    );
    const hasMonthlyPkgHistory = klass.products.some(
      (prd) => prd.billingMonth != null,
    );
    if (hasMonthlyPkgHistory && !hasTargetMonthPkg) {
      throw new BadRequestException(
        "판매 대상 달의 월 정기권이 없습니다. 정기권 확인 후 다시 시도해주세요.",
      );
    }

    // ── [Phase 2] 미갱신 선불 선수 배치 해제 대상 산출 ─────────────────────
    //   크레딧 미사용 운영에선 선불 좌석이 자동 반납되지 않으므로, 감독의 [판매 시작]
    //   시점에 "직전 판매월에 유효 결제가 없는 선불 이력 선수"를 명단(active)에서 내린다.
    //   · 판정월 = 직전 salesOpenMonth (첫 판매/동월 재실행은 대상 0 — 1개월 유예 설계)
    //   · 제외: 활성 후불 등록(구독형) · 결제 이력 0(감독 배치 전용 명단)
    //   · 해제 후 재결제하면 결제 완료 경로 upsert 가 active 로 자동 복구한다.
    const prevSalesYm = klass.salesOpenMonth
      ? dbDateToKstYearMonth(klass.salesOpenMonth)
      : null;
    const targetYm = dbDateToKstYearMonth(targetMonth);
    const releaseCandidates: { userId: string; name: string }[] = [];
    if (prevSalesYm != null && targetYm > prevSalesYm) {
      const activeRegs = await this.prisma.classRegistration.findMany({
        where: { classId, status: "active" },
        select: {
          userId: true,
          user: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      });
      const regUserIds = activeRegs.map((r) => r.userId);
      const enrolls = regUserIds.length
        ? await this.prisma.enrollment.findMany({
            where: { classId, childId: { in: regUserIds } },
            select: {
              childId: true,
              status: true,
              paidAt: true,
              product: {
                select: {
                  billingTiming: true,
                  feeType: true,
                  billingMonth: true,
                  price: true,
                },
              },
              payment: {
                select: {
                  amount: true,
                  paymentStatus: true,
                  completedAt: true,
                  createdAt: true,
                  refundLogs: { select: { refundAmount: true } },
                },
              },
            },
          })
        : [];
      const enrollsByChild = new Map<string, typeof enrolls>();
      for (const e of enrolls) {
        const list = enrollsByChild.get(e.childId);
        if (list) {
          list.push(e);
        } else {
          enrollsByChild.set(e.childId, [e]);
        }
      }
      for (const reg of activeRegs) {
        let hasPrepaidPaidHistory = false;
        let hasPaidSincePrevCycle = false;
        let hasActivePostpaid = false;
        for (const en of enrollsByChild.get(reg.userId) ?? []) {
          const timing = this.resolveRowBillingTiming(
            klass.billingMode,
            en.product?.billingTiming,
          );
          if (timing === "POSTPAID") {
            // 후불 계약은 월 단위 만료가 없는 구독형 — 활성이면 해제 대상 아님.
            if (en.status === "approved" || en.status === "paid") {
              hasActivePostpaid = true;
            }
            continue;
          }
          if (timing !== "PREPAID") continue;
          const att = resolvePrepaidAttribution({
            billingTiming: "PREPAID",
            feeType: en.product?.feeType,
            billingMonth: en.product?.billingMonth,
            enrollmentStatus: en.status,
            enrollmentPaidAt: en.paidAt,
            productPrice: en.product?.price,
            payment: en.payment,
          });
          if (att.billingStatus === "PAID" && att.yearMonth != null) {
            hasPrepaidPaidHistory = true;
            // 직전 판매월 이후 귀속 유효 결제(선구매 포함)가 있으면 유지.
            if (att.yearMonth >= prevSalesYm) hasPaidSincePrevCycle = true;
          }
        }
        if (
          hasPrepaidPaidHistory &&
          !hasPaidSincePrevCycle &&
          !hasActivePostpaid
        ) {
          const name =
            `${reg.user.lastName ?? ""}${reg.user.firstName ?? ""}`.trim() ||
            reg.user.email;
          releaseCandidates.push({ userId: reg.userId, name });
        }
      }
    }

    // dryRun — 검증·해제 대상 미리보기만 반환(쓰기 0). FE 판매 시작 확인 다이얼로그용.
    if (dryRun) {
      return {
        id: classId,
        salesOpenMonth: klass.salesOpenMonth,
        dryRun: true as const,
        targetMonth,
        releaseCandidates,
      };
    }
    // 판매 시작 = 그 달 상품 확정. 대상월 갱신분이 있는 수업(월별 체계 도입)은
    //   미갱신 무월(레거시) 정기권을 같은 트랜잭션에서 판매 중단한다 — 무월은 월 필터를
    //   우회해 상시 노출되므로, 안 하면 "갱신 안 함 = 이번 달 판매 안 함" 선택이 무시되고
    //   새 월분과 중복 노출된다. 무월만 있는 수업은 폴백 판매(§9.2 점진 전환) 유지.
    const { updated, retiredLegacyCount, releasedCount } =
      await this.prisma.$transaction(async (tx) => {
        // 상품 수정·생성 경로와의 레이스 차단 — sales lock 획득 후 tx 안에서
        //   lifecycle 입력(일정·trainingType)까지 재조회해 대상월을 재산출한다 (§4-0 A).
        //   일정 writer 는 sales lock 미참여라, 외부에서 계산한 targetMonth 는 tx 진입
        //   시점에 이미 낡았을 수 있다.
        await acquireClassSalesLock(tx, classId);
        const freshClass = await tx.class.findUniqueOrThrow({
          where: { id: classId },
          select: {
            endedAt: true,
            salesOpenMonth: true,
            trainingType: true,
            schedules: {
              where: { isCancelled: false },
              select: { scheduledDate: true },
            },
            products: {
              where: { isActive: true, feeType: "MONTHLY_FIXED" },
              select: { billingMonth: true },
            },
          },
        });
        if (freshClass.endedAt) {
          throw new BadRequestException(
            "종료된 수업입니다. 재개 후 진행해주세요.",
          );
        }
        const freshLifecycle = deriveClassLifecycle({
          endedAt: freshClass.endedAt,
          salesOpenMonth: freshClass.salesOpenMonth,
          trainingType: freshClass.trainingType,
          schedules: freshClass.schedules,
        });
        const freshTargetMonth = freshLifecycle.earliestRemainingMonth;
        if (!freshTargetMonth) {
          throw new BadRequestException(
            "다가오는 일정이 없습니다. 다음 달 일정을 먼저 등록해주세요.",
          );
        }
        // 외부 산출 대상월과 다르면 낡은 값 — 외부에서 계산한 해제 대상 명단과
        //   섞어 커밋하지 않고 재시도로 유도한다.
        if (freshTargetMonth.getTime() !== targetMonth.getTime()) {
          throw new ConflictException(
            "수업 일정이 방금 변경되었습니다. 다시 시도해주세요.",
          );
        }
        assertSalesMonthNotRolledBack(
          freshTargetMonth,
          freshClass.salesOpenMonth,
        );
        const freshHasTargetMonthPkg = freshClass.products.some(
          (prd) =>
            prd.billingMonth &&
            prd.billingMonth.getTime() === freshTargetMonth.getTime(),
        );
        const freshHasMonthlyPkgHistory = freshClass.products.some(
          (prd) => prd.billingMonth != null,
        );
        if (freshHasMonthlyPkgHistory && !freshHasTargetMonthPkg) {
          throw new BadRequestException(
            "판매 대상 달의 월 정기권이 없습니다. 정기권 확인 후 다시 시도해주세요.",
          );
        }

        const cls = await tx.class.update({
          where: { id: classId },
          data: { salesOpenMonth: freshTargetMonth },
          select: { id: true, salesOpenMonth: true },
        });
        let retired = 0;
        if (freshHasTargetMonthPkg) {
          const res = await tx.classProduct.updateMany({
            where: {
              classId,
              feeType: "MONTHLY_FIXED",
              isActive: true,
              billingMonth: null,
            },
            data: { isActive: false },
          });
          retired = res.count;
        }
        // [Phase 2] 미갱신 선불 선수 배치 해제 — active 조건 재확인(동시성 가드).
        //   상태는 "expired"(만료) — 감독 수동 해제(inactive)와 구분해 재등록 대상 목록의 SoT.
        let released = 0;
        if (releaseCandidates.length > 0) {
          const res = await tx.classRegistration.updateMany({
            where: {
              classId,
              userId: { in: releaseCandidates.map((c) => c.userId) },
              status: "active",
            },
            data: { status: "expired" },
          });
          released = res.count;
        }
        return {
          updated: cls,
          retiredLegacyCount: retired,
          releasedCount: released,
        };
      });
    this.logger.log(
      `[AUDIT] 판매 시작: classId=${classId}, salesOpenMonth=${targetMonth.toISOString().slice(0, 10)}, 무월 레거시 판매중단=${retiredLegacyCount}건, 미갱신 선수 배치해제=${releasedCount}명(${releaseCandidates.map((c) => c.name).join(",") || "-"}), by=${userId}(${userType})`,
    );
    // 갱신 안내 — 해제된 자녀의 학부모에게 재결제 경로 통지 (커밋 후 best-effort).
    //   해제 통지가 없으면 학부모는 출석 차단 시점에야 만료를 인지한다.
    if (releasedCount > 0) {
      void this.notifyReleasedParentsOfSalesOpen(
        classId,
        releaseCandidates.map((c) => c.userId),
        targetMonth,
      ).catch((err) =>
        this.logger.warn(
          `갱신 알림 발송 실패: classId=${classId} ${(err as Error).message}`,
        ),
      );
    }
    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }
    return {
      ...updated,
      // [Phase 2] additive — 기존 소비처(id·salesOpenMonth)는 그대로 유지.
      releasedCount,
      releasedNames: releaseCandidates.map((c) => c.name),
    };
  }

  /**
   * 판매 시작으로 배치 해제된 자녀의 학부모에게 갱신(재결제) 안내 발송.
   *  학부모 dedupe — 형제가 같은 수업에서 동시 해제돼도 학부모당 1건.
   */
  private async notifyReleasedParentsOfSalesOpen(
    classId: string,
    releasedUserIds: string[],
    targetMonth: Date,
  ): Promise<void> {
    if (releasedUserIds.length === 0) return;
    const [cls, links] = await Promise.all([
      this.prisma.class.findUnique({
        where: { id: classId },
        select: { className: true },
      }),
      this.prisma.parentChild.findMany({
        where: { childId: { in: releasedUserIds } },
        select: { parentId: true },
      }),
    ]);
    const parentIds = Array.from(new Set(links.map((l) => l.parentId)));
    if (!cls || parentIds.length === 0) return;
    // targetMonth 는 @db.Date(UTC 자정) — 월 표기는 getUTC* getter.
    const monthLabel = targetMonth.getUTCMonth() + 1;
    await this.notificationsService.notifyUsers(parentIds, {
      notificationType: "class_renewal_required",
      title: "수강권 갱신 안내",
      message: `'${cls.className}' ${monthLabel}월 수강권 판매가 시작되었습니다. 재결제 후 수강을 이어갈 수 있어요.`,
      linkUrl: `/classes/${classId}`,
    });
  }

  /**
   * 통합 패키지 생성 — classId 만으로 owner 자동 판별.
   */
  async createClassProductByClassId(
    userId: string,
    userType: string,
    classId: string,
    dto: CreateClassProductDto,
  ) {
    const { ownerType, ownerId, billingMode } =
      await this.assertClassManagerPermission(
        userId,
        userType,
        classId,
        "이 수업의 감독/코치만 패키지를 생성할 수 있습니다.",
      );

    // 후불(POSTPAID) 수업은 "후불 수업료"(출석 횟수 × 1회 단가, 월말 정산) 단일 상품만
    //   사용한다. 추가 패키지(정기권·회차권 등)는 정산 모델과 충돌하므로 신규 생성을 차단.
    if (billingMode === "POSTPAID") {
      throw new BadRequestException(
        "후불 수업은 출석 기반 정산만 지원하므로 추가 수강권을 등록할 수 없습니다.",
      );
    }

    // 발급 수량 SoT = sessionsPerMonth. 미전송 = 0(크레딧 미발급 기본).
    //   정액(MONTHLY_FIXED)은 무차감 기간제라 이 값이 출석 회차를 제한하지 않는다.
    const resolvedSessionsPerMonth = dto.sessionsPerMonth ?? 0;

    // [가격 잠금 §3-7] 신규 MONTHLY_FIXED 는 귀속월 필수 — 무월 신규 유입 차단.
    //   첫 write 전 검증 (부분 반영 방지 — Codex 승인 조건).
    if (dto.feeType === "MONTHLY_FIXED" && !dto.billingMonth) {
      throw new BadRequestException(
        PRICE_LOCK_MESSAGES.BILLING_MONTH_INPUT_REQUIRED,
      );
    }

    const product = await this.prisma.$transaction(async (tx) => {
      // 판매 시작(openClassSales)과의 레이스 차단 — lock 후 salesOpenMonth 재조회로
      //   월분 동결(§3-4) 판정 (판매 시작된 달의 신규 생성 = 판매중지+재등록 우회 차단).
      await acquireClassSalesLock(tx, classId);
      if (dto.feeType === "MONTHLY_FIXED" && dto.billingMonth) {
        const basis = await tx.class.findUniqueOrThrow({
          where: { id: classId },
          select: { salesOpenMonth: true },
        });
        assertMonthNotFrozen(
          new Date(`${dto.billingMonth}-01T00:00:00.000Z`),
          basis.salesOpenMonth,
        );
      }

      return tx.classProduct.create({
        data: {
          classId,
          productName: dto.productName,
          description: dto.description,
          price: dto.price,
          sessionsPerMonth: resolvedSessionsPerMonth,
          durationDays: dto.durationDays || 30,
          // 2026-05-22 옵션 H — PackageEditSheet 가 전달한 feeType/sessionsPerWeek 저장.
          ...(dto.feeType ? { feeType: dto.feeType } : {}),
          ...(dto.sessionsPerWeek
            ? { sessionsPerWeek: dto.sessionsPerWeek }
            : {}),
          // [Lifecycle v4.1 §9.2] 귀속월 — "YYYY-MM" → 그 달 1일(@db.Date, UTC 자정).
          ...(dto.billingMonth
            ? { billingMonth: new Date(`${dto.billingMonth}-01T00:00:00.000Z`) }
            : {}),
        },
        select: {
          id: true,
          classId: true,
          productName: true,
          description: true,
          price: true,
          sessionsPerMonth: true,
          durationDays: true,
          sessionsPerWeek: true,
          feePerSession: true,
          feeType: true,
          billingTiming: true,
          isActive: true,
          createdAt: true,
        },
      });
    });

    // 캐시 무효화 — 팀 수업만 (오픈클래스 캐시 키 별도)
    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }

    return product;
  }

  /**
   * 통합 패키지 수정 — classId + productId.
   */
  async updateClassProductByClassId(
    userId: string,
    userType: string,
    classId: string,
    productId: string,
    dto: import("./dto/update-product.dto").UpdateClassProductDto,
  ) {
    const { ownerType, ownerId, billingMode } =
      await this.assertClassManagerPermission(
        userId,
        userType,
        classId,
        "이 수업의 감독/코치만 수강권을 수정할 수 있습니다.",
      );

    // 패키지 소속 확인 (cross-class 차단)
    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: { id: true, classId: true, billingMonth: true },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("수강권을 찾을 수 없습니다.");
    }
    // 판매 중지 단독 변경은 지난 월분에도 허용 — 판매 준비 화면이 갱신 원본 행을
    //   소진 처리(id 기반)하는 경로. 중지는 row 보존이라 판매 이력을 훼손하지 않는다.
    if (!this.isRetireOnlyUpdate(dto)) {
      this.assertProductMonthMutable(product.billingMonth, "수정");
    }

    // 판매 시작(openClassSales)과의 레이스 차단 — sales lock 획득 후 tx 안에서
    //   salesOpenMonth·상품을 재조회한 값으로 잠금 판정한다 (가격 잠금 §4-0 A).
    //   후불(POSTPAID/BOTH) 수업은 출석·정산과의 직렬화를 위해 postpaid lock 도
    //   고정 순서(sales→postpaid)로 함께 획득한다 (§4-0 B).
    let priceChange: {
      oldAmount: number | null;
      newAmount: number | null;
    } | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (shouldUsePostpaidLock(billingMode)) {
        await acquireClassSalesAndPostpaidLocks(tx, classId);
      } else {
        await acquireClassSalesLock(tx, classId);
      }
      const fresh = await tx.classProduct.findUnique({
        where: { id: productId },
        select: {
          feeType: true,
          billingTiming: true,
          billingMonth: true,
          isActive: true,
          price: true,
          feePerSession: true,
          sessionsPerMonth: true,
          sessionsPerWeek: true,
          durationDays: true,
          class: { select: { salesOpenMonth: true } },
        },
      });
      if (!fresh) {
        throw new NotFoundException("수강권을 찾을 수 없습니다.");
      }
      // 판매 시작된 월분은 유효금액·권리조건 변경 거부 — 비금전 필드(이름·설명·판매중지)만 허용.
      //   feeType 은 저장값·변경값 양쪽 판정 (PER_SESSION↔MONTHLY_FIXED 전환 우회 차단).
      const diff = isEntitlementOrAmountChange(fresh, dto);
      if (diff.changed) {
        assertPrepaidChangeAllowed(
          {
            storedFeeType: fresh.feeType,
            effectiveFeeType: dto.feeType,
            billingMonth: fresh.billingMonth,
          },
          fresh.class.salesOpenMonth,
        );
        // 후불 단가(출석 × feePerSession의 기준값)는 미정산 출석 존재 시 변경 거부 —
        //   정산 확정과 동일 집계로 판정 (§3-2, Phase 3).
        if (fresh.billingTiming === "POSTPAID") {
          await assertPostpaidUnitPriceMutable(tx, classId);
        }
      }

      // [가격 잠금 §3-1 단서] 무월 legacy 재활성화 차단 — 월별 판매 중 되살리면
      //   월 필터를 우회해 현재 월분과 이중 가격으로 병렬 노출된다.
      //   존재 판정은 isActive 무관(판매중지 row 도 그 달의 월별 판매 증거).
      if (
        dto.isActive === true &&
        !fresh.isActive &&
        fresh.feeType === "MONTHLY_FIXED" &&
        !fresh.billingMonth &&
        fresh.class.salesOpenMonth
      ) {
        const currentMonthProduct = await tx.classProduct.findFirst({
          where: {
            classId,
            feeType: "MONTHLY_FIXED",
            billingMonth: fresh.class.salesOpenMonth,
          },
          select: { id: true },
        });
        assertLegacyNotReactivated({
          wasActive: fresh.isActive,
          willBeActive: dto.isActive,
          feeType: fresh.feeType,
          billingMonth: fresh.billingMonth,
          hasCurrentMonthProduct: !!currentMonthProduct,
        });
      }

      // [Phase 5 §3-4] 금액 실변경 시 커밋 후 알림 발송용 payload (동일 값 재저장 미발송).
      if (diff.effectiveAmountChanged) {
        priceChange = this.resolvePriceChangeAmounts(
          fresh,
          dto,
          diff.changedFields,
        );
      }

      return tx.classProduct.update({
        where: { id: productId },
        data: {
          ...(dto.productName !== undefined && {
            productName: dto.productName,
          }),
          ...(dto.description !== undefined && {
            description: dto.description,
          }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.sessionsPerMonth !== undefined && {
            sessionsPerMonth: dto.sessionsPerMonth,
          }),
          ...(dto.durationDays !== undefined && {
            durationDays: dto.durationDays,
          }),
          ...(dto.sessionsPerWeek !== undefined && {
            sessionsPerWeek: dto.sessionsPerWeek,
          }),
          // 단가 미러 — feePerSession 미전송 + price 변경이면 정산 SoT 도 동치 유지
          //   (feePerSession 보유 PER_SESSION 상품 한정, bulk/reconcile 경로와 동일 계약).
          ...(dto.feePerSession !== undefined
            ? { feePerSession: dto.feePerSession }
            : dto.price !== undefined &&
                (dto.feeType ?? fresh.feeType) === "PER_SESSION" &&
                fresh.feePerSession != null
              ? { feePerSession: dto.price }
              : {}),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          // 2026-05-22 옵션 H — feeType 수정 허용.
          ...(dto.feeType !== undefined && { feeType: dto.feeType }),
        },
        select: {
          id: true,
          classId: true,
          productName: true,
          description: true,
          price: true,
          sessionsPerMonth: true,
          durationDays: true,
          sessionsPerWeek: true,
          feePerSession: true,
          feeType: true,
          billingTiming: true,
          isActive: true,
          updatedAt: true,
        },
      });
    });

    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }
    const committedChange = priceChange as {
      oldAmount: number | null;
      newAmount: number | null;
    } | null;
    if (committedChange) {
      await this.notifyClassPriceChanged(classId, committedChange);
    }

    return updated;
  }

  /**
   * 통합 패키지 삭제 — classId + productId.
   * 결제·수강 이력 있으면 soft delete (isActive=false).
   */
  async deleteClassProductByClassId(
    userId: string,
    userType: string,
    classId: string,
    productId: string,
  ): Promise<{ id: string; deleted: "hard" | "soft" }> {
    const { ownerType, ownerId, billingMode } =
      await this.assertClassManagerPermission(
        userId,
        userType,
        classId,
        "이 수업의 감독/코치만 수강권을 삭제할 수 있습니다.",
      );

    // 후불 수업은 "1회 수업료" 단일 상품으로 출석 기반 정산하므로 삭제를 차단한다.
    if (billingMode === "POSTPAID") {
      throw new BadRequestException(
        "후불 수업은 출석 기반 정산에 필요한 1회 수업료 상품을 삭제할 수 없습니다.",
      );
    }

    const product = await this.prisma.classProduct.findUnique({
      where: { id: productId },
      select: {
        id: true,
        classId: true,
        billingMonth: true,
        _count: { select: { payments: true, enrollments: true } },
      },
    });
    if (!product || product.classId !== classId) {
      throw new NotFoundException("수강권을 찾을 수 없습니다.");
    }
    this.assertProductMonthMutable(product.billingMonth, "삭제");

    // [가격 잠금 §3-6] 판매 시작된 월분은 이력 0건이어도 판매 중지로 보존 (D1 과 동일 규칙).
    const deleted = await this.prisma.$transaction(async (tx) => {
      await acquireClassSalesLock(tx, classId);
      const basis = await tx.class.findUniqueOrThrow({
        where: { id: classId },
        select: { salesOpenMonth: true },
      });
      const fresh = await tx.classProduct.findUnique({
        where: { id: productId },
        select: {
          feeType: true,
          billingMonth: true,
          _count: { select: { payments: true, enrollments: true } },
        },
      });
      if (!fresh) {
        throw new NotFoundException("수강권을 찾을 수 없습니다.");
      }
      const hasHistory =
        (fresh._count?.payments ?? 0) > 0 ||
        (fresh._count?.enrollments ?? 0) > 0;
      const mode = resolveProductDeletionMode(
        { feeType: fresh.feeType, billingMonth: fresh.billingMonth },
        basis.salesOpenMonth,
        hasHistory,
      );
      if (mode === "soft") {
        await tx.classProduct.update({
          where: { id: productId },
          data: { isActive: false },
        });
      } else {
        await tx.classProduct.delete({ where: { id: productId } });
      }
      return mode;
    });

    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }
    return { id: productId, deleted };
  }

  /**
   * 정기권(MONTHLY_FIXED) 회수 cross 검증 — buildClassProducts 규칙과 일관.
   *   weeks 는 총 회수 ÷ 주당 회수로 역산(주당 미지정 시 1회로 간주).
   *   - 1 ≤ weeks ≤ 52
   *   - totalSessions ≥ weeks (최소 주 1회)
   *   - totalSessions ≤ weeks × 14
   */
  /**
   * [Lifecycle v4.1 §9.2 이력 불가침] 지난 월분 패키지 mutation 가드.
   *   billingMonth 가 이번 KST 달 이전인 row 는 그 달의 판매 기록이므로 수정/삭제를 거부한다
   *   (지난 회차 일정 잠금과 동일 원칙). 무월(레거시)·이번 달·미래 달은 대상 아님.
   */
  /** 판매 중지 단독 변경(isActive:false 외 필드 없음) 여부 — 지난 월분 잠금의 유일한 예외.
   *  금액·권리조건이 섞이면 예외 비대상이고, 재활성화(isActive:true)도 비대상이다. */
  private isRetireOnlyUpdate(
    dto: import("./dto/update-product.dto").UpdateClassProductDto,
  ): boolean {
    return (
      dto.isActive === false &&
      dto.productName === undefined &&
      dto.description === undefined &&
      dto.price === undefined &&
      dto.sessionsPerMonth === undefined &&
      dto.durationDays === undefined &&
      dto.sessionsPerWeek === undefined &&
      dto.feePerSession === undefined &&
      dto.feeType === undefined
    );
  }

  private assertProductMonthMutable(
    billingMonth: Date | null | undefined,
    action: "수정" | "삭제",
  ): void {
    if (!billingMonth) return;
    const today = kstTodayUtcMidnight();
    const currentMonthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    if (billingMonth.getTime() < currentMonthStart.getTime()) {
      throw new BadRequestException(
        `지난 월분 수강권은 ${action}할 수 없습니다. 판매 이력 보존을 위해 잠겨 있어요.`,
      );
    }
  }

  private assertMonthlyFixedSessions(
    productName: string,
    totalSessions: number,
    sessionsPerWeek?: number,
  ): void {
    // 발급 수량 0(미발급 기본)은 회차 cross 검증 비대상 — buildClassProducts 정책과 동일.
    if (!totalSessions || totalSessions <= 0) return;
    const perWeek = Math.max(1, sessionsPerWeek ?? 1);
    const weeks = Math.ceil(totalSessions / perWeek);
    if (weeks < 1 || weeks > 52) {
      throw new BadRequestException(
        `정기권(${productName}) 주 수(${weeks})는 1~52 범위여야 합니다.`,
      );
    }
    if (totalSessions < weeks) {
      throw new BadRequestException(
        `정기권(${productName}) 총 회수(${totalSessions})는 주 수(${weeks}) 이상이어야 합니다.`,
      );
    }
    if (totalSessions > weeks * 14) {
      throw new BadRequestException(
        `정기권(${productName}) 총 회수(${totalSessions})는 주 수×14(${weeks * 14}) 이하여야 합니다.`,
      );
    }
  }

  /**
   * bulk 항목의 durationDays 도출 — buildClassProducts 만료일 SoT 와 일치.
   *   - MONTHLY_FIXED(정기권): weeks×7 (weeks = ceil(총 회수 ÷ 주당 회수), 1~52 clamp).
   *     PACKAGE_END_GUARD 만료일 계산이 정기권 등록 경로와 동일해지도록 강제.
   *   - 그 외(PER_SESSION 등): 입력값 우선, 없으면 30.
   */
  private deriveBulkDurationDays(item: {
    feeType: string;
    sessionsPerMonth: number;
    sessionsPerWeek?: number;
    durationDays?: number;
  }): number {
    // 발급 수량>0 정기권만 회차로 주수 역산(레거시 호환). 0(미발급)은 전송된 durationDays 사용.
    if (item.feeType === "MONTHLY_FIXED" && item.sessionsPerMonth > 0) {
      const perWeek = Math.max(1, item.sessionsPerWeek ?? 1);
      const weeks = Math.max(
        1,
        Math.min(52, Math.ceil(item.sessionsPerMonth / perWeek)),
      );
      return weeks * 7;
    }
    return item.durationDays ?? 30;
  }

  /**
   * 수업 패키지 일괄 반영 (2026-06-19 신규).
   *
   * '수정하기' 클릭 시 추가/수정/삭제를 한 번에 원자적으로 반영하기 위한 엔드포인트.
   *  - upserts: id 없음 → create / id 있음 → update
   *  - deleteIds: 결제·수강 이력 있으면 soft delete(isActive=false), 없으면 hard delete
   *  - 전부 성공 또는 전부 롤백 ($transaction)
   * 권한: 단건 패키지 경로와 동일 (assertClassManagerPermission).
   */
  async bulkUpsertClassProducts(
    userId: string,
    userType: string,
    classId: string,
    dto: import("./dto/bulk-products.dto").BulkClassProductsDto,
  ) {
    const { ownerType, ownerId, billingMode } =
      await this.assertClassManagerPermission(
        userId,
        userType,
        classId,
        "이 수업의 감독/코치만 수강권을 수정할 수 있습니다.",
      );

    const upserts = dto.upserts ?? [];
    const deleteIds = dto.deleteIds ?? [];

    // 빈 입력은 no-op — 현재 목록만 반환.
    if (upserts.length === 0 && deleteIds.length === 0) {
      return this.getClassProducts(classId, {
        id: userId,
        userType,
      } as JwtUserPayload);
    }

    // [spot 선불 단건] 1회용 수업 — 정기권(MONTHLY_FIXED) 신규 추가 차단.
    //   레거시(정책 이전) 정기권의 수정·비활성(id 있는 upsert)·삭제 정리는 허용한다.
    const { trainingType } = await this.prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: { trainingType: true },
    });
    if (
      trainingType === "spot" &&
      upserts.some((item) => !item.id && item.feeType === "MONTHLY_FIXED")
    ) {
      throw new BadRequestException(
        "1회용 수업은 정기권(월 결제)을 등록할 수 없습니다.",
      );
    }

    // 후불(POSTPAID) 수업은 "1회 수업료" 단일 상품으로 출석 기반 정산하므로 신규 패키지
    //   추가(id 없는 upsert)와 삭제(deleteIds)를 차단한다. 기존 상품 수정(id 있음, 단가 변경
    //   등)만 허용 — UI 우회 직접 호출까지 막는 최종 방어선.
    if (billingMode === "POSTPAID") {
      if (upserts.some((item) => !item.id)) {
        throw new BadRequestException(
          "후불 수업은 출석 기반 정산만 지원하므로 추가 수강권을 등록할 수 없습니다.",
        );
      }
      if (deleteIds.length > 0) {
        throw new BadRequestException(
          "후불 수업은 출석 기반 정산에 필요한 1회 수업료 상품을 삭제할 수 없습니다.",
        );
      }
    }

    // 정기권 회수 cross 검증을 트랜잭션 진입 전 선검증 (불필요한 DB 작업 회피).
    for (const item of upserts) {
      if (item.feeType === "MONTHLY_FIXED") {
        this.assertMonthlyFixedSessions(
          item.productName,
          item.sessionsPerMonth,
          item.sessionsPerWeek,
        );
      }
    }

    // [Phase 5 §3-4] 금액 실변경 수집 — 커밋 후 알림 발송용.
    const bulkPriceChanges: {
      oldAmount: number | null;
      newAmount: number | null;
    }[] = [];

    await this.prisma.$transaction(async (tx) => {
      // 판매 시작(openClassSales)과의 레이스 차단 — sales lock 획득 후 tx 안에서
      //   salesOpenMonth 를 재조회해 잠금 판정 기준값으로 쓴다 (가격 잠금 §4-0 A).
      //   후불(POSTPAID/BOTH) 수업은 postpaid lock 도 고정 순서로 함께 획득 (§4-0 B).
      if (shouldUsePostpaidLock(billingMode)) {
        await acquireClassSalesAndPostpaidLocks(tx, classId);
      } else {
        await acquireClassSalesLock(tx, classId);
      }
      const lockBasis = await tx.class.findUniqueOrThrow({
        where: { id: classId },
        select: { salesOpenMonth: true },
      });

      // [가격 잠금 §3-7] 귀속월 미전송 신규 MONTHLY_FIXED 의 서버 도출 기준 —
      //   기준은 lifecycle 의 earliestRemainingMonth 와 동일한 "잔여(오늘 이후) 일정의
      //   가장 이른 달"이다. 과거 일정까지 포함하면 지난 월분(생성 즉시 잠기고 월 필터에도
      //   안 잡히는 행)이 만들어진다 — 신규 수업만 다루는 createClass 와 다른 지점.
      //   필요한 요청에서만 조회한다(미전송 항목이 없으면 쿼리 자체를 생략).
      const needsMonthDerivation = upserts.some(
        (i) => !i.id && i.feeType === "MONTHLY_FIXED" && !i.billingMonth,
      );
      const currentMonthStart = utcMonthStart(kstTodayUtcMidnight());
      const nextSched = needsMonthDerivation
        ? await tx.classSchedule.findFirst({
            where: {
              classId,
              isCancelled: false,
              scheduledDate: { gte: kstTodayUtcMidnight() },
            },
            orderBy: { scheduledDate: "asc" },
            select: { scheduledDate: true },
          })
        : null;
      const firstScheduleMonth = nextSched
        ? utcMonthStart(nextSched.scheduledDate)
        : null;
      // 폴백(salesOpenMonth)도 지난 달이면 쓰지 않는다 — 잔여 일정이 없는 "일정 등록 대기"
      //   수업은 도출 실패로 BILLING_MONTH_REQUIRED 400 이 정합(§9.4 판매 차단).
      const salesOpenFallback =
        lockBasis.salesOpenMonth &&
        lockBasis.salesOpenMonth.getTime() >= currentMonthStart.getTime()
          ? lockBasis.salesOpenMonth
          : null;

      // 1) deleteIds — soft/hard 판정. 모든 대상이 해당 classId 소속인지 확인.
      for (const productId of deleteIds) {
        const product = await tx.classProduct.findUnique({
          where: { id: productId },
          select: {
            id: true,
            classId: true,
            billingMonth: true,
            feeType: true,
            _count: { select: { payments: true, enrollments: true } },
          },
        });
        if (!product || product.classId !== classId) {
          throw new NotFoundException("수강권을 찾을 수 없습니다.");
        }
        this.assertProductMonthMutable(product.billingMonth, "삭제");
        const hasHistory =
          (product._count?.payments ?? 0) > 0 ||
          (product._count?.enrollments ?? 0) > 0;
        // [가격 잠금 §3-6] 판매 시작된 월분은 이력 0건이어도 판매 중지로 보존 (D1~D4 공통).
        const mode = resolveProductDeletionMode(
          { feeType: product.feeType, billingMonth: product.billingMonth },
          lockBasis.salesOpenMonth,
          hasHistory,
        );
        if (mode === "soft") {
          await tx.classProduct.update({
            where: { id: productId },
            data: { isActive: false },
          });
        } else {
          await tx.classProduct.delete({ where: { id: productId } });
        }
      }

      // [가격 잠금 §3-4] 동결 판정 기준 — 이 요청 **이전**에 존재하던 월분 집합 스냅샷.
      //   같은 bulk 로 방금 만든 행이 뒤 항목의 판정에 끼어들면(주2회권+주3회권 동시 등록)
      //   두 번째부터 동결로 오판되므로, 루프 진입 전에 한 번만 수집한다.
      //   isActive 무관 — 판매 시작된 월분은 삭제가 soft(row 보존)라 재등록 우회는 계속 차단된다.
      const frozenBasisMonths = new Set(
        (
          await tx.classProduct.findMany({
            where: {
              classId,
              feeType: "MONTHLY_FIXED",
              billingMonth: { not: null },
            },
            select: { billingMonth: true },
          })
        ).map((p) => (p.billingMonth as Date).getTime()),
      );

      // 2) upserts — id 없으면 create, 있으면 update(소속 확인).
      for (const item of upserts) {
        if (!item.id) {
          // [가격 잠금 §3-7] 신규 MONTHLY_FIXED 귀속월 — 전송값 우선, 미전송이면
          //   첫 일정의 달 → salesOpenMonth 순으로 서버 도출(생성 경로와 동일 SoT).
          //   전부 없으면 BILLING_MONTH_REQUIRED 400 — 무월 신규 유입은 계속 차단된다.
          let newBillingMonth: Date | null = item.billingMonth
            ? new Date(`${item.billingMonth}-01T00:00:00.000Z`)
            : null;
          if (item.feeType === "MONTHLY_FIXED") {
            newBillingMonth =
              newBillingMonth ??
              resolveNewProductBillingMonth({
                firstScheduleMonth,
                salesOpenMonth: salesOpenFallback,
              });
            // [가격 잠금 §3-4] 월분 동결 — 그 월분 상품이 **이미 있던** 경우에만 적용해
            //   "판매중지 후 고가 재등록" 우회는 계속 차단하고, 수업 생성 직후
            //   최초 수강권 등록(그 월분 0건)만 통과시킨다.
            if (frozenBasisMonths.has(newBillingMonth.getTime())) {
              assertMonthNotFrozen(newBillingMonth, lockBasis.salesOpenMonth);
            }
          }
          await tx.classProduct.create({
            data: {
              classId,
              productName: item.productName,
              description: item.description,
              price: item.price,
              feeType: item.feeType,
              sessionsPerMonth: item.sessionsPerMonth,
              durationDays: this.deriveBulkDurationDays(item),
              ...(item.sessionsPerWeek !== undefined && {
                sessionsPerWeek: item.sessionsPerWeek,
              }),
              // [Lifecycle v4.1 §9.2] 귀속월 — 그 달 1일(@db.Date, UTC 자정).
              //   생성 후 불변이라 create 에만 적용. MONTHLY_FIXED 는 위에서 도출 완료.
              ...(newBillingMonth ? { billingMonth: newBillingMonth } : {}),
            },
          });
        } else {
          const existing = await tx.classProduct.findUnique({
            where: { id: item.id },
            select: {
              id: true,
              classId: true,
              billingMonth: true,
              feeType: true,
              billingTiming: true,
              isActive: true,
              price: true,
              feePerSession: true,
              sessionsPerMonth: true,
              sessionsPerWeek: true,
              durationDays: true,
            },
          });
          if (!existing || existing.classId !== classId) {
            throw new NotFoundException("수강권을 찾을 수 없습니다.");
          }
          this.assertProductMonthMutable(existing.billingMonth, "수정");
          // 판매 시작된 월분은 유효금액·권리조건 변경 거부 — 실제 기록될 값 기준 diff
          //   (durationDays 는 파생값, sessionsPerWeek 미전송은 변경 없음으로 간주).
          //   feeType 은 저장값·변경값 양쪽 판정 (PER_SESSION↔MONTHLY_FIXED 전환 우회 차단).
          const diff = isEntitlementOrAmountChange(existing, {
            price: item.price,
            feeType: item.feeType,
            sessionsPerMonth: item.sessionsPerMonth,
            sessionsPerWeek: item.sessionsPerWeek,
            durationDays: this.deriveBulkDurationDays(item),
          });
          // 단가 미러 동기화 — feePerSession 보유 PER_SESSION 상품(후불·BOTH 1회 수업료)은
          //   price(스냅샷)=feePerSession(정산·표시 SoT) 동치가 계약. bulk DTO 는 price 만
          //   받으므로 여기서 함께 갱신 — 미동기 시 상세 화면·후불 정산은 구 단가를 계속 쓴다.
          const syncUnitPrice =
            item.feeType === "PER_SESSION" && existing.feePerSession != null;
          const unitPriceDrift =
            syncUnitPrice && Number(existing.feePerSession) !== item.price;
          if (diff.changed || unitPriceDrift) {
            assertPrepaidChangeAllowed(
              {
                storedFeeType: existing.feeType,
                effectiveFeeType: item.feeType,
                billingMonth: existing.billingMonth,
              },
              lockBasis.salesOpenMonth,
            );
            // 후불 단가는 미정산 출석 존재 시 변경 거부 (§3-2, Phase 3).
            if (existing.billingTiming === "POSTPAID") {
              await assertPostpaidUnitPriceMutable(tx, classId);
            }
          }
          // [가격 잠금 §3-1 단서] 무월 legacy 재활성화 차단 (단건 경로와 동일 규칙).
          if (
            item.isActive === true &&
            !existing.isActive &&
            existing.feeType === "MONTHLY_FIXED" &&
            !existing.billingMonth &&
            lockBasis.salesOpenMonth
          ) {
            const currentMonthProduct = await tx.classProduct.findFirst({
              where: {
                classId,
                feeType: "MONTHLY_FIXED",
                billingMonth: lockBasis.salesOpenMonth,
              },
              select: { id: true },
            });
            assertLegacyNotReactivated({
              wasActive: existing.isActive,
              willBeActive: item.isActive,
              feeType: existing.feeType,
              billingMonth: existing.billingMonth,
              hasCurrentMonthProduct: !!currentMonthProduct,
            });
          }
          // [Phase 5 §3-4] 금액 실변경 수집 (동일 값 재저장 미수집).
          if (diff.effectiveAmountChanged) {
            bulkPriceChanges.push(
              this.resolvePriceChangeAmounts(
                existing,
                { price: item.price },
                diff.changedFields,
              ),
            );
          }
          await tx.classProduct.update({
            where: { id: item.id },
            data: {
              productName: item.productName,
              description: item.description,
              price: item.price,
              feeType: item.feeType,
              sessionsPerMonth: item.sessionsPerMonth,
              durationDays: this.deriveBulkDurationDays(item),
              ...(item.sessionsPerWeek !== undefined && {
                sessionsPerWeek: item.sessionsPerWeek,
              }),
              // 단가 미러 — price 변경 시 정산 SoT(feePerSession)도 동치 유지.
              ...(syncUnitPrice && { feePerSession: item.price }),
              // 무월(레거시) 원본 비활성 전환 — 월분 갱신과 같은 트랜잭션에서 처리해
              //   부분 실패(새 월분만 생성·무월 중복 노출) 상태를 차단한다.
              ...(item.isActive !== undefined && { isActive: item.isActive }),
            },
          });
        }
      }
    });

    if (ownerType === "team") {
      await this.invalidateClassCache(ownerId);
    }

    // [Phase 5 §3-4] 커밋 후 알림 — 다건 변경은 금액 표기 없이 1건으로 합산 발송.
    if (bulkPriceChanges.length > 0) {
      const change =
        bulkPriceChanges.length === 1
          ? bulkPriceChanges[0]
          : { oldAmount: null, newAmount: null };
      await this.notifyClassPriceChanged(classId, change);
    }

    // 갱신 후 활성 목록을 단건 GET 과 동일 형태로 반환 (운영자 시점 — 전체 노출).
    return this.getClassProducts(classId, {
      id: userId,
      userType,
    } as JwtUserPayload);
  }

  /**
   * [가격 잠금 Phase 5] 가격 실변경 알림 문구용 금액 산출 — price 우선, breakdown
   * (feePerSession) 차선. 그 외 금액 축 변경(sessionsPerWeek 등)은 금액 표기 생략.
   */
  private resolvePriceChangeAmounts(
    before: { price?: unknown; feePerSession?: unknown },
    after: { price?: number; feePerSession?: number },
    changedFields: string[],
  ): { oldAmount: number | null; newAmount: number | null } {
    if (changedFields.includes("price") && after.price !== undefined) {
      return { oldAmount: Number(before.price), newAmount: after.price };
    }
    if (
      changedFields.includes("feePerSession") &&
      after.feePerSession !== undefined
    ) {
      return {
        oldAmount:
          before.feePerSession == null ? null : Number(before.feePerSession),
        newAmount: after.feePerSession,
      };
    }
    return { oldAmount: null, newAmount: null };
  }

  /**
   * [가격 잠금 Phase 5 §3-4] 가격 실변경 알림 — 수업 활성 수강생 전원의 학부모에게 발송.
   * 잠긴 월분은 가드가 선행 차단하므로 실발송 대상은 "미판매 월분 가격 변경"
   * (이전 월분 구매자에게 다음 달 가격을 예고하는 용도).
   * 호출 계약: 변경 트랜잭션 **커밋 후** 호출 — 알림 실패가 수정을 롤백시키지 않는다.
   */
  private async notifyClassPriceChanged(
    classId: string,
    change: { oldAmount: number | null; newAmount: number | null },
  ): Promise<void> {
    try {
      const klass = await this.prisma.class.findUnique({
        where: { id: classId },
        select: { className: true },
      });
      const enrollments = await this.prisma.enrollment.findMany({
        where: { classId, status: { in: ["approved", "paid"] } },
        select: { childId: true },
      });
      const childIds = [...new Set(enrollments.map((e) => e.childId))];
      if (childIds.length === 0) return;
      // 수신자 = 자녀의 주 보호자 (isPrimary 우선). 보호자 링크가 없는 자녀는
      //   수신자에서 제외 — 결제·안내 알림은 학부모 계정 전용(자녀 계정 발송 금지).
      const links = await this.prisma.parentChild.findMany({
        where: { childId: { in: childIds } },
        select: { childId: true, parentId: true, isPrimary: true },
      });
      const parentOf = new Map<string, string>();
      for (const l of links) {
        if (!parentOf.has(l.childId) || l.isPrimary) {
          parentOf.set(l.childId, l.parentId);
        }
      }
      const orphanCount = childIds.filter((c) => !parentOf.has(c)).length;
      if (orphanCount > 0) {
        this.logger.warn(
          `가격 변경 알림: 보호자 미연결 자녀 ${orphanCount}명 제외 (classId=${classId})`,
        );
      }
      const recipients = [
        ...new Set(
          childIds
            .map((c) => parentOf.get(c))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      if (recipients.length === 0) return;
      const amountText =
        change.oldAmount != null && change.newAmount != null
          ? `: ${change.oldAmount.toLocaleString()}원 → ${change.newAmount.toLocaleString()}원`
          : "";
      for (const userId of recipients) {
        try {
          await this.notificationsService.createNotification({
            userId,
            notificationType: "class_price_changed",
            title: "수강료 변경 안내",
            message: `${klass?.className ?? "수업"} 수강료가 변경되었습니다${amountText}. 다음 월분부터 적용됩니다.`,
            linkUrl: `/classes/${classId}`,
          });
        } catch (e) {
          this.logger.warn(
            `가격 변경 알림 실패: userId=${userId}, ${(e as Error).message}`,
          );
        }
      }
    } catch (e) {
      this.logger.warn(
        `가격 변경 알림 처리 실패: classId=${classId}, ${(e as Error).message}`,
      );
    }
  }

  /**
   * Private: 클럽의 수업 목록 캐시 무효화
   * clubId가 null/undefined인 경우(아카데미 수업 등) 아무 작업도 하지 않음
   */
  private async invalidateClassCache(teamId: string | null | undefined) {
    if (!teamId) return;

    const redisConfig = this.configService.get("redis");
    const keyPrefix = redisConfig.keyPrefix.class;
    const cacheKey = `${keyPrefix}list:${teamId}`;

    await this.redisService.del(cacheKey);
  }

  /**
   * [M-1] 수강료(ClassProduct) 갱신 — wholesale delete+create 대신 id 보존 reconcile.
   *
   *   기존 코드의 deleteMany→createMany 는 enrollment/payment 가 참조하던 ClassProduct 를
   *   삭제해 FK(Enrollment.product onDelete:SetNull)를 끊었다. 그 결과 BOTH 수업의 후불 수강생
   *   enrollment.classProductId 가 NULL 이 되어 isStudentPostpaidForBothClass 가 후불을
   *   선불로 오판정(차감·노출·정산 깨짐)했다.
   *
   *   - 기존 행과 (feeType, billingTiming) 매칭 → 가격/회수 등 갱신(id 유지 → FK 보존)
   *   - 매칭 없는 desired → create
   *   - 매칭 안 된 잔여 기존 행 → enrollment/payment 미참조 시에만 delete(참조 시 FK 보존 위해 유지)
   */
  private async reconcileClassProducts(
    tx: Prisma.TransactionClient,
    classId: string,
    desired: ReturnType<typeof buildClassProducts>,
    billingMode?: string | null,
  ): Promise<{ oldAmount: number | null; newAmount: number | null }[]> {
    // [Phase 5 §3-4] 금액 실변경 수집 — 호출부가 커밋 후 알림 발송.
    const priceChanges: {
      oldAmount: number | null;
      newAmount: number | null;
    }[] = [];
    // 판매 시작(openClassSales)과의 레이스 차단 — sales lock 획득 후 tx 안에서
    //   salesOpenMonth 를 재조회해 잠금 판정 기준값으로 쓴다 (가격 잠금 §4-0 A).
    //   후불(POSTPAID/BOTH) 수업은 postpaid lock 도 고정 순서로 함께 획득 (§4-0 B).
    if (shouldUsePostpaidLock(billingMode)) {
      await acquireClassSalesAndPostpaidLocks(tx, classId);
    } else {
      await acquireClassSalesLock(tx, classId);
    }
    const lockBasis = await tx.class.findUniqueOrThrow({
      where: { id: classId },
      select: {
        salesOpenMonth: true,
        endedAt: true,
        trainingType: true,
        schedules: {
          where: { isCancelled: false },
          select: { scheduledDate: true },
        },
      },
    });
    // 신규 MONTHLY_FIXED 귀속월 (§3-7) — lifecycle 대상월 ?? 현재 판매 승인 월.
    //   매칭 update 는 기존 row 의 billingMonth 를 바꾸지 않으므로 create 분기 전용.
    const lifecycleTargetMonth = deriveClassLifecycle({
      endedAt: lockBasis.endedAt,
      salesOpenMonth: lockBasis.salesOpenMonth,
      trainingType: lockBasis.trainingType,
      schedules: lockBasis.schedules,
    }).earliestRemainingMonth;

    const existing = await tx.classProduct.findMany({
      where: { classId },
      select: {
        id: true,
        feeType: true,
        billingTiming: true,
        billingMonth: true,
        price: true,
        feePerSession: true,
        sessionsPerMonth: true,
        sessionsPerWeek: true,
        durationDays: true,
        _count: { select: { enrollments: true, payments: true } },
      },
    });

    const keyOf = (p: {
      feeType: string;
      billingTiming?: string | null;
    }): string => `${p.feeType}::${p.billingTiming ?? "PREPAID"}`;

    const usedExistingIds = new Set<string>();
    for (const d of desired) {
      const match = existing.find(
        (e) => keyOf(e) === keyOf(d) && !usedExistingIds.has(e.id),
      );
      if (match) {
        usedExistingIds.add(match.id);
        // 판매 시작된 월분은 유효금액·권리조건 변경 거부 — 실제 기록될 값 기준 diff.
        //   값이 그대로면(이름 등 무관 수정) 잠긴 상품이어도 통과한다.
        //   feeType 은 keyOf 매칭으로 동일하지만 판정 함수는 4개 write 경로 공용으로 통일.
        const diff = isEntitlementOrAmountChange(match, {
          price: d.price,
          sessionsPerMonth: d.sessionsPerMonth,
          sessionsPerWeek: d.sessionsPerWeek ?? null,
          durationDays: d.durationDays,
          feePerSession: d.feePerSession ?? null,
        });
        if (diff.changed) {
          assertPrepaidChangeAllowed(
            {
              storedFeeType: match.feeType,
              effectiveFeeType: d.feeType,
              billingMonth: match.billingMonth,
            },
            lockBasis.salesOpenMonth,
          );
          // 후불 단가는 미정산 출석 존재 시 변경 거부 (§3-2, Phase 3).
          if (match.billingTiming === "POSTPAID") {
            await assertPostpaidUnitPriceMutable(tx, classId);
          }
        }
        // [Phase 5 §3-4] 금액 실변경 수집 (동일 값 재저장 미수집).
        if (diff.effectiveAmountChanged) {
          priceChanges.push(
            this.resolvePriceChangeAmounts(
              match,
              { price: d.price, feePerSession: d.feePerSession },
              diff.changedFields,
            ),
          );
        }
        await tx.classProduct.update({
          where: { id: match.id },
          data: {
            productName: d.productName,
            description: d.description ?? null,
            price: d.price,
            sessionsPerMonth: d.sessionsPerMonth,
            sessionsPerWeek: d.sessionsPerWeek ?? null,
            durationDays: d.durationDays,
            feePerSession: d.feePerSession ?? null,
            isActive: d.isActive ?? true,
          },
        });
      } else if (d.feeType === "MONTHLY_FIXED") {
        // 신규 월 정액 — 귀속월 필수(도출 불가 시 fail-fast 400) + 판매 시작된 달 동결.
        const month = resolveNewProductBillingMonth({
          lifecycleTargetMonth,
          salesOpenMonth: lockBasis.salesOpenMonth,
        });
        assertMonthNotFrozen(month, lockBasis.salesOpenMonth);
        await tx.classProduct.create({ data: { ...d, billingMonth: month } });
      } else {
        await tx.classProduct.create({ data: d });
      }
    }

    // 잔여(매칭 안 된) 기존 행 — 참조 중이면 FK 보존 위해 그대로 유지(기존 동작).
    //   미참조라도 판매 시작된 월분(무월 legacy 포함)은 판매 계약 이력 보존을 위해
    //   hard delete 대신 판매 중지로 전환 (§3-6 D4 — D1~D3 과 공통 판정).
    for (const e of existing) {
      if (usedExistingIds.has(e.id)) continue;
      const referenced = e._count.enrollments > 0 || e._count.payments > 0;
      if (referenced) continue;
      const mode = resolveProductDeletionMode(
        { feeType: e.feeType, billingMonth: e.billingMonth },
        lockBasis.salesOpenMonth,
        false,
      );
      if (mode === "hard") {
        await tx.classProduct.delete({ where: { id: e.id } });
      } else {
        await tx.classProduct.update({
          where: { id: e.id },
          data: { isActive: false },
        });
      }
    }

    return priceChanges;
  }
}
