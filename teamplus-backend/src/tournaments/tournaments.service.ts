import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { ResourceAccessService } from "@/common/access/resource-access.service";
import { JwtUserPayload } from "@/common/interfaces/authenticated-request.interface";
import { isAdminRole } from "@/auth/constants/chldiv.constants";
import { calculateKoreanAgeSafe } from "@/common/utils/age.util";
import {
  dateOnlyToUtc,
  kstTodayUtcMidnight,
} from "@/common/utils/kst-date.util";
import {
  resolveManagedTeamIds,
  resolveScopedChildUserIds,
} from "@/common/utils/team-scope.util";
import { resolveTournamentAttribution } from "@/payments/settlement/attribution.util";
import {
  CreateTournamentDto,
  UpdateTournamentDto,
  CreateMatchDto,
  UpdateMatchDto,
  RegisterTournamentDto,
  CreateMatchEventDto,
  UpdateMatchEventDto,
  UpsertMatchPeriodDto,
  UpdateMatchScoreDto,
  UpdateMatchLiveStateDto,
  MATCH_STATUSES,
} from "./tournaments.dto";

/** 후불 정산 활성화 대기 — 경기 시간이 30분~1시간이라 마지막 경기 시작 +1시간부터 종료로 본다. */
const SETTLE_OPEN_DELAY_MS = 60 * 60 * 1000;

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly resourceAccess: ResourceAccessService, // 관리자 전용 API 리소스 소속 검증 (IDOR 가드)
  ) {}

  /**
   * [추가 2026-05-15] 대회 참가 결제 시작.
   *  · 학부모(PARENT) 가 자녀 대회 참가비를 토스 위젯으로 결제하기 위한 endpoint.
   *  · Payment row 생성(productId=null, paymentMethod=toss, status=pending)
   *    + TournamentRegistration upsert(paymentStatus=PENDING, paymentId 연결).
   *  · 토스 결제 성공 후 /payments/toss/confirm 호출 시 paymentsService 가
   *    Payment 와 연결된 tournamentRegistrations 를 PAID 로 갱신한다.
   *  · 멱등성: orderNumber 는 항상 새로 발급되므로 동일 사용자 동시 클릭 락은
   *    payments 모듈의 Redis 락에 위임 (5초). 본 endpoint 는 단순히 row 생성만.
   *
   *  @returns { id, orderNumber, amount } — frontend 가 토스 위젯에 orderId 로 전달.
   */
  async initiateTournamentPayment(
    userId: string,
    tournamentId: string,
    body: { childId: string; amount: number; gamesCount?: number },
  ): Promise<{ id: string; orderNumber: string; amount: number }> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        feePerGame: true,
        totalGames: true,
        feeType: true,
        selectedParticipantIds: true,
        status: true,
        billingMode: true,
        endDate: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }
    // [후불 차단] POSTPAID 대회는 신청 시 선불 결제(PG) 경로를 타지 않는다.
    //   금액은 대회 종료 후 confirmTournamentSettlement 로 일괄 청구된다.
    if (tournament.billingMode === "POSTPAID") {
      throw new BadRequestException(
        "후불 대회는 대회 종료 후 일괄 청구됩니다.",
      );
    }
    // 종료/시작 대회 결제 차단 — status(cancelled/finished) 외에 첫 경기 시작 후에도
    //   신청 마감(registerTournament 와 동일 기준). 경기 미등록 대회는 종료일 폴백.
    if (
      tournament.status === "cancelled" ||
      tournament.status === "finished"
    ) {
      throw new BadRequestException("이미 종료된 대회는 결제할 수 없습니다.");
    }
    await this.assertTournamentRegistrationOpen(
      tournamentId,
      tournament.endDate,
    );

    // 자녀 검증 — 본인 자녀이며 대회 참가 대상에 포함되어야 한다.
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: userId, childId: body.childId },
      },
      select: { parentId: true },
    });
    if (!parentChild) {
      throw new BadRequestException("자녀 정보를 확인할 수 없습니다.");
    }
    const participantIds = Array.isArray(tournament.selectedParticipantIds)
      ? (tournament.selectedParticipantIds as unknown as string[])
      : [];
    if (participantIds.length > 0 && !participantIds.includes(body.childId)) {
      throw new BadRequestException(
        "해당 자녀는 이 대회 참가 대상이 아닙니다.",
      );
    }

    // 서버사이드 금액 검증 — feePerGame × gamesCount (TOTAL_FIXED 는 1회 단가).
    const feePerGame = tournament.feePerGame
      ? Number(tournament.feePerGame)
      : 0;
    if (feePerGame <= 0) {
      throw new BadRequestException("무료 대회는 결제가 필요하지 않습니다.");
    }
    const gamesCount =
      tournament.feeType === "TOTAL_FIXED"
        ? 1
        : Math.max(1, body.gamesCount ?? tournament.totalGames ?? 1);
    const expectedAmount = feePerGame * gamesCount;
    if (Math.abs(expectedAmount - body.amount) > 0) {
      throw new BadRequestException(
        `결제 금액 불일치 — 요청 ${body.amount}원, 서버 계산 ${expectedAmount}원`,
      );
    }

    // orderNumber 발급 — `TRN-{timestamp}-{rand}` 로 수업 결제(`ORD-`) 와 prefix 분리.
    const orderNumber = `TRN-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    // Payment row 생성 + TournamentRegistration upsert 트랜잭션.
    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderNumber,
          userId,
          productId: null,
          amount: body.amount,
          paymentStatus: "pending",
          paymentMethod: "toss",
        },
      });

      // 기존 TournamentRegistration 존재 시 paymentId 갱신, 없으면 신규 생성.
      //  paymentStatus 는 PENDING 유지 (토스 confirm 성공 시 PAID 로 전환).
      const existing = await tx.tournamentRegistration.findUnique({
        where: {
          tournamentId_userId_childId: {
            tournamentId,
            userId,
            childId: body.childId,
          },
        },
        select: { id: true, paymentStatus: true },
      });
      if (existing) {
        await tx.tournamentRegistration.update({
          where: { id: existing.id },
          data: {
            gamesCount,
            calculatedFee: new Decimal(body.amount),
            paymentStatus: "PENDING",
            paymentId: created.id,
            cancelledAt: null,
          },
        });
      } else {
        await tx.tournamentRegistration.create({
          data: {
            tournamentId,
            userId,
            childId: body.childId,
            gamesCount,
            calculatedFee: new Decimal(body.amount),
            paymentStatus: "PENDING",
            paymentId: created.id,
          },
        });
      }

      return created;
    });

    return {
      id: payment.id,
      orderNumber: payment.orderNumber,
      amount: payment.amount,
    };
  }

  // ==================== Tournament CRUD ====================

  /**
   * 선택 선수(User.id) 명단 → distinct 출생연도 집합 파생 (뱃지 캐시용).
   *
   * [재설계 2026-06-16] selectedParticipantIds 가 자격 SoT 가 되면서,
   *   eligibleBirthYears 는 "선택 선수들의 출생연도" 표시용 캐시로 자동 산출한다.
   *   userId 들을 단일 쿼리(`id in [...]`)로 조회하여 N+1 을 피하고, childProfile.birthDate
   *   우선·없으면 User.birthDate 에서 연도를 추출해 distinct 정렬 배열로 반환한다.
   */
  private async deriveBirthYearsFromPlayers(
    userIds: string[],
  ): Promise<number[]> {
    if (!userIds || userIds.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        birthDate: true,
        childProfile: { select: { birthDate: true } },
      },
    });
    const years = new Set<number>();
    for (const u of users) {
      const birthDate = u.childProfile?.birthDate ?? u.birthDate;
      // birthDate 는 `@db.Date`(UTC 자정) — 출생연도는 getUTCFullYear.
      if (birthDate) years.add(birthDate.getUTCFullYear());
    }
    return [...years].sort((a, b) => a - b);
  }

  /**
   * 출생연도(birthYear)가 대회 자격에 부합하는지 — 이중지원 판정 SoT.
   *  · eligibleBirthYears(배열)가 비어있지 않으면 배열 정확 매칭(includes) 우선.
   *  · 비어있으면([]) 기존 eligibleBirthYearFrom/To 범위 비교로 폴백.
   *  (birthYear 불명 처리는 호출부 책임 — 이 함수는 정수 birthYear 만 받는다.)
   */
  private isBirthYearEligible(
    birthYear: number,
    t: {
      eligibleBirthYearFrom: number | null;
      eligibleBirthYearTo: number | null;
      eligibleBirthYears?: number[] | null;
    },
  ): boolean {
    const years = Array.isArray(t.eligibleBirthYears)
      ? t.eligibleBirthYears
      : [];
    if (years.length > 0) {
      return years.includes(birthYear);
    }
    if (t.eligibleBirthYearFrom != null && birthYear < t.eligibleBirthYearFrom)
      return false;
    if (t.eligibleBirthYearTo != null && birthYear > t.eligibleBirthYearTo)
      return false;
    return true;
  }

  /**
   * 대회가 특정 아동(들)에게 노출되어야 하는지 판정 (PARENT/TEEN/CHILD 공통).
   *
   * [재설계 2026-06-16] selectedParticipantIds(선수 명단 스냅샷) 단독 SoT.
   *  · 명단에 아동 User.id 가 포함되면 노출. 출생연도/팀 자격은 더 이상 보지 않는다.
   *  · 회귀: 명단이 비어있는 레거시 대회는 폴백으로 기존 "소속 팀 + 출생연도" 분기 유지
   *    (과도기 — 신규는 항상 명단 전송).
   */
  private isTournamentVisibleToChildren(
    t: {
      teamId: string | null;
      eligibleBirthYearFrom: number | null;
      eligibleBirthYearTo: number | null;
      eligibleBirthYears?: number[] | null;
      selectedParticipantIds: unknown;
    },
    childIds: string[],
    childUsers: Array<{
      id: string;
      birthDate: Date | null;
      childProfile: { birthDate: Date | null } | null;
      teamMembers: Array<{ teamId: string }>;
    }>,
  ): boolean {
    const list = Array.isArray(t.selectedParticipantIds)
      ? (t.selectedParticipantIds as unknown as string[])
      : [];

    // 명단 SoT — 명단이 있으면 포함 여부만으로 판정.
    if (list.length > 0) {
      return list.some((id) => childIds.includes(id));
    }

    // 레거시 폴백 — 명단이 비어있을 때만 소속 팀 + 출생연도 자격.
    if (!t.teamId) return false;
    return childUsers.some((cu) => {
      const teamMatch = cu.teamMembers.some((m) => m.teamId === t.teamId);
      if (!teamMatch) return false;
      // birthDate 는 `@db.Date`(UTC 자정) — 출생연도는 getUTCFullYear.
      const birthYear =
        cu.childProfile?.birthDate?.getUTCFullYear() ??
        cu.birthDate?.getUTCFullYear() ??
        null;
      if (birthYear == null) return true; // 출생연도 불명 → 팀 일치만으로 노출
      return this.isBirthYearEligible(birthYear, t);
    });
  }

  /**
   * 토너먼트 목록 조회.
   *
   * [수정 2026-05-11] 사용자 역할별 가시성 필터링 SoT 일원화:
   *  · ADMIN/SYSTEM/OPER: 전체 노출
   *  · DIRECTOR/COACH/ACADEMY_DIRECTOR: 본인이 TeamMember(approved + role HEAD_COACH/COACH/MANAGER)
   *    인 팀에서 주최한 대회만 노출.
   *  · PARENT: 자녀 명시 선택(selectedParticipantIds) OR 자녀 소속 팀 대회 중
   *    출생연도 자격 충족 대회 노출. (2026-06-11 수정)
   *  · TEEN/CHILD: 본인 명시 선택 OR 본인 소속 팀 대회 중 출생연도 자격 충족. (2026-06-11)
   *
   *  · teamId 쿼리 파라미터가 명시되면 그 우선 적용 (관리자 화면 명시 필터).
   */
  async getTournaments(teamId?: string, userId?: string, childId?: string) {
    const baseWhere: Record<string, unknown> = teamId ? { teamId } : {};
    // [2026-06-16] 대회별 "내 자녀(또는 본인) 중 결제완료(PAID)한 참가자 id" 매핑.
    //   응답 paidChildIds 로 내려 수업목록 등록완료 표기·홈 달력 자녀별 필터에 사용.
    const paidChildMap = new Map<string, string[]>();
    const addPaidChild = (tournamentId: string | null, cid: string | null) => {
      if (!tournamentId || !cid) return;
      const arr = paidChildMap.get(tournamentId) ?? [];
      if (!arr.includes(cid)) arr.push(cid);
      paidChildMap.set(tournamentId, arr);
    };
    // [2026-06-17] 대회별 "내 자녀(또는 본인) 중 신청한 참가자 id"(취소/환불 제외).
    //   후불(POSTPAID) 대회는 결제 전이라도 신청만으로 등록완료 표기하기 위함.
    //   선불은 paidChildIds(결제완료)만 등록완료 — 최종 enrolledChildIds 산출 시 billingMode로 분기.
    const registeredChildMap = new Map<string, string[]>();
    const registeredTournamentIds = new Set<string>();
    const addRegisteredChild = (
      tournamentId: string | null,
      cid: string | null,
    ) => {
      if (!tournamentId || !cid) return;
      registeredTournamentIds.add(tournamentId);
      const arr = registeredChildMap.get(tournamentId) ?? [];
      if (!arr.includes(cid)) arr.push(cid);
      registeredChildMap.set(tournamentId, arr);
    };

    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, userType: true },
      });
      const role = user?.userType ?? null;

      if (role === "ADMIN" || role === "SYSTEM" || role === "OPER") {
        // 전체 노출 — 필터 추가 없음
      } else if (
        role === "DIRECTOR" ||
        role === "COACH" ||
        role === "ACADEMY_DIRECTOR"
      ) {
        // [2026-05-20] 팀 판정 SoT 통일 — resolveManagedTeamIds
        //   (TeamMember + CoachProfile + Team.coachId). 기존 roleInTeam IN
        //   (HEAD_COACH,COACH,MANAGER) 필터는 Team.coachId 로만 연결된 감독을
        //   누락 → classes.service 와 동일 기준으로 정합.
        const teamIds = await resolveManagedTeamIds(this.prisma, userId);
        // 본인 팀이 0개면 빈 결과 반환
        if (teamIds.length === 0) return [];
        // 명시 teamId 는 관리 팀 목록과 교집합으로 제한 — 임의 teamId 로 타 팀 대회 목록을
        // 조회하는 IDOR 차단. 비관리 팀 지정 시 403 대신 빈 결과(데이터 유출 없이 조용히 차단).
        if (teamId) {
          if (!teamIds.includes(teamId)) return [];
          baseWhere.teamId = teamId;
        } else {
          baseWhere.teamId = { in: teamIds };
        }
      } else if (role === "PARENT") {
        // [2026-06-11] 노출 기준 통일 — 기존엔 selectedParticipantIds(감독이
        //   생성 시 직접 고른 명단)에 자녀가 포함된 대회만 노출했으나,
        //   selectedParticipantIds 는 선택 항목(미입력 시 null)이고 실제 참가
        //   자격은 "팀 소속 + 출생연도(eligibleBirthYear)"로 정해진다. 생성 시
        //   notifyTeamParents(teamId)로 팀 전체 학부모에게 알림도 보낸다 →
        //   노출 대상 = 자녀 소속 팀 대회 중 출생연도 자격 충족, OR 명시 선택.
        // childId 지정 시(학부모 자녀 선택) 해당 자녀만(IDOR 검증), 미지정 시 모든 자녀.
        //   resolveScopedChildUserIds: 타 자녀 childId → 빈 배열 → 대회 0건(유출 차단).
        const childIds = await resolveScopedChildUserIds(
          this.prisma,
          userId,
          childId,
        );
        if (childIds.length === 0) return [];

        // 자녀별 출생연도 + 소속(approved·활성) 팀 ids
        const childUsers = await this.prisma.user.findMany({
          where: { id: { in: childIds } },
          select: {
            id: true,
            birthDate: true,
            childProfile: { select: { birthDate: true } },
            teamMembers: {
              where: { approvalStatus: "approved", leftAt: null },
              select: { teamId: true },
            },
          },
        });

        // [2026-06-15] 결제완료(PAID)한 대회는 자격/선택 무관 무조건 노출.
        //   selectedParticipantIds 가 비어 결제가 허용된 경우(전체 자녀 허용) 또는
        //   출생연도 자격과 무관하게 이미 결제한 자녀에게는 반드시 보여야 한다.
        const paidIdRegs = await this.prisma.tournamentRegistration.findMany({
          where: {
            paymentStatus: "PAID",
            OR: [{ childId: { in: childIds } }, { userId: { in: childIds } }],
          },
          select: { tournamentId: true, childId: true, userId: true },
        });
        const paidTournamentIds = new Set(
          paidIdRegs.map((r) => r.tournamentId),
        );
        // 대회별 결제 자녀 매핑 (childId 우선, 없으면 userId).
        for (const r of paidIdRegs) {
          addPaidChild(r.tournamentId, r.childId ?? r.userId);
        }

        // [2026-06-17] 신청(취소/환불 제외)한 대회 — 후불 등록완료 표기 + 무조건 노출.
        const regAllRows = await this.prisma.tournamentRegistration.findMany({
          where: {
            paymentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
            OR: [{ childId: { in: childIds } }, { userId: { in: childIds } }],
          },
          select: { tournamentId: true, childId: true, userId: true },
        });
        for (const r of regAllRows) {
          addRegisteredChild(r.tournamentId, r.childId ?? r.userId);
        }

        const rows = await this.prisma.tournament.findMany({
          where: baseWhere,
          select: {
            id: true,
            teamId: true,
            eligibleBirthYearFrom: true,
            eligibleBirthYearTo: true,
            eligibleBirthYears: true,
            selectedParticipantIds: true,
          },
        });
        const visibleIds = rows
          .filter(
            (t) =>
              paidTournamentIds.has(t.id) ||
              registeredTournamentIds.has(t.id) ||
              this.isTournamentVisibleToChildren(t, childIds, childUsers),
          )
          .map((t) => t.id);
        if (visibleIds.length === 0) return [];
        baseWhere.id = { in: visibleIds };
      } else if (role === "TEEN" || role === "CHILD") {
        // [2026-06-11] PARENT 와 동일 기준 — 본인 명시 선택 OR 소속 팀 대회 +
        //   출생연도 자격 충족.
        const self = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            birthDate: true,
            childProfile: { select: { birthDate: true } },
            teamMembers: {
              where: { approvalStatus: "approved", leftAt: null },
              select: { teamId: true },
            },
          },
        });
        if (!self) return [];

        // [2026-06-15] 결제완료(PAID)한 대회는 자격/선택 무관 무조건 노출.
        const paidIdRegs = await this.prisma.tournamentRegistration.findMany({
          where: {
            paymentStatus: "PAID",
            OR: [{ childId: userId }, { userId }],
          },
          select: { tournamentId: true },
        });
        const paidTournamentIds = new Set(
          paidIdRegs.map((r) => r.tournamentId),
        );
        for (const r of paidIdRegs) addPaidChild(r.tournamentId, userId);

        // [2026-06-17] 신청(취소/환불 제외)한 대회 — 후불 등록완료 표기 + 무조건 노출.
        const regAllRows = await this.prisma.tournamentRegistration.findMany({
          where: {
            paymentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
            OR: [{ childId: userId }, { userId }],
          },
          select: { tournamentId: true },
        });
        for (const r of regAllRows) addRegisteredChild(r.tournamentId, userId);

        const rows = await this.prisma.tournament.findMany({
          where: baseWhere,
          select: {
            id: true,
            teamId: true,
            eligibleBirthYearFrom: true,
            eligibleBirthYearTo: true,
            eligibleBirthYears: true,
            selectedParticipantIds: true,
          },
        });
        const visibleIds = rows
          .filter(
            (t) =>
              paidTournamentIds.has(t.id) ||
              registeredTournamentIds.has(t.id) ||
              this.isTournamentVisibleToChildren(t, [userId], [self]),
          )
          .map((t) => t.id);
        if (visibleIds.length === 0) return [];
        baseWhere.id = { in: visibleIds };
      }
    }

    const where = baseWhere;

    const tournaments = await this.prisma.tournament.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        teamId: true,
        rinkId: true,
        startDate: true,
        endDate: true,
        status: true,
        eligibleBirthYearFrom: true,
        eligibleBirthYearTo: true,
        eligibleBirthYears: true,
        feePerGame: true,
        totalGames: true,
        feeType: true,
        // 결제 모드 — 프론트가 선불/후불 표시 분기에 사용.
        billingMode: true,
        maxParticipants: true,
        registrationDeadline: true,
        ageGroup: true,
        selectedParticipantIds: true,
        // [추가 2026-05-15 db-keeper] T03/H2 — 대회 정보 페이지 신규 필드.
        rules: true,
        location: true,
        prizeAmount: true,
        createdAt: true,
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        rink: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            matches: true,
            registrations: true,
          },
        },
      },
      orderBy: {
        startDate: "desc",
      },
    });

    // [2026-06-16] 각 대회에 내 자녀(또는 본인) 결제완료 참가자 id 목록 부착.
    // [2026-06-17] enrolledChildIds — 수업목록 "등록완료" 표기용.
    //   후불(POSTPAID): 신청 자녀(결제 전 포함) ∪ 결제완료. 선불(PREPAID): 결제완료만.
    return tournaments.map((t) => {
      const paid = paidChildMap.get(t.id) ?? [];
      const registered = registeredChildMap.get(t.id) ?? [];
      const enrolledChildIds =
        t.billingMode === "POSTPAID"
          ? Array.from(new Set([...paid, ...registered]))
          : paid;
      return {
        ...t,
        paidChildIds: paid,
        enrolledChildIds,
      };
    });
  }

  /**
   * 학생용 대회 목록 조회
   */
  async getAvailableTournaments(userId: string) {
    const now = new Date();
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        birthDate: true,
        childProfile: {
          select: {
            birthDate: true,
          },
        },
      },
    });

    // birthDate 는 `@db.Date`(UTC 자정) — 출생연도는 getUTCFullYear.
    const birthYear =
      currentUser?.childProfile?.birthDate?.getUTCFullYear() ??
      currentUser?.birthDate?.getUTCFullYear() ??
      null;

    const tournaments = await this.prisma.tournament.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        status: true,
        eligibleBirthYearFrom: true,
        eligibleBirthYearTo: true,
        eligibleBirthYears: true,
        feePerGame: true,
        totalGames: true,
        feeType: true,
        // 결제 모드 — 학생 목록에서 선불/후불 표시 분기에 사용.
        billingMode: true,
        maxParticipants: true,
        registrationDeadline: true,
        location: true,
        rink: {
          select: {
            name: true,
            location: true,
          },
        },
        venue: {
          select: {
            id: true,
            name: true,
          },
        },
        team: {
          select: {
            name: true,
            location: true,
          },
        },
        registrations: {
          select: {
            userId: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
    });

    return tournaments
      .filter((tournament) => {
        if (!birthYear) {
          return true;
        }

        // 이중지원: eligibleBirthYears 배열 우선, 비면 from/to 범위 폴백.
        return this.isBirthYearEligible(birthYear, tournament);
      })
      .map((tournament) => {
        const activeRegistrations = tournament.registrations.filter(
          (registration) => registration.paymentStatus !== "CANCELLED",
        );
        const currentParticipants = activeRegistrations.length;
        const isRegistered = activeRegistrations.some(
          (registration) => registration.userId === userId,
        );
        const maxParticipants = Math.max(
          tournament.maxParticipants ?? currentParticipants,
          currentParticipants,
          1,
        );

        return {
          id: tournament.id,
          name: tournament.name,
          startDate: tournament.startDate,
          endDate: tournament.endDate,
          // [2026-06-22] venue?.name(대회 전체 장소) 폴백 추가 + team.location/team.name(팀명)
          //   제거 — 장소를 선택해도 "장소 추후 안내"로 뜨거나 팀명이 장소로 노출되던 버그 수정.
          location:
            tournament.location ||
            tournament.venue?.name ||
            tournament.rink?.location ||
            tournament.rink?.name ||
            "장소 추후 안내",
          entryFee: Number(tournament.feePerGame ?? 0),
          billingMode: tournament.billingMode,
          maxParticipants,
          currentParticipants,
          status: this.mapStudentTournamentStatus(
            tournament.status,
            tournament.startDate,
            tournament.endDate,
            tournament.registrationDeadline,
            currentParticipants,
            tournament.maxParticipants,
            now,
          ),
          ageGroup: this.buildTournamentAgeGroupLabel(
            tournament.eligibleBirthYearFrom,
            tournament.eligibleBirthYearTo,
            tournament.eligibleBirthYears,
          ),
          description: tournament.description ?? "",
          isRegistered,
        };
      });
  }

  /**
   * 토너먼트 상세 조회 (매치 목록 포함)
   */
  async getTournamentById(id: string, userId?: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        rink: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
        venue: {
          select: { id: true, name: true },
        },
        matches: {
          select: {
            id: true,
            scheduledAt: true,
            startedAt: true,
            endedAt: true,
            homeScore: true,
            awayScore: true,
            status: true,
            currentPeriod: true,
            round: true,
            matchOrder: true,
            fee: true,
            refereeMain: true,
            homeTeam: {
              select: { id: true, name: true },
            },
            awayTeam: {
              select: { id: true, name: true },
            },

            homeTeamId: true,
            awayTeamId: true,
            opponentName: true,
            venueName: true,
            rink: {
              select: { id: true, name: true },
            },
            venue: {
              select: { id: true, name: true },
            },
          },
          orderBy: [
            { round: "asc" },
            { matchOrder: "asc" },
            { scheduledAt: "asc" },
          ],
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    // [2026-06-15] 결제 완료(PAID) 참가자 User.id 목록 — 결제 페이지에서 이미 결제한
    //   선수(자녀)의 선택을 비활성화해 중복 결제를 막는다.
    //   paidRegistrations: 자녀(participantId)별 등록ID — 결제 취소 호출에 사용.
    //   [2026-06-16] paymentId 연결된 "실결제"만 — 무료 대회는 신청 시 자동 PAID(Payment 없음)라
    //     결제내역/결제취소에서 제외(취소할 결제가 없음).
    const paidRegs = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId: id, paymentStatus: "PAID", paymentId: { not: null } },
      select: { id: true, userId: true, childId: true },
    });
    const paidParticipantIds = Array.from(
      new Set(
        paidRegs.flatMap((r) =>
          [r.childId, r.userId].filter((x): x is string => !!x),
        ),
      ),
    );
    const paidRegistrations = paidRegs
      .map((r) => ({
        participantId: r.childId ?? r.userId,
        registrationId: r.id,
      }))
      .filter((x): x is { participantId: string; registrationId: string } =>
        Boolean(x.participantId),
      );

    // [2026-06-17] 요청자(학부모/학생) 자녀별 등록 상태 — 후불 결제내역/결제 버튼용.
    //   participantId(자녀 또는 본인) 기준으로 상태·금액·orderNumber 를 내려준다.
    //   paymentStatus: UNPAID(후불 정산 전) · PENDING(후불 정산 후 미결제/선불 결제대기) · PAID.
    //   후불결제 버튼 활성화 = PENDING && orderNumber 존재(감독이 정산금액 입력 완료).
    let myRegistrations: Array<{
      participantId: string;
      registrationId: string;
      paymentStatus: string;
      amount: number;
      orderNumber: string | null;
    }> = [];
    if (userId) {
      const childIds = await resolveScopedChildUserIds(this.prisma, userId);
      const scope = Array.from(new Set([userId, ...childIds]));
      const myRegs = await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId: id,
          paymentStatus: { notIn: ["CANCELLED", "REFUNDED"] },
          OR: [{ userId: { in: scope } }, { childId: { in: scope } }],
        },
        select: {
          id: true,
          userId: true,
          childId: true,
          paymentStatus: true,
          calculatedFee: true,
          payment: { select: { orderNumber: true, paymentStatus: true } },
        },
      });
      myRegistrations = myRegs.map((r) => ({
        participantId: r.childId ?? r.userId,
        registrationId: r.id,
        // 결제 모듈에서 Payment 가 completed 면 registration 도 PAID 로 동기화되지만,
        // 방어적으로 Payment.paymentStatus=completed 도 PAID 로 간주.
        paymentStatus:
          r.payment?.paymentStatus === "completed" ? "PAID" : r.paymentStatus,
        amount: Number(r.calculatedFee),
        orderNumber: r.payment?.orderNumber ?? null,
      }));
    }

    return {
      ...tournament,
      paidParticipantIds,
      paidRegistrations,
      myRegistrations,
    };
  }

  /**
   * 토너먼트 생성.
   *
   * [수정 2026-05-11]
   *  · teamId 가 비어 있으면 호출자(coach/director) 의 첫 번째 관리 팀으로 자동 세팅.
   *  · ageGroup / selectedParticipantIds 신규 필드 저장.
   */
  async createTournament(dto: CreateTournamentDto, requester: JwtUserPayload) {
    // 날짜 검증
    if (new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new BadRequestException("시작 날짜가 종료 날짜보다 늦을 수 없습니다.");
    }

    // teamId 자동 보강 — DIRECTOR/COACH 가 본인 팀 생략 시 첫 관리 팀 사용.
    //  기준은 assertTeamManager 와 동일(owner=Team.coachId OR 승인 TeamMember).
    //  CoachProfile 은 의도적으로 제외 — 가입 시 pending 과 함께 자동 생성되어
    //  가드 기준(2026-05-21 보안 수정)에서 배제된 경로라, 여기서 채우면 바로 아래
    //  assertTeamManager 에서 403 이 나는 자기모순이 생긴다.
    let teamId = dto.teamId;
    if (!teamId) {
      const [ownedTeam, mgr] = await Promise.all([
        this.prisma.team.findFirst({
          where: { coachId: requester.id },
          select: { id: true },
        }),
        this.prisma.teamMember.findFirst({
          where: {
            userId: requester.id,
            approvalStatus: "approved",
            leftAt: null,
            roleInTeam: { in: ["HEAD_COACH", "COACH", "MANAGER"] },
          },
          select: { teamId: true },
        }),
      ]);
      teamId = ownedTeam?.id ?? mgr?.teamId ?? undefined;
    }

    if (teamId) {
      // 클럽 존재 확인
      const club = await this.prisma.team.findUnique({
        where: { id: teamId },
      });
      if (!club) {
        throw new NotFoundException("클럽을 찾을 수 없습니다.");
      }
      // 전달된 teamId 의 관리 권한 검증 — 존재 확인만으로는 타 팀 명의 대회 생성이 가능했다.
      await this.resourceAccess.assertTeamManager(teamId, requester);
    } else if (!isAdminRole(requester.userType)) {
      // teamId=null 대회는 관리 주체가 없어 관리자급(ADMIN/SYSTEM/OPER) 전용 (설계 v4.0 확정).
      // isAdminRole — RolesGuard 자동 통과·assertManageableTournamentRecord 와 동일 기준.
      throw new BadRequestException(
        "주최 팀을 지정해야 합니다. 관리 중인 팀이 없으면 대회를 생성할 수 없습니다.",
      );
    }

    // 링크 존재 확인 (선택적)
    if (dto.rinkId) {
      const rink = await this.prisma.rink.findUnique({
        where: { id: dto.rinkId },
      });
      if (!rink) {
        throw new NotFoundException("링크를 찾을 수 없습니다.");
      }
    }

    // 링크장(Venue) 존재 확인 (선택적)
    if (dto.venueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.venueId },
      });
      if (!venue) {
        throw new NotFoundException("링크장을 찾을 수 없습니다.");
      }
    }

    // 출생연도 범위 검증
    if (
      dto.eligibleBirthYearFrom &&
      dto.eligibleBirthYearTo &&
      dto.eligibleBirthYearFrom > dto.eligibleBirthYearTo
    ) {
      throw new BadRequestException("출생연도 시작이 종료보다 클 수 없습니다.");
    }

    // [재설계 2026-06-16] 참가 자격 SoT = selectedParticipantIds(선수 명단 스냅샷).
    //   eligibleBirthYears 는 자격이 아니라 "선택 선수들의 distinct 출생연도" 뱃지용 캐시로
    //   자동 파생·저장한다. from/to 는 레거시 표시/쿼리 호환을 위해 min/max 를 파생 기록.
    //   eligibleGroupIds 는 자격 의미 폐기 — 미저장(빈 배열).
    const selectedParticipantIds = dto.selectedParticipantIds ?? [];
    const eligibleBirthYears = await this.deriveBirthYearsFromPlayers(
      selectedParticipantIds,
    );
    const hasBirthYears = eligibleBirthYears.length > 0;
    const derivedBirthYearFrom = hasBirthYears
      ? Math.min(...eligibleBirthYears)
      : dto.eligibleBirthYearFrom;
    const derivedBirthYearTo = hasBirthYears
      ? Math.max(...eligibleBirthYears)
      : dto.eligibleBirthYearTo;

    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name,
        description: dto.description,
        teamId,
        rinkId: dto.rinkId,
        venueId: dto.venueId,
        startDate: dateOnlyToUtc(dto.startDate.slice(0, 10)),
        endDate: dateOnlyToUtc(dto.endDate.slice(0, 10)),
        status: dto.status || "scheduled",
        eligibleBirthYearFrom: derivedBirthYearFrom,
        eligibleBirthYearTo: derivedBirthYearTo,
        eligibleBirthYears,
        feePerGame: dto.feePerGame ? new Decimal(dto.feePerGame) : undefined,
        totalGames: dto.totalGames,
        feeType: dto.feeType,
        maxParticipants: dto.maxParticipants,
        registrationDeadline: dto.registrationDeadline
          ? new Date(dto.registrationDeadline)
          : undefined,
        ageGroup: dto.ageGroup,
        selectedParticipantIds,
        // [재설계 2026-06-16] eligibleGroupIds 자격 의미 폐기 — 항상 빈 배열 저장.
        eligibleGroupIds: [],
        // [추가 2026-05-15 db-keeper] T03/H2 — 대회 정보 페이지 신규 필드.
        rules: dto.rules,
        // 빈 문자열은 null 정규화 — 표시 폴백이 ??/|| 혼재라 "" 저장 시 장소가 공란으로 뜬다.
        location: dto.location?.trim() || null,
        prizeAmount:
          dto.prizeAmount !== undefined
            ? new Decimal(dto.prizeAmount)
            : undefined,
        // 결제 모드 — 미지정 시 schema default(PREPAID) 적용.
        billingMode: dto.billingMode ?? undefined,
      },
    });

    // 팀 지정 대회면 해당 팀 소속 학생의 학부모에게 알림 (전체 대회는 제외, 실패 격리)
    if (teamId) {
      void this.notificationsService.notifyTeamParents(teamId, {
        notificationType: "tournament_created",
        title: "새 대회 등록",
        message: tournament.name,
        linkUrl: `/tournaments/${tournament.id}`,
      });
    }

    return tournament;
  }

  /**
   * 토너먼트 수정
   */
  async updateTournament(
    id: string,
    dto: UpdateTournamentDto,
    requester: JwtUserPayload,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }
    // 기존 대회의 관리 권한 검증 (teamId=null 대회는 ADMIN 전용)
    await this.resourceAccess.assertManageableTournamentRecord(
      tournament,
      requester,
    );
    // 주최 팀 변경 시 변경 대상 팀의 관리 권한도 검증 — 타 팀 명의로 이관 차단.
    if (dto.teamId && dto.teamId !== tournament.teamId) {
      await this.resourceAccess.assertTeamManager(dto.teamId, requester);
    }

    // [2026-06-22] 종료/취소된 대회는 구조 수정 차단 — 경기 결과·후불 정산은 별도 경로에서 처리.
    //   status 자동 전이가 없으므로 종료일(endDate) 경과도 종료로 인정.
    // endDate 는 `@db.Date`(UTC 자정) — day-level 판정: 종료일 당일은 진행 중, 다음날부터 종료.
    const endedByDate =
      tournament.endDate != null && tournament.endDate < kstTodayUtcMidnight();
    if (
      tournament.status === "finished" ||
      tournament.status === "cancelled" ||
      endedByDate
    ) {
      throw new BadRequestException("종료된 대회는 수정할 수 없습니다.");
    }

    // 날짜 검증
    const startDate = dto.startDate
      ? dateOnlyToUtc(dto.startDate.slice(0, 10))
      : tournament.startDate;
    const endDate = dto.endDate
      ? dateOnlyToUtc(dto.endDate.slice(0, 10))
      : tournament.endDate;

    if (startDate > endDate) {
      throw new BadRequestException("시작 날짜가 종료 날짜보다 늦을 수 없습니다.");
    }

    // [추가 2026-05-15 db-keeper] T02/T04 협업 — ageGroup ↔ birth year 정합성:
    //  · ageGroup='ALL' (전체) 로 변경 시 출생연도 제한도 자동 클리어 (null).
    //  · dto.eligibleBirthYearFrom/To === null 명시 시에도 NULL 저장 허용.
    //  · 그 외(undefined) 은 기존 값 유지.
    const nextAgeGroup =
      dto.ageGroup !== undefined ? dto.ageGroup : tournament.ageGroup;
    const isAllAgeGroup = nextAgeGroup === "ALL";

    const resolveBirthYear = (
      dtoValue: number | null | undefined,
      currentValue: number | null,
    ): number | null => {
      if (isAllAgeGroup) return null; // ALL 이면 강제 클리어
      if (dtoValue === null) return null; // 명시 NULL → 저장
      if (dtoValue === undefined) return currentValue; // 미전달 → 유지
      return dtoValue;
    };

    // [재설계 2026-06-16] selectedParticipantIds(선수 명단) 가 자격 SoT.
    //   · dto.selectedParticipantIds !== undefined (전송됨) → 명단 갱신 +
    //     eligibleBirthYears 를 선택 선수들의 distinct 출생연도로 자동 파생 재계산.
    //     (FE 는 eligibleBirthYears/eligibleGroupIds 를 전송하지 않는다 — 백엔드가 파생.)
    //   · dto.selectedParticipantIds === undefined (미전송) → 명단·파생 birthYears 모두 보존.
    //   · ageGroup='ALL' 명시 변경 시 birthYears 클리어는 레거시 호환으로 유지.
    const currentParticipantIds = Array.isArray(
      tournament.selectedParticipantIds,
    )
      ? (tournament.selectedParticipantIds as unknown as string[])
      : [];
    const currentBirthYears = Array.isArray(
      (tournament as { eligibleBirthYears?: number[] }).eligibleBirthYears,
    )
      ? (tournament as { eligibleBirthYears: number[] }).eligibleBirthYears
      : [];

    const nextParticipantIds =
      dto.selectedParticipantIds !== undefined
        ? dto.selectedParticipantIds
        : currentParticipantIds;

    let nextBirthYears: number[];
    let nextBirthYearFrom: number | null;
    let nextBirthYearTo: number | null;

    if (isAllAgeGroup) {
      // ALL → 모든 출생연도 자격 해제 (레거시 호환).
      nextBirthYears = [];
      nextBirthYearFrom = null;
      nextBirthYearTo = null;
    } else if (dto.selectedParticipantIds !== undefined) {
      // 명단 전송됨 — 선택 선수 출생연도로 파생 재계산.
      nextBirthYears = await this.deriveBirthYearsFromPlayers(
        nextParticipantIds,
      );
      nextBirthYearFrom =
        nextBirthYears.length > 0 ? Math.min(...nextBirthYears) : null;
      nextBirthYearTo =
        nextBirthYears.length > 0 ? Math.max(...nextBirthYears) : null;
    } else {
      // 명단 미전송 — 기존 파생 birthYears·from/to 보존.
      nextBirthYears = currentBirthYears;
      nextBirthYearFrom = resolveBirthYear(
        dto.eligibleBirthYearFrom,
        tournament.eligibleBirthYearFrom,
      );
      nextBirthYearTo = resolveBirthYear(
        dto.eligibleBirthYearTo,
        tournament.eligibleBirthYearTo,
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: {
        name: dto.name ?? tournament.name,
        description: dto.description ?? tournament.description,
        teamId: dto.teamId ?? tournament.teamId,
        rinkId: dto.rinkId ?? tournament.rinkId,
        venueId: dto.venueId ?? tournament.venueId,
        startDate,
        endDate,
        status: dto.status ?? tournament.status,
        eligibleBirthYearFrom: nextBirthYearFrom,
        eligibleBirthYearTo: nextBirthYearTo,
        eligibleBirthYears: nextBirthYears,
        feePerGame: dto.feePerGame
          ? new Decimal(dto.feePerGame)
          : tournament.feePerGame,
        totalGames: dto.totalGames ?? tournament.totalGames,
        feeType: dto.feeType ?? tournament.feeType,
        maxParticipants: dto.maxParticipants ?? tournament.maxParticipants,
        registrationDeadline: dto.registrationDeadline
          ? new Date(dto.registrationDeadline)
          : tournament.registrationDeadline,
        // [수정 2026-05-15 db-keeper] T03/H1 + T02/T04 협업 — ageGroup 명시 변경 보장.
        //  `nextAgeGroup` 변수로 birth year 정합성 (resolveBirthYear) 과 동기화.
        //  U8 → ALL 다운그레이드 시 birth year 도 함께 자동 클리어됨.
        ageGroup: nextAgeGroup,
        // [재설계 2026-06-16] selectedParticipantIds 는 명시 시에만 갱신 (생략 시 기존 유지).
        //   자격 SoT 이며, 위에서 eligibleBirthYears 를 이 명단 기준으로 파생 재계산했다.
        selectedParticipantIds: nextParticipantIds,
        // [재설계 2026-06-16] eligibleGroupIds 자격 의미 폐기 — 명단 전송 시 빈 배열로 클리어,
        //   미전송 시 기존값 보존(레거시 데이터 무변경).
        eligibleGroupIds:
          dto.selectedParticipantIds !== undefined
            ? []
            : ((tournament as { eligibleGroupIds?: unknown })
                .eligibleGroupIds ?? undefined),
        // [추가 2026-05-15 db-keeper] T03/H2 — 대회 정보 페이지 신규 필드.
        rules: dto.rules !== undefined ? dto.rules : tournament.rules,
        // 빈 문자열 전송 = 클리어(null) — 링크장 선택 전환 시 스테일 텍스트가 폴백 최우선으로
        //   새 링크장 이름을 가리는 것을 방지.
        location:
          dto.location !== undefined
            ? dto.location.trim() || null
            : tournament.location,
        prizeAmount:
          dto.prizeAmount !== undefined
            ? new Decimal(dto.prizeAmount)
            : tournament.prizeAmount,
        // 결제 모드 — 명시 시에만 갱신 (생략 시 기존 유지).
        billingMode: dto.billingMode ?? tournament.billingMode,
      },
    });

    return updated;
  }

  /**
   * 토너먼트 삭제
   */
  async deleteTournament(id: string, requester: JwtUserPayload) {
    // 주최 팀 관리자만 삭제 가능 (IDOR 가드)
    await this.resourceAccess.assertManageableTournament(id, requester);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    // [2026-06-22] 결제·정산 이력이 있는 대회는 삭제 차단 — 재무·기록 보존.
    //   실결제(paymentId 연결된 PAID) 또는 정산(GameExpense)이 있으면 삭제 불가.
    const paidCount = await this.prisma.tournamentRegistration.count({
      where: {
        tournamentId: id,
        paymentStatus: "PAID",
        paymentId: { not: null },
      },
    });
    const expenseCount = await this.prisma.gameExpense.count({
      where: { OR: [{ tournamentId: id }, { match: { tournamentId: id } }] },
    });
    if (paidCount > 0 || expenseCount > 0) {
      throw new BadRequestException(
        "결제 또는 정산 이력이 있는 대회는 삭제할 수 없습니다.",
      );
    }

    // [2026-06-15] 경기가 있어도 대회를 삭제할 수 있도록 연관 데이터를 트랜잭션으로 함께 삭제.
    //   FK 제약(Restrict)으로 막던 항목을 선삭제한다:
    //     · GameExpense (tournament/match 둘 다 Restrict) — 먼저 삭제
    //     · HockeyMatch (tournament Restrict) — periods/events 는 Cascade 자동 삭제
    //   나머지(TournamentRegistration=Cascade · PlayerAward/Video=SetNull · TournamentMatch=Cascade)는 자동 처리.
    await this.prisma.$transaction(async (tx) => {
      await tx.gameExpense.deleteMany({
        where: { OR: [{ tournamentId: id }, { match: { tournamentId: id } }] },
      });
      await tx.hockeyMatch.deleteMany({ where: { tournamentId: id } });
      await tx.tournamentRegistration.deleteMany({
        where: { tournamentId: id },
      });
      await tx.tournament.delete({ where: { id } });
    });

    return { id, deletedAt: new Date() };
  }

  // ==================== Match CRUD ====================

  /**
   * 매치 목록 조회
   */
  async getMatches(tournamentId?: string) {
    const where = tournamentId ? { tournamentId } : {};

    const matches = await this.prisma.hockeyMatch.findMany({
      where,
      select: {
        id: true,
        tournamentId: true,
        scheduledAt: true,
        startedAt: true,
        endedAt: true,
        homeScore: true,
        awayScore: true,
        status: true,
        currentPeriod: true,
        round: true,
        matchOrder: true,
        fee: true,
        opponentName: true,
        refereeMain: true,
        createdAt: true,
        tournament: {
          select: { id: true, name: true },
        },
        homeTeam: {
          select: { id: true, name: true },
        },
        awayTeam: {
          select: { id: true, name: true },
        },
        // Phase 2 (2026-04-29) — HockeyMatch.homeTeam/awayTeam relation 폐기
        homeTeamId: true,
        awayTeamId: true,
        rink: {
          select: { id: true, name: true },
        },
        venue: {
          select: { id: true, name: true },
        },
      },
      orderBy: {
        scheduledAt: "asc",
      },
    });

    return matches;
  }

  /**
   * 매치 상세 조회
   */
  async getMatchById(id: string) {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id },
      include: {
        tournament: {
          select: { id: true, name: true },
        },
        homeTeam: {
          select: { id: true, name: true },
        },
        awayTeam: {
          select: { id: true, name: true },
        },
        // Phase 2 (2026-04-29) — HockeyMatch.homeTeam/awayTeam relation 폐기. home_team_id/away_team_id 컬럼은 default include 됨.
        rink: {
          select: { id: true, name: true, location: true },
        },
        venue: {
          select: { id: true, name: true, address: true },
        },
        periods: {
          select: {
            id: true,
            periodNumber: true,
            startedAt: true,
            endedAt: true,
            homeScore: true,
            awayScore: true,
            homePenaltyMinutes: true,
            awayPenaltyMinutes: true,
          },
          orderBy: { periodNumber: "asc" },
        },
        events: {
          select: {
            id: true,
            periodNumber: true,
            eventTime: true,
            eventType: true,
            description: true,
            isGameWinner: true,
            isPowerPlay: true,
            isShortHanded: true,
            penaltyType: true,
            penaltyMinutes: true,
            // Phase 2 (2026-04-29) — TeamRoster/MatchEvent.player relation 폐기. ID만 노출
            playerId: true,
            assistPlayer1Id: true,
            assistPlayer2Id: true,
          },
          orderBy: [{ periodNumber: "asc" }, { eventTime: "asc" }],
        },
      },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    return match;
  }

  /**
   * 매치 생성
   */
  async createMatch(dto: CreateMatchDto, requester: JwtUserPayload) {
    // 토너먼트 존재 확인 (선택적)
    let tournamentTeamId: string | null = null;
    if (dto.tournamentId) {
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: dto.tournamentId },
        select: { id: true, teamId: true },
      });
      if (!tournament) {
        throw new NotFoundException("대회를 찾을 수 없습니다.");
      }
      tournamentTeamId = tournament.teamId;
    }
    // 생성 권한 — 대회 소속이면 주최 팀 관리자, 독립 경기면 home/away 팀 관리자 (IDOR 가드)
    await this.resourceAccess.assertManageableMatchRecord(
      {
        tournamentId: dto.tournamentId ?? null,
        tournament: { teamId: tournamentTeamId },
        homeTeamId: dto.homeTeamId ?? null,
        awayTeamId: dto.awayTeamId ?? null,
        homeClubId: dto.homeClubId ?? null,
        awayClubId: dto.awayClubId ?? null,
      },
      requester,
    );

    // 홈/어웨이 팀 동일 검증
    if (dto.homeTeamId && dto.awayTeamId && dto.homeTeamId === dto.awayTeamId) {
      throw new BadRequestException("홈 팀과 어웨이 팀은 서로 달라야 합니다.");
    }

    const match = await this.prisma.hockeyMatch.create({
      data: {
        tournamentId: dto.tournamentId,
        rinkId: dto.rinkId,
        venueId: dto.venueId,
        homeClubId: dto.homeClubId,
        awayClubId: dto.awayClubId,
        homeTeamId: dto.homeTeamId,
        awayTeamId: dto.awayTeamId,
        opponentName: dto.opponentName,
        // null = 대회 장소 폴백(참조) — 대회 장소 텍스트를 복사 저장하지 않는다.
        venueName: dto.venueName?.trim() || null,
        scheduledAt: new Date(dto.scheduledAt),
        round: dto.round,
        matchOrder: dto.matchOrder,
        fee: dto.fee != null ? new Decimal(dto.fee) : undefined,
        refereeMain: dto.refereeMain,
        refereeLines: dto.refereeLines,
      },
      // Phase 2 (2026-04-29) — HockeyMatch.homeTeam/awayTeam relation 폐기. homeTeamId/awayTeamId 만 응답
    });

    return match;
  }

  /**
   * 매치 수정
   */
  async updateMatch(
    id: string,
    dto: UpdateMatchDto,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(id, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    // 홈/어웨이 팀 동일 검증
    const homeTeamId = dto.homeTeamId ?? match.homeTeamId;
    const awayTeamId = dto.awayTeamId ?? match.awayTeamId;
    if (homeTeamId && awayTeamId && homeTeamId === awayTeamId) {
      throw new BadRequestException("홈 팀과 어웨이 팀은 서로 달라야 합니다.");
    }

    const updated = await this.prisma.hockeyMatch.update({
      where: { id },
      data: {
        rinkId: dto.rinkId ?? match.rinkId,
        venueId: dto.venueId ?? match.venueId,
        // 빈 문자열 전송 = 클리어(null → 대회 장소 폴백), 미전송 = 기존 유지.
        venueName:
          dto.venueName !== undefined
            ? dto.venueName.trim() || null
            : match.venueName,
        homeClubId: dto.homeClubId ?? match.homeClubId,
        awayClubId: dto.awayClubId ?? match.awayClubId,
        homeTeamId: dto.homeTeamId ?? match.homeTeamId,
        awayTeamId: dto.awayTeamId ?? match.awayTeamId,
        scheduledAt: dto.scheduledAt
          ? new Date(dto.scheduledAt)
          : match.scheduledAt,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : match.startedAt,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : match.endedAt,
        homeScore: dto.homeScore ?? match.homeScore,
        awayScore: dto.awayScore ?? match.awayScore,
        status: dto.status ?? match.status,
        currentPeriod: dto.currentPeriod ?? match.currentPeriod,
        round: dto.round ?? match.round,
        matchOrder: dto.matchOrder ?? match.matchOrder,
        fee: dto.fee != null ? new Decimal(dto.fee) : match.fee,
        refereeMain: dto.refereeMain ?? match.refereeMain,
        refereeLines: dto.refereeLines ?? match.refereeLines,
      },
      // Phase 2 (2026-04-29) — HockeyMatch.homeTeam/awayTeam relation 폐기. homeTeamId/awayTeamId 만 응답
    });

    return updated;
  }

  /**
   * 매치 삭제
   */
  async deleteMatch(id: string, requester: JwtUserPayload) {
    await this.resourceAccess.assertManageableMatch(id, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    // Cascade로 periods, events 자동 삭제
    await this.prisma.hockeyMatch.delete({
      where: { id },
    });

    return { id, deletedAt: new Date() };
  }

  // ==================== Match Participants (Teams) ====================

  /**
   * 매치 참가 팀 조회
   */
  async getMatchParticipants(matchId: string) {
    // Phase 2 (2026-04-29) — HockeyMatch.homeTeam/awayTeam relation 폐기.
    // roster 정보는 TeamGroupMember 단일화 후 별도 조회로 재구성 예정 (Phase 4).
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        homeTeamId: true,
        awayTeamId: true,
      },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    return {
      matchId: match.id,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
    };
  }

  /**
   * 매치에 팀 배정 (홈/어웨이)
   */
  async addMatchParticipant(
    matchId: string,
    teamId: string,
    side: "home" | "away",
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    // Phase 2 (2026-04-29) — Team 모델 폐기. teamId 는 clubs.id 를 가리킴
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new NotFoundException("팀을 찾을 수 없습니다.");
    }

    // 같은 팀이 이미 반대편에 배정되어 있는지 확인
    if (side === "home" && match.awayTeamId === teamId) {
      throw new BadRequestException("이미 어웨이 팀으로 배정된 팀입니다.");
    }
    if (side === "away" && match.homeTeamId === teamId) {
      throw new BadRequestException("이미 홈 팀으로 배정된 팀입니다.");
    }

    // Phase 2 (2026-04-29) — Team(=Club) 자체이므로 team.id 가 곧 club.id
    const data =
      side === "home"
        ? { homeTeamId: teamId, homeClubId: team.id }
        : { awayTeamId: teamId, awayClubId: team.id };

    const updated = await this.prisma.hockeyMatch.update({
      where: { id: matchId },
      data,
      // Phase 2 (2026-04-29) — HockeyMatch.homeTeam/awayTeam relation 폐기. homeTeamId/awayTeamId 만 응답
    });

    return updated;
  }

  // ==================== Tournament Registration ====================

  /**
   * 참가비 계산 (내부 헬퍼)
   */
  private calculateFee(
    feeType: string | null,
    feePerGame: Decimal | null,
    totalGames: number | null,
    gamesCount: number,
  ): Decimal {
    if (!feeType || !feePerGame) {
      return new Decimal(0);
    }
    if (feeType === "PER_GAME") {
      return feePerGame.mul(gamesCount);
    }
    // TOTAL_FIXED: 총 경기수에 비례 계산
    if (feeType === "TOTAL_FIXED" && totalGames && totalGames > 0) {
      return feePerGame.mul(totalGames);
    }
    return new Decimal(0);
  }

  private mapStudentTournamentStatus(
    status: string,
    startDate: Date,
    endDate: Date,
    registrationDeadline: Date | null,
    currentParticipants: number,
    maxParticipants: number | null,
    now: Date,
  ) {
    if (status === "finished" || endDate < now) {
      return "COMPLETED";
    }

    if (status === "ongoing" || (startDate <= now && endDate >= now)) {
      return "IN_PROGRESS";
    }

    if (
      status === "cancelled" ||
      (registrationDeadline && registrationDeadline < now) ||
      (maxParticipants && currentParticipants >= maxParticipants)
    ) {
      return "CLOSED";
    }

    if (registrationDeadline) {
      return "OPEN";
    }

    return "UPCOMING";
  }

  private buildTournamentAgeGroupLabel(
    eligibleBirthYearFrom?: number | null,
    eligibleBirthYearTo?: number | null,
    eligibleBirthYears?: number[] | null,
  ) {
    // 이중지원: 개별 연도 배열이 있으면 "2014·2016·2019년생" 으로 표기.
    const years = Array.isArray(eligibleBirthYears) ? eligibleBirthYears : [];
    if (years.length > 0) {
      const sorted = [...years].sort((a, b) => a - b);
      return `${sorted.join("·")}년생`;
    }

    if (eligibleBirthYearFrom && eligibleBirthYearTo) {
      return `${eligibleBirthYearFrom}-${eligibleBirthYearTo}년생`;
    }

    if (eligibleBirthYearFrom) {
      return `${eligibleBirthYearFrom}년 이후 출생`;
    }

    if (eligibleBirthYearTo) {
      return `${eligibleBirthYearTo}년 이전 출생`;
    }

    return "전체";
  }

  /**
   * 참가비 미리보기 (비용 계산 결과 반환)
   */
  async getFeePreview(tournamentId: string, gamesCount: number) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        feeType: true,
        feePerGame: true,
        totalGames: true,
        eligibleBirthYearFrom: true,
        eligibleBirthYearTo: true,
        eligibleBirthYears: true,
        registrationDeadline: true,
        maxParticipants: true,
        _count: { select: { registrations: true } },
      },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    const calculatedFee = this.calculateFee(
      tournament.feeType,
      tournament.feePerGame,
      tournament.totalGames,
      gamesCount,
    );

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      gamesCount,
      feeType: tournament.feeType,
      feePerGame: tournament.feePerGame,
      totalGames: tournament.totalGames,
      calculatedFee,
      currentParticipants: tournament._count.registrations,
      maxParticipants: tournament.maxParticipants,
      registrationDeadline: tournament.registrationDeadline,
    };
  }

  /**
   * 연도 자격 해당 선수 목록 조회
   */
  async getEligiblePlayers(
    tournamentId: string,
    requester: JwtUserPayload,
  ) {
    // 선수 이름·보호자 정보가 담기는 응답 — 주최 팀 관리자만 조회 가능 (IDOR 가드)
    await this.resourceAccess.assertManageableTournament(tournamentId, requester);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        eligibleBirthYearFrom: true,
        eligibleBirthYearTo: true,
        eligibleBirthYears: true,
      },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    const birthYears = Array.isArray(tournament.eligibleBirthYears)
      ? tournament.eligibleBirthYears
      : [];
    const hasBirthYears = birthYears.length > 0;

    if (
      !hasBirthYears &&
      !tournament.eligibleBirthYearFrom &&
      !tournament.eligibleBirthYearTo
    ) {
      return {
        tournamentId,
        eligiblePlayers: [],
        message: "자격 필터 없음 (전체 참가 가능)",
      };
    }

    // birthDate 자격 필터 — 이중지원:
    //  · 배열 있으면 해당 연도들만 정확 매칭(연도별 1년 범위 OR).
    //  · 비면 기존 from/to 단일 범위(gte~lte).
    //  연도 수가 적어 OR 비용은 무시 가능.
    // birthDate(@db.Date) 연도 경계 = UTC 자정 반개구간 [gte, lt) — §규약 "경계 필터=UTC 자정" 정렬.
    const yearRange = (y: number) => ({
      gte: new Date(`${y}-01-01T00:00:00Z`),
      lt: new Date(`${y + 1}-01-01T00:00:00Z`),
    });

    let birthDateFilter: {
      gte?: Date;
      lte?: Date;
      OR?: Array<{ gte: Date; lt: Date }>;
    };
    if (hasBirthYears) {
      birthDateFilter = { OR: birthYears.map(yearRange) };
    } else {
      const range: { gte?: Date; lte?: Date } = {};
      if (tournament.eligibleBirthYearFrom) {
        range.gte = new Date(`${tournament.eligibleBirthYearFrom}-01-01`);
      }
      if (tournament.eligibleBirthYearTo) {
        range.lte = new Date(`${tournament.eligibleBirthYearTo}-12-31`);
      }
      birthDateFilter = range;
    }

    // ChildProfile의 birthDate 기준으로 자격 필터링
    const eligibleChildren = await this.prisma.user.findMany({
      where: {
        childProfile: {
          birthDate: birthDateFilter,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        childProfile: {
          select: {
            birthDate: true,
          },
        },
        parentChildren: {
          select: {
            parent: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    // TEEN/ADULT: birthDate가 User에 직접 저장된 경우도 포함
    const eligibleUsersWithBirthDate = await this.prisma.user.findMany({
      where: {
        childProfile: null, // childProfile 없는 사용자 (TEEN, PARENT 등)
        birthDate: birthDateFilter,
      },
      select: {
        id: true,
        email: true,
        birthDate: true,
      },
    });

    // 나이는 birthDate 에서 항상 최신값으로 계산 (User.koreanAge 캐시 신뢰 X)
    const eligibleUsersWithAge = eligibleUsersWithBirthDate.map((u) => ({
      ...u,
      koreanAge: calculateKoreanAgeSafe(u.birthDate),
    }));

    return {
      tournamentId,
      eligibleBirthYearFrom: tournament.eligibleBirthYearFrom,
      eligibleBirthYearTo: tournament.eligibleBirthYearTo,
      eligibleBirthYears: birthYears,
      eligibleChildren,
      eligibleUsers: eligibleUsersWithAge,
      totalEligible: eligibleChildren.length + eligibleUsersWithAge.length,
    };
  }

  /**
   * 참가 신청 가능 검증 — 첫 경기 시작 후에는 신청 마감.
   *  경기 미등록 대회는 종료일(@db.Date, day-level) 경과 시 차단 폴백.
   */
  private async assertTournamentRegistrationOpen(
    tournamentId: string,
    endDate: Date | null,
  ): Promise<void> {
    const firstMatch = await this.prisma.hockeyMatch.aggregate({
      where: { tournamentId },
      _min: { scheduledAt: true },
    });
    const firstStart = firstMatch._min.scheduledAt;
    if (firstStart != null) {
      if (firstStart.getTime() <= Date.now()) {
        throw new BadRequestException(
          "대회가 시작되어 참가 신청할 수 없습니다.",
        );
      }
      return;
    }
    if (endDate != null && endDate < kstTodayUtcMidnight()) {
      throw new BadRequestException(
        "이미 종료된 대회는 참가 신청할 수 없습니다.",
      );
    }
  }

  /**
   * 대회 참가 등록
   */
  async registerTournament(
    tournamentId: string,
    userId: string,
    dto: RegisterTournamentDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      // include 사용 시 모델의 모든 스칼라(feeType/feePerGame/billingMode 등)가
      //   자동 반환되므로 후불 분기에 필요한 billingMode 도 포함된다.
      include: {
        _count: { select: { registrations: true } },
      },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    // 0. 신청 가능 검증 — status(cancelled/finished) 종료 차단 + 첫 경기 시작 후 신청 마감.
    //   선불 initiateTournamentPayment 와 동일 기준. 후불 대회는 마감일이 대개 없어(null)
    //   이 가드가 유일한 차단 — /apply 직접 접근으로 종료 대회 신청되던 갭 방지.
    if (
      tournament.status === "cancelled" ||
      tournament.status === "finished"
    ) {
      throw new BadRequestException("이미 종료된 대회는 참가 신청할 수 없습니다.");
    }
    await this.assertTournamentRegistrationOpen(
      tournamentId,
      tournament.endDate,
    );

    // 1. 등록 마감일 검증
    if (
      tournament.registrationDeadline &&
      new Date() > tournament.registrationDeadline
    ) {
      throw new BadRequestException("대회 등록 마감일이 지났습니다.");
    }

    // 2. 최대 참가 인원 검증
    if (
      tournament.maxParticipants &&
      tournament._count.registrations >= tournament.maxParticipants
    ) {
      throw new BadRequestException("대회 참가 인원이 마감되었습니다.");
    }

    // 3. 참가 자격 검증 — selectedParticipantIds(선수 명단 스냅샷) 단독 SoT.
    //    [재설계 2026-06-16] 출생연도(eligibleBirthYears·from/to) 게이트 제거.
    //      대회 생성/수정 시 감독이 고른 선수 User.id 명단이 자격의 단일 기준이다.
    //      명단에 (dto.childId ?? userId) 가 있으면 통과, 없으면 400.
    //    회귀: 명단이 비어있는 레거시 대회(명단 SoT 도입 전 생성)는 폴백으로
    //      기존 출생연도 게이트를 그대로 적용한다(과도기 — 신규는 항상 명단 전송).
    const targetUserId = dto.childId ?? userId;
    const participantList = Array.isArray(tournament.selectedParticipantIds)
      ? (tournament.selectedParticipantIds as unknown as string[])
      : [];

    if (participantList.length > 0) {
      // 명단 SoT — 출생연도 무관, 명단 포함 여부만 검증.
      if (!participantList.includes(targetUserId)) {
        throw new BadRequestException("이 대회 참가 대상이 아닙니다.");
      }
    } else {
      // 레거시 폴백 — 명단이 비어있을 때만 기존 출생연도 게이트 유지.
      const eligibleBirthYears = Array.isArray(tournament.eligibleBirthYears)
        ? tournament.eligibleBirthYears
        : [];
      const hasEligibleBirthYears = eligibleBirthYears.length > 0;
      if (
        hasEligibleBirthYears ||
        tournament.eligibleBirthYearFrom ||
        tournament.eligibleBirthYearTo
      ) {
        const targetUser = await this.prisma.user.findUnique({
          where: { id: targetUserId },
          select: {
            birthDate: true,
            childProfile: { select: { birthDate: true } },
          },
        });

        if (!targetUser) {
          throw new NotFoundException("선수를 찾을 수 없습니다.");
        }

        const birthDate =
          targetUser.childProfile?.birthDate ?? targetUser.birthDate;

        if (!birthDate) {
          throw new BadRequestException(
            "참가 자격 확인을 위한 생년월일 정보가 없습니다.",
          );
        }

        // birthDate 는 `@db.Date`(UTC 자정) — 출생연도는 getUTCFullYear.
        const birthYear = birthDate.getUTCFullYear();

        if (hasEligibleBirthYears) {
          // 개별 연도 집합 — 정확 매칭. 미포함 시 허용 연도 나열.
          if (!eligibleBirthYears.includes(birthYear)) {
            const label = [...eligibleBirthYears]
              .sort((a, b) => a - b)
              .join("·");
            throw new BadRequestException(
              `${label}년생만 참가 가능합니다. (현재: ${birthYear}년생)`,
            );
          }
        } else {
          if (
            tournament.eligibleBirthYearFrom &&
            birthYear < tournament.eligibleBirthYearFrom
          ) {
            throw new BadRequestException(
              `${tournament.eligibleBirthYearFrom}년 이후 출생자만 참가 가능합니다. (현재: ${birthYear}년생)`,
            );
          }
          if (
            tournament.eligibleBirthYearTo &&
            birthYear > tournament.eligibleBirthYearTo
          ) {
            throw new BadRequestException(
              `${tournament.eligibleBirthYearTo}년 이전 출생자만 참가 가능합니다. (현재: ${birthYear}년생)`,
            );
          }
        }
      }
    }

    // 4. 중복 등록 확인 (nullable childId는 findFirst 사용)
    const existingReg = await this.prisma.tournamentRegistration.findFirst({
      where: {
        tournamentId,
        userId,
        childId: dto.childId ?? null,
      },
    });

    if (existingReg && existingReg.paymentStatus !== "CANCELLED") {
      throw new ConflictException("이미 등록된 대회입니다.");
    }

    // 5. 참가비 계산 + 초기 결제 상태 결정
    //  · POSTPAID(후불): 신청 시점엔 금액 미확정 → calculateFee 미사용, calculatedFee=0,
    //    paymentStatus='UNPAID'(정산 전) 명시. 종료 후 confirmTournamentSettlement 에서
    //    감독이 1인당 금액 입력 시 PENDING 으로 전환되며 청구된다.
    //    (calculatedFee=0 이라도 아래 무료 대회 자동 PAID 분기를 타지 않도록 별도 처리.)
    //  · PREPAID(선불): 기존 로직 — 무료(0)면 즉시 PAID, 유료면 PENDING 후 PG 결제 시 PAID.
    const isPostpaid = tournament.billingMode === "POSTPAID";

    const calculatedFee = isPostpaid
      ? new Decimal(0)
      : this.calculateFee(
          tournament.feeType,
          tournament.feePerGame,
          tournament.totalGames,
          dto.gamesCount,
        );

    // [수정 2026-05-15] 무료 대회(참가비 0 또는 미설정) 는 즉시 PAID 로 자동 처리.
    //  유료 대회는 PENDING 으로 등록 후 결제 페이지에서 PG 결제 완료 시 PAID 갱신.
    //  · 수업 enrollment 와 동일한 결제 로직 — 학부모가 결제해야만 일정표에 노출.
    //  · [후불] UNPAID 로 고정 — 정산(청구) 전 상태이며 자동 PAID 마킹 대상이 아니다.
    const initialStatus = isPostpaid
      ? "UNPAID"
      : Number(calculatedFee) <= 0
        ? "PAID"
        : "PENDING";

    // [후불] 일정 수와 무관한 단일 금액 청구이므로 gamesCount=1 고정(설계 §2.2).
    //   PREPAID 는 기존대로 신청 경기 수(dto.gamesCount)를 그대로 저장한다.
    const resolvedGamesCount = isPostpaid ? 1 : dto.gamesCount;

    // 6. 등록 생성 (기존 취소된 경우 재등록)
    if (existingReg) {
      const updated = await this.prisma.tournamentRegistration.update({
        where: { id: existingReg.id },
        data: {
          gamesCount: resolvedGamesCount,
          calculatedFee,
          paymentStatus: initialStatus,
          cancelledAt: null,
        },
      });
      return updated;
    }

    const registration = await this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        userId,
        childId: dto.childId,
        gamesCount: resolvedGamesCount,
        calculatedFee,
        paymentStatus: initialStatus,
      },
      include: {
        tournament: { select: { id: true, name: true, startDate: true } },
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return registration;
  }

  /**
   * [후불 대회 정산 확정] — 감독/코치가 종료된 후불 대회의 1인당 금액을 입력해
   *   참가자 전원에게 동일 금액을 일괄 청구한다.
   *
   *  · 대상: paymentStatus ∈ {UNPAID, PENDING} (취소·환불·이미 결제(PAID)는 제외).
   *  · 멱등: Payment.orderNumber = `TRN-POSTPAID-{tournamentId}-{registrationId}` upsert →
   *    재정산 시 동일 참가자에게 중복 Payment 가 생기지 않는다(금액만 갱신).
   *  · 재정산 가드: 이미 PAID 인 참가자는 조회 대상에서 제외되므로 금액이 변경되지 않는다.
   *  · 결제자(payer): 자녀의 주 보호자(ParentChild.isPrimary=true), 없으면 본인(userId) 폴백.
   *    (수업 후불 postpaid-settlement.service.ts 의 결제자 해석 패턴과 동일.)
   *  · 알림: 트랜잭션 밖 best-effort 발송(실패해도 정산 롤백하지 않음).
   */
  async confirmTournamentSettlement(
    tournamentId: string,
    feePerPerson: number,
    // 청구 대상 등록 ID 목록 — 미전송/빈 배열이면 미결제 참가자 전원(하위호환).
    //   선택 청구: 감독이 참가선수목록에서 고른 선수에게만 결제 요청.
    registrationIds: string[] | undefined,
    // 정산 수행자 — 주최 팀 관리 권한 검증에 사용. 감사 기록 컬럼은 별도 미도입(설계상 신규 컬럼 0).
    requester: JwtUserPayload,
  ) {
    // 서버측 금액 검증 — 클라이언트 금액 불신.
    if (!Number.isFinite(feePerPerson) || feePerPerson <= 0) {
      throw new BadRequestException("1인당 참가비는 1원 이상이어야 합니다.");
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        billingMode: true,
        status: true,
        endDate: true,
        teamId: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }
    // 참가자 전원에게 실제 청구(pending Payment+알림)를 만드는 쓰기 경로 — 주최 팀 관리자만 확정 가능 (IDOR 가드)
    await this.resourceAccess.assertManageableTournamentRecord(
      tournament,
      requester,
    );
    if (tournament.billingMode !== "POSTPAID") {
      throw new BadRequestException("후불(POSTPAID) 대회만 정산할 수 있습니다.");
    }
    if (tournament.status === "cancelled") {
      throw new BadRequestException("취소된 대회는 정산할 수 없습니다.");
    }
    // 종료 판정 — status='finished' 또는 '마지막 경기 시작 +1시간' 경과.
    //   status 가 자동으로 finished 로 전이되지 않으므로 시각 기준도 함께 인정한다.
    //   프론트 대회 상세의 결제요청 버튼 isEnded 와 동일 기준.
    if (tournament.status !== "finished") {
      const lastMatch = await this.prisma.hockeyMatch.aggregate({
        where: { tournamentId },
        _max: { scheduledAt: true },
      });
      const lastStart = lastMatch._max.scheduledAt;
      // 경기 미등록 폴백 — endDate 는 `@db.Date`(UTC 자정)라 day-level 판정(다음날부터 종료).
      const ended =
        lastStart != null
          ? lastStart.getTime() + SETTLE_OPEN_DELAY_MS <= Date.now()
          : tournament.endDate != null &&
            tournament.endDate < kstTodayUtcMidnight();
      if (!ended) {
        throw new BadRequestException(
          "마지막 경기 시작 1시간 후 정산 가능합니다.",
        );
      }
    }

    // 청구 대상 — 미결제(UNPAID/PENDING)만. CANCELLED·REFUNDED·PAID 제외.
    //   registrationIds 전달 시 그중 미결제 건만 청구(선택 청구). 미전송이면 전원.
    const hasSelection = Array.isArray(registrationIds) && registrationIds.length > 0;
    const targets = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        paymentStatus: { in: ["UNPAID", "PENDING"] },
        ...(hasSelection ? { id: { in: registrationIds } } : {}),
      },
      // paymentStatus·calculatedFee — 알림 분기(신규 청구/금액 변경/동일 금액 생략)용.
      select: {
        id: true,
        userId: true,
        childId: true,
        paymentStatus: true,
        calculatedFee: true,
      },
    });

    if (targets.length === 0) {
      throw new BadRequestException("청구할 참가자가 없습니다.");
    }

    // 결제자 해석 — 자녀(childId)가 있으면 주 보호자, 없으면 신청자(userId).
    const childIds = targets
      .map((t) => t.childId)
      .filter((c): c is string => !!c);
    const parentLinks = childIds.length
      ? await this.prisma.parentChild.findMany({
          where: { childId: { in: childIds }, isPrimary: true },
          select: { childId: true, parentId: true },
        })
      : [];
    const primaryParentOf = new Map<string, string>();
    for (const pl of parentLinks) {
      primaryParentOf.set(pl.childId, pl.parentId);
    }
    const resolvePayer = (reg: {
      userId: string;
      childId: string | null;
    }): string =>
      (reg.childId ? primaryParentOf.get(reg.childId) : undefined) ??
      reg.userId;

    // 정산 트랜잭션 — 대회 단가 기록 + 참가자별 Payment(pending) upsert + 상태 전환.
    const fee = new Decimal(feePerPerson);
    const billed = await this.prisma.$transaction(async (tx) => {
      // 1. 대회 단위 1인당 금액 보관 (feePerGame + TOTAL_FIXED = 고정 총액 의미).
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { feePerGame: fee, feeType: "TOTAL_FIXED" },
      });

      const results: {
        registrationId: string;
        payerId: string;
        priorStatus: string;
        priorFee: number;
      }[] = [];
      for (const reg of targets) {
        const payerId = resolvePayer(reg);
        const orderNumber = `TRN-POSTPAID-${tournamentId}-${reg.id}`;

        // 2. 결제 행 upsert (멱등) — 갱신은 아래 조건부 updateMany 로만 수행.
        const payment = await tx.payment.upsert({
          where: { orderNumber },
          update: {},
          create: {
            orderNumber,
            userId: payerId,
            productId: null,
            amount: feePerPerson,
            paymentStatus: "pending",
            paymentMethod: "toss",
          },
          select: { id: true },
        });

        // 동시 결제 방어 — 대상 조회~커밋 사이 결제 완료(completed)된 건은 되돌리지
        //   않고 건너뛴다. userId 도 갱신해 주 보호자 변경 시 결제 권한 불일치 방지.
        const payUpd = await tx.payment.updateMany({
          where: { id: payment.id, paymentStatus: { not: "completed" } },
          data: {
            amount: feePerPerson,
            paymentStatus: "pending",
            userId: payerId,
          },
        });
        if (payUpd.count === 0) continue;

        // 3. 참가자 확정 청구액·상태·결제 연결 — 미결제 상태일 때만(동시 PAID 방어).
        const regUpd = await tx.tournamentRegistration.updateMany({
          where: { id: reg.id, paymentStatus: { in: ["UNPAID", "PENDING"] } },
          data: {
            calculatedFee: fee,
            paymentStatus: "PENDING",
            paymentId: payment.id,
          },
        });
        if (regUpd.count === 0) continue;

        results.push({
          registrationId: reg.id,
          payerId,
          priorStatus: reg.paymentStatus,
          priorFee: reg.calculatedFee != null ? Number(reg.calculatedFee) : 0,
        });
      }

      return results;
    });

    // 결제요청 알림 (트랜잭션 밖 — 실패해도 정산 롤백 없음).
    //   신규(UNPAID→PENDING) = 결제 요청 / 재청구 금액 변경 = 변경 안내 /
    //   동일 금액 재확정 = 발송 생략(중복 알림 방지).
    for (const b of billed) {
      const isNew = b.priorStatus === "UNPAID";
      const isChanged = !isNew && b.priorFee !== feePerPerson;
      if (!isNew && !isChanged) continue;
      const orderNumber = `TRN-POSTPAID-${tournamentId}-${b.registrationId}`;
      const link = `/payment/postpaid?orderNumber=${encodeURIComponent(
        orderNumber,
      )}&amount=${feePerPerson}&name=${encodeURIComponent(
        `${tournament.name} 참가비`,
      )}`;
      try {
        await this.notificationsService.createNotification({
          userId: b.payerId,
          notificationType: "tournament_postpaid_billing",
          title: isNew ? "대회 참가비 결제 요청" : "대회 참가비 금액 변경",
          message: isNew
            ? `${tournament.name} 참가비 ${feePerPerson.toLocaleString()}원 결제를 진행해주세요.`
            : `${tournament.name} 참가비가 ${feePerPerson.toLocaleString()}원으로 변경되었습니다. 결제를 진행해주세요.`,
          linkUrl: link,
        });
      } catch (e) {
        // 알림 실패는 정산 결과에 영향을 주지 않는다.
        void e;
      }
    }

    return {
      tournamentId,
      billedCount: billed.length,
      feePerPerson,
      totalAmount: feePerPerson * billed.length,
    };
  }

  /**
   * [2026-06-17 결제요청 취소] — 후불 정산(결제요청)으로 청구한 미결제 건을 되돌린다.
   *  · 대상: paymentStatus='PENDING' 이고 연결 Payment 가 미결제(pending)인 참가자.
   *    (이미 결제(PAID)·결제완료(completed) 건은 환원 불가 — 제외.)
   *  · 동작: registration → UNPAID(calculatedFee=0, paymentId 해제), Payment → cancelled.
   *    멱등(재정산 시 동일 orderNumber upsert 가 update 로 재사용).
   */
  async cancelTournamentSettlement(
    tournamentId: string,
    requester: JwtUserPayload,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, name: true, billingMode: true, teamId: true },
    });
    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }
    // 발행된 결제요청을 회수하는 쓰기 경로 — 주최 팀 관리자만 취소 가능 (IDOR 가드)
    await this.resourceAccess.assertManageableTournamentRecord(
      tournament,
      requester,
    );
    if (tournament.billingMode !== "POSTPAID") {
      throw new BadRequestException(
        "후불(POSTPAID) 대회만 결제요청을 취소할 수 있습니다.",
      );
    }

    // 환원 대상 — PENDING + 연결 Payment 가 미결제(pending). 결제완료 건은 제외.
    const targets = await this.prisma.tournamentRegistration.findMany({
      where: {
        tournamentId,
        paymentStatus: "PENDING",
        payment: { is: { paymentStatus: "pending" } },
      },
      select: { id: true, userId: true, childId: true, paymentId: true },
    });

    if (targets.length === 0) {
      throw new BadRequestException("취소할 결제요청이 없습니다.");
    }

    await this.prisma.$transaction(async (tx) => {
      for (const reg of targets) {
        // 1. 참가자 상태 환원 — UNPAID(정산 전), 금액·결제 연결 해제.
        await tx.tournamentRegistration.update({
          where: { id: reg.id },
          data: {
            paymentStatus: "UNPAID",
            calculatedFee: new Decimal(0),
            paymentId: null,
          },
        });
        // 2. 결제행 취소 표시(이력 보존 · 재정산 시 동일 orderNumber upsert 재사용).
        if (reg.paymentId) {
          await tx.payment.update({
            where: { id: reg.paymentId },
            data: { paymentStatus: "cancelled" },
          });
        }
      }
    });

    // 결제요청 취소 알림 (트랜잭션 밖 — best-effort).
    const childIds = targets
      .map((t) => t.childId)
      .filter((c): c is string => !!c);
    const parentLinks = childIds.length
      ? await this.prisma.parentChild.findMany({
          where: { childId: { in: childIds }, isPrimary: true },
          select: { childId: true, parentId: true },
        })
      : [];
    const primaryParentOf = new Map<string, string>();
    for (const pl of parentLinks) {
      primaryParentOf.set(pl.childId, pl.parentId);
    }
    const payerIds = Array.from(
      new Set(
        targets.map((t) =>
          t.childId ? (primaryParentOf.get(t.childId) ?? t.userId) : t.userId,
        ),
      ),
    );
    for (const payerId of payerIds) {
      try {
        await this.notificationsService.createNotification({
          userId: payerId,
          notificationType: "tournament_postpaid_billing",
          title: "대회 참가비 결제 요청 취소",
          message: `${tournament.name} 참가비 결제 요청이 취소되었습니다.`,
          linkUrl: `/tournaments/${tournamentId}`,
        });
      } catch (e) {
        void e;
      }
    }

    return { tournamentId, revertedCount: targets.length };
  }

  /**
   * 대회 참가자 목록 조회
   */
  async getTournamentRegistrations(
    tournamentId: string,
    requester: JwtUserPayload,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }
    // 참가자 이름·자녀 생년월일·결제상태·금액이 담기는 응답 — 주최 팀 관리자만 조회 가능 (IDOR 가드)
    await this.resourceAccess.assertManageableTournamentRecord(
      tournament,
      requester,
    );

    // 명단 보존 — CANCELLED/REFUNDED 포함 전 상태 로드(§2-3.1). 파생 billingStatus 로 상태 구분.
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      select: {
        id: true,
        userId: true,
        childId: true,
        gamesCount: true,
        calculatedFee: true,
        paymentStatus: true,
        registeredAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            childProfile: {
              select: { birthDate: true },
            },
          },
        },
        payment: {
          select: {
            id: true,
            orderNumber: true,
            paymentStatus: true,
            amount: true,
            completedAt: true,
            createdAt: true,
            refundLogs: { select: { refundAmount: true } },
          },
        },
      },
      orderBy: { registeredAt: "asc" },
    });

    // 대회는 단일 결제방식(billingMode) 상속 — BOTH·UNASSIGNED 없음(SPEC §82).
    const billingTiming: "PREPAID" | "POSTPAID" =
      tournament.billingMode === "POSTPAID" ? "POSTPAID" : "PREPAID";

    // 팀 허브(computeTournamentSummaries)와 동일한 순수함수로 5-state·금액 파생 → 계약 단일 SoT.
    // Dual Emit: 레거시 필드(paymentStatus/orderNumber/amount 등) 전부 보존 + 파생 필드 추가.
    const enrichedRegistrations = registrations.map((reg) => {
      const att = resolveTournamentAttribution({
        registrationPaymentStatus: reg.paymentStatus,
        amount: Number(reg.calculatedFee),
        endDate: tournament.endDate,
        payment: reg.payment,
        tournamentBillingMode: tournament.billingMode,
      });
      return {
        ...reg,
        billingStatus: att.billingStatus,
        billingTiming,
        billedAmount: att.billedAmount,
        paidAmount: att.paidAmount,
        refundedAmount: att.refundedAmount,
        estimatedAmount: att.estimatedAmount,
        paidAt:
          att.billingStatus === "PAID"
            ? reg.payment?.completedAt ?? null
            : null,
      };
    });

    return {
      tournamentId,
      total: enrichedRegistrations.length,
      billingMode: tournament.billingMode,
      registrations: enrichedRegistrations,
    };
  }

  /**
   * 대회 참가 취소
   */
  async cancelRegistration(
    tournamentId: string,
    registrationId: string,
    userId: string,
  ) {
    const registration = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
      include: { tournament: { select: { startDate: true } } },
    });

    if (!registration) {
      throw new NotFoundException("등록 정보를 찾을 수 없습니다.");
    }

    if (registration.tournamentId !== tournamentId) {
      throw new BadRequestException("대회 ID가 일치하지 않습니다.");
    }

    // 본인(결제자)의 등록만 취소 가능
    if (registration.userId !== userId) {
      throw new BadRequestException("본인의 등록만 취소할 수 있습니다.");
    }

    if (registration.paymentStatus === "CANCELLED") {
      throw new BadRequestException("이미 취소된 등록입니다.");
    }

    // 대회 시작일 당일부터 취소 불가 — startDate(@db.Date UTC자정)가 오늘(KST) 이하면 차단.
    //   day-level: 시작일 당일부터 불가, 전날(D-1)까지 가능. (프론트 canCancelTournamentRegistration 과 동일 기준)
    if (
      registration.tournament?.startDate != null &&
      registration.tournament.startDate <= kstTodayUtcMidnight()
    ) {
      throw new BadRequestException(
        "대회 당일부터는 참가를 취소할 수 없습니다.",
      );
    }

    // [2026-06-15] 결제 완료(PAID) 건도 취소(환불) 가능하도록 허용.
    //   결제가 있으면 Payment 를 refunded 로 전환하고 등록을 CANCELLED 처리한다.
    //   (실제 PG 환불 연동은 운영 키 적용 시 별도 — 현재는 상태 전환으로 노출/집계에서 제외)
    const wasPaid = registration.paymentStatus === "PAID";
    await this.prisma.$transaction(async (tx) => {
      if (wasPaid && registration.paymentId) {
        await tx.payment.update({
          where: { id: registration.paymentId },
          data: { paymentStatus: "refunded" },
        });
      }
      await tx.tournamentRegistration.update({
        where: { id: registrationId },
        data: {
          paymentStatus: "CANCELLED",
          cancelledAt: new Date(),
        },
      });
    });

    return { id: registrationId, cancelledAt: new Date(), refunded: wasPaid };
  }

  // ==================== Tournament Status & Summary ====================

  /**
   * 대회 상태 변경 (유효한 전환만 허용)
   */
  async changeTournamentStatus(
    id: string,
    newStatus: string,
    requester: JwtUserPayload,
  ) {
    // 주최 팀 관리자만 상태 변경 가능 (IDOR 가드)
    await this.resourceAccess.assertManageableTournament(id, requester);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    const validTransitions: Record<string, string[]> = {
      scheduled: ["ongoing", "cancelled"],
      ongoing: ["finished", "cancelled"],
      finished: [], // 완료 후 변경 불가
      cancelled: ["scheduled"], // 취소 후 재등록만 가능
    };

    const allowed = validTransitions[tournament.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `'${tournament.status}' 상태에서 '${newStatus}' 상태로 변경할 수 없습니다.`,
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: newStatus },
    });

    return updated;
  }

  /**
   * 대회 요약 통계
   */
  async getTournamentSummary(id: string, requester: JwtUserPayload) {
    // 참가자 수·결제 현황이 담기는 관리자용 요약 — 주최 팀 관리자만 조회 가능 (IDOR 가드)
    await this.resourceAccess.assertManageableTournament(id, requester);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        maxParticipants: true,
        totalGames: true,
        feePerGame: true,
        feeType: true,
        registrations: {
          select: {
            id: true,
            paymentStatus: true,
            calculatedFee: true,
            gamesCount: true,
          },
        },
        matches: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new NotFoundException("대회를 찾을 수 없습니다.");
    }

    // 유효 참가자 — 취소 제외(후불 신청 전 상태 UNPAID 도 유효 참가자로 집계됨).
    const activeRegistrations = tournament.registrations.filter(
      (r) => r.paymentStatus !== "CANCELLED",
    );
    // 매출 집계 — 결제 완료(PAID)만. UNPAID(후불 정산 전)·PENDING 은 미수금이라 제외.
    const paidRegistrations = activeRegistrations.filter(
      (r) => r.paymentStatus === "PAID",
    );
    const pendingRegistrations = activeRegistrations.filter(
      (r) => r.paymentStatus === "PENDING",
    );
    const cancelledRegistrations = tournament.registrations.filter(
      (r) => r.paymentStatus === "CANCELLED",
    );

    const totalRevenue = paidRegistrations.reduce(
      (sum, r) => sum + Number(r.calculatedFee),
      0,
    );

    const completedMatches = tournament.matches.filter(
      (m) => m.status === "completed",
    );
    const scheduledMatches = tournament.matches.filter(
      (m) => m.status === "scheduled",
    );

    return {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      status: tournament.status,
      dateRange: {
        start: tournament.startDate,
        end: tournament.endDate,
      },
      participants: {
        total: activeRegistrations.length,
        paid: paidRegistrations.length,
        pending: pendingRegistrations.length,
        cancelled: cancelledRegistrations.length,
        max: tournament.maxParticipants,
      },
      matches: {
        total: tournament.matches.length,
        completed: completedMatches.length,
        scheduled: scheduledMatches.length,
        progressPercent:
          tournament.matches.length > 0
            ? Math.round(
                (completedMatches.length / tournament.matches.length) * 100,
              )
            : 0,
      },
      revenue: {
        total: totalRevenue,
        feePerGame: tournament.feePerGame
          ? Number(tournament.feePerGame)
          : null,
        feeType: tournament.feeType,
      },
    };
  }

  // ==================== Player Tournament Stats ====================

  /**
   * 선수별 대회 참가 이력 + 통계 조회
   * memberId: ClubMember ID
   */
  async getPlayerTournamentStats(memberId: string) {
    // Phase 2 (2026-04-29) — TeamRoster 폐기, MatchEvent.player 관계 폐기.
    // 선수별 대회 통계는 TeamGroupMember + MatchEvent ID 기반으로 Phase 4 통합 시점에 재작성 예정.
    return {
      player: { memberId, playerName: "", playerLevel: null as string | null },
      totalStats: {
        goals: 0,
        assists: 0,
        points: 0,
        penalties: 0,
        penaltyMinutes: 0,
        gamesPlayed: 0,
      },
      tournaments: [] as Array<unknown>,
      _phase2Placeholder: "재작성 예정 — Phase 4 통합 시점",
    };
  }

  /**
   * 매치에서 팀 제거
   */
  async removeMatchParticipant(
    matchId: string,
    teamId: string,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    const data: any = {};
    if (match.homeTeamId === teamId) {
      data.homeTeamId = null;
      data.homeClubId = null;
    } else if (match.awayTeamId === teamId) {
      data.awayTeamId = null;
      data.awayClubId = null;
    } else {
      throw new BadRequestException(
        "해당 팀은 이 경기에 배정되어 있지 않습니다.",
      );
    }

    const updated = await this.prisma.hockeyMatch.update({
      where: { id: matchId },
      data,
      // Phase 2 (2026-04-29) — HockeyMatch.homeTeam/awayTeam relation 폐기. homeTeamId/awayTeamId 만 응답
    });

    return updated;
  }

  // ==================== Match Score & Live State ====================

  /**
   * 현재 피리어드 기준 홈/어웨이 스코어 즉시 업데이트
   * - 해당 피리어드의 MatchPeriod 레코드가 있으면 동기화
   */
  async updateMatchScore(
    matchId: string,
    dto: UpdateMatchScoreDto,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true, currentPeriod: true, status: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    if (match.status === "completed" || match.status === "cancelled") {
      throw new BadRequestException(
        "종료되었거나 취소된 경기의 스코어는 수정할 수 없습니다.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.hockeyMatch.update({
        where: { id: matchId },
        data: {
          homeScore: dto.homeScore,
          awayScore: dto.awayScore,
        },
        select: {
          id: true,
          homeScore: true,
          awayScore: true,
          status: true,
          currentPeriod: true,
          updatedAt: true,
        },
      });

      return updated;
    });
  }

  /**
   * 경기 라이프사이클 상태 전환 (scheduled → warmup → in_progress → intermission → completed)
   */
  async updateMatchLiveState(
    matchId: string,
    dto: UpdateMatchLiveStateDto,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true, status: true, startedAt: true, endedAt: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    if (!(MATCH_STATUSES as readonly string[]).includes(dto.status)) {
      throw new BadRequestException("유효하지 않은 경기 상태입니다.");
    }

    const data: {
      status: string;
      currentPeriod?: number | null;
      startedAt?: Date;
      endedAt?: Date;
    } = { status: dto.status };

    if (dto.currentPeriod !== undefined) {
      data.currentPeriod = dto.currentPeriod;
    }

    // 자동 시각 세팅: in_progress 전환 시 startedAt, completed 전환 시 endedAt
    if (dto.status === "in_progress" && !match.startedAt) {
      data.startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    }
    if (dto.status === "completed" && !match.endedAt) {
      data.endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();
    }

    const updated = await this.prisma.hockeyMatch.update({
      where: { id: matchId },
      data,
      select: {
        id: true,
        status: true,
        currentPeriod: true,
        startedAt: true,
        endedAt: true,
        homeScore: true,
        awayScore: true,
      },
    });

    return updated;
  }

  // ==================== Match Periods ====================

  /**
   * 피리어드 목록 조회
   */
  async getMatchPeriods(matchId: string) {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    return this.prisma.matchPeriod.findMany({
      where: { matchId },
      orderBy: { periodNumber: "asc" },
    });
  }

  /**
   * 피리어드 upsert (있으면 수정, 없으면 생성)
   * - 같은 periodNumber 로 중복 생성되지 않도록 unique([matchId, periodNumber]) 활용
   */
  async upsertMatchPeriod(
    matchId: string,
    dto: UpsertMatchPeriodDto,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    const data = {
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
      homeScore: dto.homeScore,
      awayScore: dto.awayScore,
      homePenaltyMinutes: dto.homePenaltyMinutes,
      awayPenaltyMinutes: dto.awayPenaltyMinutes,
    };

    const period = await this.prisma.matchPeriod.upsert({
      where: {
        matchId_periodNumber: {
          matchId,
          periodNumber: dto.periodNumber,
        },
      },
      update: data,
      create: {
        matchId,
        periodNumber: dto.periodNumber,
        ...data,
      },
    });

    return period;
  }

  // ==================== Match Events ====================

  /**
   * 이벤트 목록 조회 (피리어드별 정렬)
   */
  async getMatchEvents(matchId: string) {
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    return this.prisma.matchEvent.findMany({
      where: { matchId },
      orderBy: [{ periodNumber: "asc" }, { eventTime: "asc" }],
      select: {
        id: true,
        periodNumber: true,
        eventTime: true,
        eventType: true,
        teamId: true,
        penaltyType: true,
        penaltyMinutes: true,
        description: true,
        isGameWinner: true,
        isPowerPlay: true,
        isShortHanded: true,
        createdAt: true,
        // Phase 2 (2026-04-29) — TeamRoster/MatchEvent.player relation 폐기. ID만 노출
        playerId: true,
        assistPlayer1Id: true,
        assistPlayer2Id: true,
      },
    });
  }

  /**
   * 경기 이벤트 생성 (골/페널티 등)
   * - goal 타입이면 자동으로 해당 팀 스코어 +1
   */
  async createMatchEvent(
    matchId: string,
    dto: CreateMatchEventDto,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: {
        id: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    if (match.status === "completed" || match.status === "cancelled") {
      throw new BadRequestException(
        "종료되었거나 취소된 경기에는 이벤트를 추가할 수 없습니다.",
      );
    }

    // 팀 소속 검증: teamId가 전달되면 홈/어웨이 중 하나와 일치해야 함
    if (
      dto.teamId &&
      dto.teamId !== match.homeTeamId &&
      dto.teamId !== match.awayTeamId
    ) {
      throw new BadRequestException(
        "이벤트의 teamId는 홈 또는 어웨이 팀이어야 합니다.",
      );
    }

    // Phase 2 (2026-04-29) — TeamRoster → TeamGroupMember 단일화. playerId 는 TeamGroupMember.id 를 가리킴
    if (dto.playerId) {
      const groupMember = await this.prisma.teamGroupMember.findUnique({
        where: { id: dto.playerId },
        select: {
          id: true,
          group: { select: { teamId: true } },
        },
      });
      if (!groupMember) {
        throw new NotFoundException(
          "선수(TeamGroupMember)를 찾을 수 없습니다.",
        );
      }
      if (dto.teamId && groupMember.group.teamId !== dto.teamId) {
        throw new BadRequestException("선수가 해당 팀 소속이 아닙니다.");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.matchEvent.create({
        data: {
          matchId,
          periodNumber: dto.periodNumber,
          eventTime: dto.eventTime,
          eventType: dto.eventType,
          teamId: dto.teamId,
          playerId: dto.playerId,
          assistPlayer1Id: dto.assistPlayer1Id,
          assistPlayer2Id: dto.assistPlayer2Id,
          penaltyType: dto.penaltyType,
          penaltyMinutes: dto.penaltyMinutes,
          description: dto.description,
          isGameWinner: dto.isGameWinner ?? false,
          isPowerPlay: dto.isPowerPlay ?? false,
          isShortHanded: dto.isShortHanded ?? false,
        },
      });

      // 골 이벤트면 스코어 자동 +1
      if (dto.eventType === "goal" && dto.teamId) {
        if (dto.teamId === match.homeTeamId) {
          await tx.hockeyMatch.update({
            where: { id: matchId },
            data: { homeScore: { increment: 1 } },
          });
        } else if (dto.teamId === match.awayTeamId) {
          await tx.hockeyMatch.update({
            where: { id: matchId },
            data: { awayScore: { increment: 1 } },
          });
        }
      }

      // 페널티 이벤트면 해당 피리어드 penaltyMinutes 누적
      if (
        dto.eventType === "penalty" &&
        dto.teamId &&
        dto.penaltyMinutes &&
        dto.penaltyMinutes > 0
      ) {
        const periodField =
          dto.teamId === match.homeTeamId
            ? { homePenaltyMinutes: { increment: dto.penaltyMinutes } }
            : dto.teamId === match.awayTeamId
              ? { awayPenaltyMinutes: { increment: dto.penaltyMinutes } }
              : null;

        if (periodField) {
          await tx.matchPeriod.upsert({
            where: {
              matchId_periodNumber: {
                matchId,
                periodNumber: dto.periodNumber,
              },
            },
            update: periodField,
            create: {
              matchId,
              periodNumber: dto.periodNumber,
              homePenaltyMinutes:
                dto.teamId === match.homeTeamId ? (dto.penaltyMinutes ?? 0) : 0,
              awayPenaltyMinutes:
                dto.teamId === match.awayTeamId ? (dto.penaltyMinutes ?? 0) : 0,
            },
          });
        }
      }

      return event;
    });
  }

  /**
   * 경기 이벤트 수정 (오기입 정정용)
   */
  async updateMatchEvent(
    matchId: string,
    eventId: string,
    dto: UpdateMatchEventDto,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const event = await this.prisma.matchEvent.findUnique({
      where: { id: eventId },
      select: { id: true, matchId: true },
    });

    if (!event) {
      throw new NotFoundException("이벤트를 찾을 수 없습니다.");
    }

    if (event.matchId !== matchId) {
      throw new BadRequestException("이벤트가 해당 경기에 속하지 않습니다.");
    }

    const updated = await this.prisma.matchEvent.update({
      where: { id: eventId },
      data: {
        periodNumber: dto.periodNumber,
        eventTime: dto.eventTime,
        eventType: dto.eventType,
        teamId: dto.teamId,
        playerId: dto.playerId,
        assistPlayer1Id: dto.assistPlayer1Id,
        assistPlayer2Id: dto.assistPlayer2Id,
        penaltyType: dto.penaltyType,
        penaltyMinutes: dto.penaltyMinutes,
        description: dto.description,
        isGameWinner: dto.isGameWinner,
        isPowerPlay: dto.isPowerPlay,
        isShortHanded: dto.isShortHanded,
      },
    });

    return updated;
  }

  /**
   * 경기 이벤트 삭제 (goal 이벤트 삭제 시 스코어 -1 롤백)
   */
  async deleteMatchEvent(
    matchId: string,
    eventId: string,
    requester: JwtUserPayload,
  ) {
    await this.resourceAccess.assertManageableMatch(matchId, requester);
    const event = await this.prisma.matchEvent.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        matchId: true,
        eventType: true,
        teamId: true,
        penaltyMinutes: true,
        periodNumber: true,
      },
    });

    if (!event) {
      throw new NotFoundException("이벤트를 찾을 수 없습니다.");
    }

    if (event.matchId !== matchId) {
      throw new BadRequestException("이벤트가 해당 경기에 속하지 않습니다.");
    }

    const match = await this.prisma.hockeyMatch.findUnique({
      where: { id: matchId },
      select: { id: true, homeTeamId: true, awayTeamId: true },
    });

    if (!match) {
      throw new NotFoundException("경기를 찾을 수 없습니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.matchEvent.delete({ where: { id: eventId } });

      // goal 롤백
      if (event.eventType === "goal" && event.teamId) {
        if (event.teamId === match.homeTeamId) {
          await tx.hockeyMatch.update({
            where: { id: matchId },
            data: { homeScore: { decrement: 1 } },
          });
        } else if (event.teamId === match.awayTeamId) {
          await tx.hockeyMatch.update({
            where: { id: matchId },
            data: { awayScore: { decrement: 1 } },
          });
        }
      }

      // penalty 롤백
      if (
        event.eventType === "penalty" &&
        event.teamId &&
        event.penaltyMinutes &&
        event.penaltyMinutes > 0
      ) {
        const periodUpdate =
          event.teamId === match.homeTeamId
            ? { homePenaltyMinutes: { decrement: event.penaltyMinutes } }
            : event.teamId === match.awayTeamId
              ? { awayPenaltyMinutes: { decrement: event.penaltyMinutes } }
              : null;

        if (periodUpdate) {
          await tx.matchPeriod.updateMany({
            where: { matchId, periodNumber: event.periodNumber },
            data: periodUpdate,
          });
        }
      }

      return { id: eventId, deletedAt: new Date() };
    });
  }
}
