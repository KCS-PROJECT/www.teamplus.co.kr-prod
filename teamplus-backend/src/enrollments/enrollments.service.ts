import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { WaitlistService } from "@/waitlist/waitlist.service";
import {
  CreditDomainService,
  MEMBER_CREDIT_EXTRA_USABLE_DAYS,
} from "@/credits/credit-domain.service";
import { endOfMonthKst, monthlyPassWindow } from "@/common/billing/billing-date.util";
import { assertClassOnSale } from "@/common/billing/sales-gate.util";
import { resolveEnrollmentBilling } from "@/common/billing/enrollment-billing.util";
import { BLOCKING_APPLICATION } from "@/common/enrollment/enrollment-status.constants";
import { hasActivePaidEnrollment } from "@/common/billing/paid-enrollment-guard.util";
import { hasOtherValidEnrollment } from "@/common/billing/roster-retention.util";
import { calculateKoreanAge } from "@/common/utils/age.util";
import { hasElapsedScheduleSincePayment } from "@/common/utils/enrollment-usage.util";
import { instantToKstDateOnly } from "@/common/utils/kst-date.util";
import { acquireClassSeatLock } from "@/classes/utils/class-locks.util";
import {
  assertPaymentAllowed,
  PACKAGE_PAYMENT_BLOCK_MESSAGES,
} from "@/classes/utils/package-guard.util";
import {
  CreateEnrollmentDto,
  ApproveEnrollmentDto,
  RejectEnrollmentDto,
  EnrollmentResponseDto,
  EnrollmentStatus,
} from "./dto";

/** 선택된 수강 상품 — 결제방식 판정 + 무료(0원) 여부·수업권 발급 조건 판정에 쓴다. */
type SelectedProduct = {
  billingTiming: string;
  price: number;
  sessionsPerMonth: number;
  feeType: string;
  durationDays: number | null;
  billingMonth: Date | null;
};

/**
 * 수강신청 상세 조회 시 필요한 필드만 select — N+1 방지 및 over-fetching 제거
 * include 전체 로드 대신 실제 mapToEnrollmentResponse()가 사용하는 필드만 명시
 */
const ENROLLMENT_DETAIL_SELECT = {
  id: true,
  childId: true,
  classId: true,
  requestedBy: true,
  requestType: true,
  status: true,
  approvedBy: true,
  approvedAt: true,
  rejectedAt: true,
  rejectionReason: true,
  paymentId: true,
  paidAt: true,
  requestedAt: true,
  expiresAt: true,
  note: true,
  child: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      childProfile: { select: { birthDate: true } },
    },
  },
  class: {
    select: {
      id: true,
      className: true,
      description: true,
      billingMode: true,
      team: { select: { id: true, name: true } },
    },
  },
  product: {
    select: {
      id: true,
      productName: true,
      price: true,
      sessionsPerMonth: true,
      feeType: true,
      // BOTH 수업의 후불 여부는 선택 상품 billingTiming 으로만 판정 가능
      // (프론트 isActiveEnrollment · 백엔드 scheduleEligibleClassFilter 공통 정책).
      billingTiming: true,
    },
  },
  requester: {
    select: {
      id: true,
      userType: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
    },
  },
} as const;

/**
 * Enrollments 서비스
 *
 * 수강신청 관리 - 두 가지 방식 지원:
 *
 * 방식1: 학부모 직접 신청 (parent_direct)
 * - 학부모가 자녀를 선택하여 직접 수강신청
 * - 바로 결제 진행 가능
 * - 상태: pending → paid (결제 완료)
 *
 * 방식2: 자녀 요청 → 학부모 승인 (child_request)
 * - 자녀(14세 이상)가 수강 요청
 * - 학부모에게 푸시 알림
 * - 학부모 승인 후 결제 진행
 * - 상태: pending_approval → approved → paid
 *
 * 공통 규칙:
 * - 결제는 항상 학부모만 가능
 * - 72시간 내 승인/결제하지 않으면 자동 만료
 */
@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  // 수강신청 만료 시간 (72시간)
  private readonly ENROLLMENT_EXPIRY_HOURS = 72;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly waitlistService: WaitlistService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): mockPay MemberCredit 발급
  ) {}

  // ================ 공통 메서드 ================

  /**
   * 수강신청 생성 (방식1, 방식2 공통)
   */
  async createEnrollment(
    userId: string,
    dto: CreateEnrollmentDto,
  ): Promise<EnrollmentResponseDto> {
    this.logger.log(
      `수강신청 생성: userId=${userId}, childId=${dto.childId}, classId=${dto.classId}`,
    );

    // 1. 요청자 정보 확인
    const requester = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });

    if (!requester) {
      throw new NotFoundException("사용자 정보를 찾을 수 없습니다.");
    }

    const requestType = dto.requestType || "parent_direct";

    // 2. 권한 검증
    if (requestType === "parent_direct") {
      // 방식1: 학부모만 직접 신청 가능
      if (requester.userType !== "PARENT") {
        throw new ForbiddenException("학부모만 직접 수강신청할 수 있습니다.");
      }

      // 학부모-자녀 관계 확인
      const parentChild = await this.prisma.parentChild.findUnique({
        where: {
          parentId_childId: { parentId: userId, childId: dto.childId },
        },
      });

      if (!parentChild) {
        throw new ForbiddenException("자녀 정보를 찾을 수 없습니다.");
      }
    } else if (requestType === "child_request") {
      // 방식2: 자녀가 본인 ID로만 요청 가능
      if (requester.userType !== "CHILD") {
        throw new ForbiddenException("자녀만 수강 요청을 할 수 있습니다.");
      }

      if (userId !== dto.childId) {
        throw new ForbiddenException("본인의 수강 요청만 가능합니다.");
      }
    }

    // 3. 수업 존재 확인
    const classInfo = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      select: {
        teamId: true,
        targetBirthYears: true,
        ageMin: true,
        ageMax: true,
        billingMode: true,
        salesOpenMonth: true,
      },
    });

    if (!classInfo) {
      throw new NotFoundException("수업 정보를 찾을 수 없습니다.");
    }

    // [Lifecycle v4.1 §9.4] 판매 게이트 — 대기(일정 미확정)/종료 수업은 수강신청 차단.
    //   프론트 숨김과 별개의 최종 집행 지점 (직접 API 호출 우회 방지). 반환값은
    //   Enrollment.billingMonth 폴백(후불·스팟·무월 레거시)에 재사용한다.
    const lifecycle = await assertClassOnSale(this.prisma, dto.classId);

    // 3-0. 팀 소속 승인 검증 (설계서 §4.5 + BR-12)
    //  - 팀 수업 (Class.teamId != null) 은 자녀가 해당 클럽의 approved ClubMember 여야 수강 가능.
    //  - 오픈클래스 (academyId, teamId=null) 는 본 가드에서 제외 (별도 academy 소속 검증 필요 시 후속 추가).
    //  - 미승인 자녀 차단 + Payment 단계 자동 approved 우회 경로 봉쇄 목적.
    //  - roleInTeam: PLAYER 명시 — PARENT 도입 후 학부모가 수강 자격 검증을 통과하지 않도록 방어
    if (classInfo.teamId) {
      const membership = await this.prisma.teamMember.findFirst({
        where: {
          userId: dto.childId,
          teamId: classInfo.teamId,
          roleInTeam: "PLAYER",
          approvalStatus: "approved",
        },
        select: { id: true },
      });

      if (!membership) {
        throw new ForbiddenException(
          "감독님의 팀 가입 승인이 완료된 후 수강신청이 가능합니다.",
        );
      }
    }

    // 3-1. 자녀 나이 제한 검증 (targetBirthYears 또는 ageMin/ageMax 설정된 수업만)
    // 프론트 바이패스·자녀 직접 요청·관리자 경로 모두 포괄하는 최종 방어선.
    // 나이/출생연도는 항상 birthDate 에서 직접 계산 (User.koreanAge 캐시는 신뢰하지 않음).
    const targetYears = classInfo.targetBirthYears ?? [];
    const hasTargetYears = targetYears.length > 0;
    if (hasTargetYears || classInfo.ageMin != null || classInfo.ageMax != null) {
      const childProfile = await this.prisma.childProfile.findUnique({
        where: { userId: dto.childId },
        select: { birthDate: true },
      });

      if (!childProfile) {
        throw new BadRequestException(
          "자녀 생년월일 정보가 없어 나이 제한을 확인할 수 없습니다.",
        );
      }

      if (hasTargetYears) {
        // 대상 출생연도 개별 목록(SoT) — 비연속 선택까지 정확히 매칭.
        // birthDate 는 `@db.Date`(UTC 자정) — 출생연도는 getUTCFullYear.
        const birthYear = new Date(childProfile.birthDate).getUTCFullYear();
        if (!targetYears.includes(birthYear)) {
          throw new BadRequestException(
            "이 수업은 대상 출생연도에 해당하는 자녀만 수강 가능합니다.",
          );
        }
      } else {
        // 하위호환 — targetBirthYears 미설정 수업은 기존 ageMin/ageMax(한국나이) 범위 검증.
        const childAge = calculateKoreanAge(new Date(childProfile.birthDate));

        if (classInfo.ageMin != null && childAge < classInfo.ageMin) {
          throw new BadRequestException(
            `이 수업은 ${classInfo.ageMin}세 이상만 수강 가능합니다.`,
          );
        }

        if (classInfo.ageMax != null && childAge > classInfo.ageMax) {
          throw new BadRequestException(
            `이 수업은 ${classInfo.ageMax}세까지만 수강 가능합니다.`,
          );
        }
      }
    }

    // 3-2. 등록 기간 검증 폐기 (2026-05-19)
    // 사유: 학부모별 결제일(수업권 만료일) 이 N주 패키지 단위로 모두 다르므로
    //       시스템 차원의 "월 단위 등록 마감"은 의미가 없음.
    //       만료 임박 시 학부모별로 인앱 알림(D-7/D-3/D-Day) 발송 → 추가 결제 유도.

    // 4. 상품 확인 (선택 사항) — 소속·판매 여부·월분·결제방식 정합. BOTH 는 상품 필수.
    const selectedProduct = await this.resolveSelectedProductTiming(
      dto.classId,
      classInfo.billingMode,
      classInfo.salesOpenMonth,
      dto.classProductId,
    );
    const selectedProductTiming = selectedProduct?.billingTiming ?? null;

    // 5~6. 중복 신청 확인 + 정원 체크 + 수강신청 생성을 원자적으로 수행
    // - 중복/정원/생성 을 한 트랜잭션에 묶어 race condition (동시 신청으로 정원 초과 저장) 방지.
    // - 정원 기준: ClassRegistration.status='active' 개수 (실제 결제 완료·수강 중인 등록자)
    // - 정원 정책 상세: docs/Planning/PAYMENT_FEE_POLICY.md 및 대기자 시스템(Waitlist) 연계 참조.
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.ENROLLMENT_EXPIRY_HOURS);

    let freeOrderNumber: string | undefined;
    const enrollment = await this.runEnrollmentTransaction(async (tx) => {
      // 좌석 잠금 — 결제 좌석 선점(payments.service claimSeatsBeforeApproval)과 같은 키.
      //   같은 잠금을 잡는 쓰기(등록 생성·결제 좌석 선점)끼리만 직렬화한다. 판매 상태·상품
      //   판매 여부의 쓰기는 다른 잠금 아래이므로 여기서 보장하지 않는다.
      await acquireClassSeatLock(tx, dto.classId);
      const fresh = await tx.class.findUnique({
        where: { id: dto.classId },
        select: { billingMode: true, capacity: true },
      });
      if (!fresh) {
        throw new NotFoundException("수업 정보를 찾을 수 없습니다.");
      }
      // 잠금 전에 검사한 상품 timing 과 잠금 후 결제방식이 어긋나면(그 사이 변경) 재시도 유도
      if (
        selectedProductTiming &&
        (fresh.billingMode === "PREPAID" || fresh.billingMode === "POSTPAID") &&
        selectedProductTiming !== fresh.billingMode
      ) {
        throw new ConflictException(
          "수업 결제 방식이 변경되었습니다. 화면을 새로고침한 후 다시 시도해주세요.",
        );
      }
      // 정원 — 신청 자녀 본인의 활성 좌석은 제외(갱신 신청이 본인 좌석 때문에 막히지 않도록,
      //   결제 좌석 선점과 동일 의미). 0 = 무제한.
      const assertSeatAvailable = async () => {
        if (!fresh.capacity || fresh.capacity <= 0) return;
        const activeCount = await tx.classRegistration.count({
          where: {
            classId: dto.classId,
            status: "active",
            userId: { not: dto.childId },
          },
        });
        if (activeCount >= fresh.capacity) {
          throw new ConflictException(
            "수업 정원이 마감되었습니다. 대기 등록을 이용해주세요.",
          );
        }
      };

      // paid 이력은 "현재 수강 중"일 때만 차단 — 만료(배치 해제·크레딧 소진) 자녀의
      //   재신청(갱신)은 통과시킨다. 판정 SoT 는 표시(hasValidPass)와 동일.
      if (await hasActivePaidEnrollment(tx, dto.childId, dto.classId)) {
        throw new ConflictException("이미 신청 중이거나 수강 중인 수업입니다.");
      }

      const existingEnrollment = await tx.enrollment.findFirst({
        where: {
          childId: dto.childId,
          classId: dto.classId,
          status: {
            // 중복 신청 차단 3종 — approved(후불 수강 중) 포함. 만료 cron 집합과 다름.
            in: BLOCKING_APPLICATION,
          },
        },
        select: { id: true, status: true, requestedBy: true, paymentId: true },
      });

      // [Phase B] 후불 여부 — 전용 POSTPAID 또는 BOTH(선택형)+후불 상품 선택.
      //   [B5c] BOTH+선불(PREPAID 상품)은 일반 결제대기(PENDING)로 흘러간다.
      //   (재활용 분기·신규 생성 분기 양쪽에서 쓰므로 블록 상단에서 1회 계산)
      const isPostpaid =
        fresh.billingMode === "POSTPAID" ||
        (fresh.billingMode === "BOTH" && selectedProductTiming === "POSTPAID");
      // 무료 선불 — 결제할 금액이 없으므로 결제사·결제 화면을 거치지 않는다.
      const isFreePrepaid = !isPostpaid && selectedProduct?.price === 0;
      // 귀속월·결제 방식 스냅샷 — 재활용 전환·신규 생성 양쪽에 같은 값. 입력이 전부
      //   위에서 확정돼 1회 계산.
      const enrollmentBilling = resolveEnrollmentBilling(
        fresh.billingMode,
        selectedProductTiming,
        selectedProduct?.billingMonth,
        lifecycle.earliestRemainingMonth,
      );

      if (existingEnrollment) {
        // 중단된 선불 결제 시도가 남긴 "미결제 pending"(payment-create:enrollment.create)을
        //   후불 등록으로 재활용한다. 프론트가 본인 pending 을 잠그지 않아 후불 CTA 가 노출되어도
        //   여기서 막히던 state 불일치를 해소(선불 결제 미완료분 → 후불 전환).
        const isReusablePending =
          existingEnrollment.status === EnrollmentStatus.PENDING &&
          existingEnrollment.requestedBy === userId;

        // 결제 미완료 확인 — paymentId 연결 시 Payment 상태가 completed 면 재활용 금지.
        let paymentCompleted = false;
        if (isReusablePending && existingEnrollment.paymentId) {
          const linkedPayment = await tx.payment.findUnique({
            where: { id: existingEnrollment.paymentId },
            select: { paymentStatus: true },
          });
          paymentCompleted = linkedPayment?.paymentStatus === "completed";
        }
        const reusable = isReusablePending && !paymentCompleted;

        if (isPostpaid && reusable) {
          // orphan Payment 정리 (미완료만 cancel — completed 는 위에서 이미 배제).
          if (existingEnrollment.paymentId) {
            const voided = await tx.payment.updateMany({
              where: {
                id: existingEnrollment.paymentId,
                paymentStatus: { not: "completed" },
              },
              data: { paymentStatus: "cancelled" },
            });
            // 그 사이 결제가 완료됐으면 승인 후처리가 이 등록을 paid 로 가져간다 — 덮어쓰지 않음
            if (voided.count !== 1) {
              throw new ConflictException(
                "결제가 완료된 신청입니다. 화면을 새로고침한 후 확인해주세요.",
              );
            }
          }
          // 정원 가드 — 재활용 후불 전환도 새 active 좌석을 만들므로 신규 create 경로와
          //   동일 기준·동일 메시지로 정원 마감을 차단(본인 prepaid pending 은 active 아님 → 미집계).
          await assertSeatAvailable();

          // 읽었던 상태·결제 연결 그대로일 때만 전환(취소·결제 완료와의 경합 차단)
          const transitioned = await tx.enrollment.updateMany({
            where: {
              id: existingEnrollment.id,
              status: EnrollmentStatus.PENDING,
              paymentId: existingEnrollment.paymentId,
            },
            data: {
              classProductId: dto.classProductId,
              status: EnrollmentStatus.APPROVED,
              paymentId: null,
              requestedBy: userId,
              requestType,
              expiresAt,
              note: dto.note,
              ...enrollmentBilling,
            },
          });
          if (transitioned.count !== 1) {
            throw new ConflictException("이미 처리된 수강신청입니다.");
          }
          const converted = await tx.enrollment.findUniqueOrThrow({
            where: { id: existingEnrollment.id },
            select: ENROLLMENT_DETAIL_SELECT,
          });
          await tx.classRegistration.upsert({
            where: {
              classId_userId: { classId: dto.classId, userId: dto.childId },
            },
            update: { status: "active" },
            create: {
              classId: dto.classId,
              userId: dto.childId,
              status: "active",
            },
          });
          return converted;
        }

        // 그 외(approved·PENDING_APPROVAL·후불 아님·재활용 불가) → 기존대로 차단.
        throw new ConflictException("이미 신청 중이거나 수강 중인 수업입니다.");
      }

      // 정원 초과 시 차단 (대기 등록은 별도 /api/v1/waitlist 엔드포인트 사용)
      await assertSeatAvailable();

      // [Phase B] 후불 수업 — 선결제 없이 즉시 수강 등록(구독형).
      //   enrollment=approved + ClassRegistration active 로 바로 수강생. 출석분만 월말 정산.
      //   (isPostpaid 는 블록 상단에서 이미 계산됨 — 재활용/신규 생성 공통 사용)
      const created = await tx.enrollment.create({
        data: {
          childId: dto.childId,
          classId: dto.classId,
          classProductId: dto.classProductId,
          requestedBy: userId,
          requestType,
          status: isPostpaid
            ? EnrollmentStatus.APPROVED
            : requestType === "parent_direct"
              ? EnrollmentStatus.PENDING
              : EnrollmentStatus.PENDING_APPROVAL,
          expiresAt,
          note: dto.note,
          ...enrollmentBilling,
        },
        select: ENROLLMENT_DETAIL_SELECT,
      });
      if (isPostpaid) {
        await tx.classRegistration.upsert({
          where: {
            classId_userId: { classId: dto.classId, userId: dto.childId },
          },
          update: { status: "active" },
          create: {
            classId: dto.classId,
            userId: dto.childId,
            status: "active",
          },
        });
        return created;
      }
      // 무료(0원) 선불 — 결제 단계를 건너뛰고 즉시 수강 확정. 학부모 직접 신청만 해당하며,
      //   자녀 요청(승인 대기)은 승인 시점에 같은 처리를 한다(approveEnrollment).
      if (isFreePrepaid && created.status === EnrollmentStatus.PENDING) {
        const free = await this.completeFreeEnrollment(tx, {
          enrollmentId: created.id,
          classId: dto.classId,
          childId: dto.childId,
          payerUserId: userId,
          classProductId: dto.classProductId!,
          fromStatuses: [EnrollmentStatus.PENDING],
          product: selectedProduct,
        });
        const row = await tx.enrollment.findUniqueOrThrow({
          where: { id: created.id },
          select: ENROLLMENT_DETAIL_SELECT,
        });
        freeOrderNumber = free.orderNumber;
        return row;
      }
      return created;
    });

    this.logger.log(`수강신청 생성 완료: enrollmentId=${enrollment.id}`);

    // 방식2: 자녀 수강 요청 시 학부모에게 승인 요청 알림 발송
    if (requestType === "child_request") {
      const childName = enrollment.child
        ? `${enrollment.child.lastName}${enrollment.child.firstName}`
        : "자녀";
      const className = enrollment.class?.className || "수업";

      // 학부모 조회 (주 보호자)
      const parentChildren = await this.prisma.parentChild.findMany({
        where: { childId: dto.childId, isPrimary: true },
        select: { parentId: true },
      });

      for (const pc of parentChildren) {
        this.notificationsService
          .createNotification({
            userId: pc.parentId,
            notificationType: "enrollment_request",
            title: "수강신청 승인 요청",
            message: `${childName}님이 ${className} 수업 수강을 요청했습니다. 승인해주세요.`,
            linkUrl: `/classes/${dto.classId}`,
          })
          .catch((err) =>
            this.logger.warn(
              `수강 요청 알림 발송 실패: parentId=${pc.parentId}, error=${err.message}`,
            ),
          );
      }
    }

    return {
      ...this.mapToEnrollmentResponse(enrollment),
      // 무료 확정 건만 — 결제 완료 화면이 영수증을 조회하는 키.
      ...(freeOrderNumber ? { freeOrderNumber } : {}),
    };
  }

  /**
   * 내 수강신청 목록 조회
   */
  async getMyEnrollments(
    userId: string,
    status?: string,
    page?: number,
    limit?: number,
  ): Promise<EnrollmentResponseDto[]> {
    this.logger.log(`내 수강신청 목록 조회: userId=${userId}`);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });

    if (!user) {
      throw new NotFoundException("사용자 정보를 찾을 수 없습니다.");
    }

    let whereCondition: Prisma.EnrollmentWhereInput = {};

    if (user.userType === "PARENT") {
      // 학부모: 내가 신청했거나 내 자녀들의 수강신청
      const myChildren = await this.prisma.parentChild.findMany({
        where: { parentId: userId },
        select: { childId: true },
      });

      const childIds = myChildren.map((pc) => pc.childId);

      whereCondition = {
        OR: [{ requestedBy: userId }, { childId: { in: childIds } }],
      };
    } else if (user.userType === "CHILD") {
      // 자녀: 본인의 수강신청만
      whereCondition = { childId: userId };
    }

    if (status) {
      whereCondition.status = status;
    }

    const pageNum = page ?? 1;
    const pageSize = limit ?? 20;

    const enrollments = await this.prisma.enrollment.findMany({
      where: whereCondition,
      select: ENROLLMENT_DETAIL_SELECT,
      orderBy: { requestedAt: "desc" },
      take: pageSize,
      skip: (pageNum - 1) * pageSize,
    });

    // [Lifecycle v4.1] 선불 "수강 중" 유효성 일괄 판정 — 만료 안 된 기간권(잔여>0) 보유 여부.
    //   paid enrollment 는 만료 개념이 없어(환불 전까지 영구) "결제 이력"일 뿐,
    //   달력 월 체계의 "현재 수강 중"은 크레딧이 SoT.
    //   ⚠️ 표시 판정은 출석 게이트와 달리 시작일(startsAt) 조건을 걸지 않는다 —
    //   다음 달분 선구매자(startsAt 미래)도 "결제 완료 = 수강 중(이용 예정)"으로 표시.
    //   시작 전 출석 차단은 deductOne 게이트가 별도로 집행 (표시/집행 분리).
    const paidRows = enrollments.filter((e) => e.status === "paid");
    const validPassSet = new Set<string>();
    if (paidRows.length > 0) {
      const now = new Date();
      const credits = await this.prisma.memberCredit.findMany({
        where: {
          userId: { in: [...new Set(paidRows.map((e) => e.childId))] },
          classId: { in: [...new Set(paidRows.map((e) => e.classId))] },
          expiresAt: { gte: now },
        },
        select: {
          userId: true,
          classId: true,
          totalSessions: true,
          usedSessions: true,
        },
      });
      for (const c of credits) {
        // 월권은 무차감(항상 잔여>0), 회차권(레거시)은 소진 시 수강 중 아님.
        if (c.totalSessions - c.usedSessions > 0) {
          validPassSet.add(`${c.userId}:${c.classId}`);
        }
      }
    }

    // 비발급 선불(sessionsPerMonth=0) paid 행은 크레딧이 없어 기간권으로 판정 불가 —
    //   "수강 중" SoT 는 배치 상태(ClassRegistration active)다. 판매 시작 시 미갱신
    //   배치 해제(status=expired)가 그대로 반영되어야 만료 자녀가 표시에서 빠진다.
    const activeRegSet = new Set<string>();
    // 해제 시점(등록이 active 가 아닌 행의 updatedAt) — 만료 paid 의 "재결제 필요"
    //   노출 시한 판정용(프론트). 해제 이후 다시 건드리지 않는 값이라 앵커로 안정적.
    const regEndedAtByPair = new Map<string, Date>();
    if (paidRows.length > 0) {
      const regs = await this.prisma.classRegistration.findMany({
        where: {
          userId: { in: [...new Set(paidRows.map((e) => e.childId))] },
          classId: { in: [...new Set(paidRows.map((e) => e.classId))] },
        },
        select: { userId: true, classId: true, status: true, updatedAt: true },
      });
      for (const r of regs) {
        const key = `${r.userId}:${r.classId}`;
        if (r.status === "active") {
          activeRegSet.add(key);
        } else {
          regEndedAtByPair.set(key, r.updatedAt);
        }
      }
    }

    return enrollments.map((e) => {
      // 후불 축(상품 billingTiming 또는 수업 billingMode = POSTPAID)은 크레딧 미발급이
      //   정상이라 hasValidPass 판정 비대상(null) — false 를 내면 paid 후불 행(정산
      //   플로우가 기대하는 상태)의 "등록완료"가 오해제된다 (evaluator N2).
      const isPostpaidAxis =
        e.product?.billingTiming === "POSTPAID" ||
        e.class?.billingMode === "POSTPAID";
      // 선불 "수강 중" 단일 공식 — 등록(ClassRegistration) active AND
      //   (발급형이면 유효 크레딧 보유). 비발급(sessionsPerMonth=0)은 크레딧
      //   미발급이 정상이라 크레딧 항을 평가하지 않는다(등록만).
      //   재결제 게이트(paid-enrollment-guard.util)·출석 API 와 동일 기준.
      const isNonIssuingProduct = e.product?.sessionsPerMonth === 0;
      const pairKey = `${e.childId}:${e.classId}`;
      const hasValidPass =
        e.status === "paid" && !isPostpaidAxis
          ? activeRegSet.has(pairKey) &&
            (isNonIssuingProduct || validPassSet.has(pairKey))
          : null;
      return {
        ...this.mapToEnrollmentResponse(e),
        hasValidPass,
        // 만료(hasValidPass=false) 행의 수강 종료(배치 해제) 시점 — 프론트가
        //   "재결제 필요" 노출 시한을 계산한다. 등록 active 인데 크레딧만 소진된
        //   발급형 케이스는 해제 이력이 없어 null(시한 없이 노출).
        passEndedAt:
          hasValidPass === false
            ? (regEndedAtByPair.get(pairKey) ?? null)
            : null,
      };
    });
  }

  /**
   * 수강신청 상세 조회
   */
  async getEnrollment(
    userId: string,
    enrollmentId: string,
  ): Promise<EnrollmentResponseDto> {
    this.logger.log(
      `수강신청 상세 조회: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    const enrollment = await this.findEnrollmentWithAccess(
      userId,
      enrollmentId,
    );

    return this.mapToEnrollmentResponse(enrollment);
  }

  /**
   * 수강신청 취소
   */
  async cancelEnrollment(userId: string, enrollmentId: string): Promise<void> {
    this.logger.log(
      `수강신청 취소: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    const enrollment = await this.findEnrollmentWithAccess(
      userId,
      enrollmentId,
    );

    // 결제 완료된 건은 취소 불가 (환불 절차 필요).
    //   단 무료(0원)는 환불할 금액이 없어 승인제 환불로 보낼 수 없다 — 본인이 바로 취소한다.
    //   상세 select 에 결제 금액이 없어 연결 결제를 따로 확인한다(무료 건에서만 1회).
    let isFreePaid = false;
    if (enrollment.status === EnrollmentStatus.PAID && enrollment.paymentId) {
      const linked = await this.prisma.payment.findUnique({
        where: { id: enrollment.paymentId },
        select: { amount: true, paymentStatus: true },
      });
      isFreePaid =
        Number(linked?.amount ?? -1) === 0 &&
        linked?.paymentStatus === "completed";
    }
    if (enrollment.status === EnrollmentStatus.PAID && !isFreePaid) {
      throw new BadRequestException(
        "결제 완료된 수강신청은 환불 절차를 통해 취소해주세요.",
      );
    }
    // 무료라도 이용 개시 판정은 유료와 같다 — 신청 이후 수업이 한 번이라도 진행됐으면
    //   본인 취소를 막는다(출석 기록이 남은 채 등록만 사라지는 모순 방지).
    //   유료는 환불 요청으로 넘기지만 무료는 환불이 없어 감독 문의로 안내한다.
    if (isFreePaid) {
      const paidDayUtc = instantToKstDateOnly(enrollment.paidAt ?? new Date());
      if (
        await hasElapsedScheduleSincePayment(
          this.prisma,
          { classId: enrollment.classId },
          paidDayUtc,
        )
      ) {
        throw new BadRequestException(
          "이미 수업이 진행되어 취소할 수 없습니다. 감독님께 문의해주세요.",
        );
      }
    }

    // 취소 가능 = 결제/승인을 기다리는 상태뿐. 종결 상태(취소·거절·만료)와 돈이 오간
    //   상태(완료·환불)는 취소로 덮지 않는다.
    if (!isFreePaid && !BLOCKING_APPLICATION.includes(enrollment.status)) {
      const terminal = [
        EnrollmentStatus.CANCELLED,
        EnrollmentStatus.REJECTED,
        EnrollmentStatus.EXPIRED,
      ].includes(enrollment.status as EnrollmentStatus);
      throw new BadRequestException(
        terminal
          ? "이미 취소/거절/만료된 수강신청입니다."
          : "취소할 수 없는 수강신청 상태입니다.",
      );
    }

    // 상태 전이 + 결제 무효화 + 명단 해지를 한 트랜잭션으로 — 일부만 반영된 상태(취소된
    //   등록·활성 명단, 취소된 등록·살아있는 결제 요청)를 남기지 않는다. 위에서 읽은 상태를
    //   조건으로 걸어 동시 이중 취소는 한쪽만 성공한다.
    const releasedSeats = await this.runEnrollmentTransaction(async (tx) => {
      // 좌석 잠금 — 결제 좌석 선점과 같은 키. 선점이 잠금 안에서 등록 상태를 다시 읽으므로
      //   "취소 → 늦은 승인" 순서에서도 취소가 이긴다.
      await acquireClassSeatLock(tx, enrollment.classId);
      const transitioned = await tx.enrollment.updateMany({
        where: {
          id: enrollmentId,
          status: {
            in: isFreePaid
              ? [EnrollmentStatus.PAID]
              : (BLOCKING_APPLICATION as EnrollmentStatus[]),
          },
        },
        data: { status: EnrollmentStatus.CANCELLED },
      });
      if (transitioned.count !== 1) {
        throw new ConflictException("이미 처리된 수강신청입니다.");
      }
      // 연결된 결제 요청 무효화 — 아직 결제사에 가지 않은 pending 결제만. 이후 결제 확인
      //   진입점(토스·나이스·mock)이 cancelled 를 거부해 취소 뒤 결제가 실행되지 않는다.
      //   결제 개시(payment-create)가 그 사이 새 결제로 재연결했을 수 있어 연결은 트랜잭션
      //   안에서 다시 읽는다 — 위 전이가 같은 행을 잠갔으므로 여기서 읽은 값이 최종이다.
      //   (밖에서 읽은 값을 쓰면 옛 결제만 취소되고 새 결제가 살아남아 취소 뒤 결제가 된다.)
      const current = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: { paymentId: true },
      });
      if (current?.paymentId) {
        await tx.payment.updateMany({
          where: {
            id: current.paymentId,
            // 무료 건은 완료로 기록돼 있으므로 그 상태도 취소로 되돌린다(돈이 오간 적 없음).
            paymentStatus: { in: isFreePaid ? ["completed"] : ["pending"] },
          },
          data: { paymentStatus: "cancelled" },
        });
      }
      // [Phase B] 수강 종료 — 활성 명단 해지(후불 active 등록). 선불 미결제는 명단이 없어 0건.
      //   같은 자녀에게 이 수업의 다른 유효 등록이 남아 있으면 명단을 유지한다(갱신 신청 취소가
      //   현 수강을 끊지 않도록).
      const keepRoster = await hasOtherValidEnrollment(tx, {
        classId: enrollment.classId,
        childId: enrollment.childId,
        excludeEnrollmentIds: [enrollmentId],
      });
      if (keepRoster) return 0;
      const released = await tx.classRegistration.updateMany({
        where: {
          classId: enrollment.classId,
          userId: enrollment.childId,
          status: "active",
        },
        data: { status: "inactive" },
      });
      return released.count;
    });

    this.logger.log(`수강신청 취소 완료: enrollmentId=${enrollmentId}`);

    // 실제로 좌석이 비었을 때만 대기자 자동 승격(미결제 pending 취소는 좌석 무변동)
    if (releasedSeats > 0) {
      this.waitlistService
        .promoteNextWaitlist(enrollment.classId)
        .catch((err) =>
          this.logger.warn(
            `대기자 승격 실패: classId=${enrollment.classId}, error=${err.message}`,
          ),
        );
    }
  }

  // ================ 방식2 전용 메서드 ================

  /**
   * 승인 대기 목록 조회 (학부모용)
   *
   * 내 자녀들이 요청한 수강신청 중 승인 대기 상태인 것만 조회
   */
  async getPendingApprovals(userId: string): Promise<EnrollmentResponseDto[]> {
    this.logger.log(`승인 대기 목록 조회: userId=${userId}`);

    // 학부모인지 확인
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });

    if (!user || user.userType !== "PARENT") {
      throw new ForbiddenException(
        "학부모만 승인 대기 목록을 조회할 수 있습니다.",
      );
    }

    // 내 자녀 목록
    const myChildren = await this.prisma.parentChild.findMany({
      where: { parentId: userId, isPrimary: true }, // 주 보호자만 승인 가능
      select: { childId: true },
    });

    const childIds = myChildren.map((pc) => pc.childId);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        childId: { in: childIds },
        requestType: "child_request",
        status: EnrollmentStatus.PENDING_APPROVAL,
      },
      select: ENROLLMENT_DETAIL_SELECT,
      orderBy: { requestedAt: "asc" }, // 오래된 것부터
    });

    return enrollments.map((e) => this.mapToEnrollmentResponse(e));
  }

  /**
   * 수강신청 승인 (학부모)
   */
  async approveEnrollment(
    userId: string,
    enrollmentId: string,
    dto: ApproveEnrollmentDto,
  ): Promise<EnrollmentResponseDto> {
    this.logger.log(
      `수강신청 승인: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    // 1. 수강신청 조회
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: ENROLLMENT_DETAIL_SELECT,
    });

    if (!enrollment) {
      throw new NotFoundException("수강신청 정보를 찾을 수 없습니다.");
    }

    // 2. 승인 대기 상태인지 확인
    if (enrollment.status !== EnrollmentStatus.PENDING_APPROVAL) {
      throw new BadRequestException("승인 대기 상태가 아닙니다.");
    }

    // 3. 만료 여부 확인
    if (new Date() > enrollment.expiresAt) {
      await this.prisma.enrollment.updateMany({
        where: { id: enrollmentId, status: EnrollmentStatus.PENDING_APPROVAL },
        data: { status: EnrollmentStatus.EXPIRED },
      });
      throw new BadRequestException("승인 기한이 만료되었습니다.");
    }

    // 4. 주 보호자인지 확인
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: userId, childId: enrollment.childId },
      },
    });

    if (!parentChild || !parentChild.isPrimary) {
      throw new ForbiddenException("주 보호자만 승인할 수 있습니다.");
    }

    // 5. 승인 처리 — 읽었던 상태(승인 대기) 그대로일 때만 전이한다. 조건부 update 가 그
    //   판정을 하므로(0행이면 409) 별도의 사전 재확인은 두지 않는다.
    const approvedNote = dto.note
      ? `${enrollment.note || ""}\n[승인메모] ${dto.note}`
      : enrollment.note;
    // 무료(0원) 선불은 승인이 곧 수강 확정 — 결제할 금액이 없어 결제 단계가 없다.
    //   학부모 직접 신청은 createEnrollment 가 신청 시점에 같은 처리를 한다.
    const isFreePrepaid =
      enrollment.product != null &&
      Number(enrollment.product.price) === 0 &&
      enrollment.product.billingTiming !== "POSTPAID" &&
      enrollment.class?.billingMode !== "POSTPAID";
    const updatedEnrollment = isFreePrepaid
      ? await this.prisma.$transaction(async (tx) => {
          const product = await tx.classProduct.findUnique({
            where: { id: enrollment.product!.id },
            select: {
              sessionsPerMonth: true,
              feeType: true,
              durationDays: true,
              billingMonth: true,
            },
          });
          await this.completeFreeEnrollment(tx, {
            enrollmentId,
            classId: enrollment.classId,
            childId: enrollment.childId,
            payerUserId: userId,
            classProductId: enrollment.product!.id,
            fromStatuses: [EnrollmentStatus.PENDING_APPROVAL],
            product,
          });
          return tx.enrollment.update({
            where: { id: enrollmentId },
            data: {
              approvedBy: userId,
              approvedAt: new Date(),
              note: approvedNote,
            },
            select: ENROLLMENT_DETAIL_SELECT,
          });
        })
      : await this.updateIfStillPendingApproval(enrollmentId, {
          status: EnrollmentStatus.APPROVED,
          approvedBy: userId,
          approvedAt: new Date(),
          note: approvedNote,
        });

    this.logger.log(`수강신청 승인 완료: enrollmentId=${enrollmentId}`);

    // 자녀(신청자)에게 승인 알림 발송
    {
      const className = updatedEnrollment.class?.className || "수업";
      this.notificationsService
        .createNotification({
          userId: updatedEnrollment.childId,
          notificationType: "enrollment_approved",
          title: "수강신청 승인",
          message: `${className} 수업 수강신청이 승인되었습니다.`,
          linkUrl: `/classes/${updatedEnrollment.classId}`,
        })
        .catch((err) =>
          this.logger.warn(
            `수강 승인 알림 발송 실패: childId=${updatedEnrollment.childId}, error=${err.message}`,
          ),
        );
    }

    return this.mapToEnrollmentResponse(updatedEnrollment);
  }

  /**
   * 수강신청 거절 (학부모)
   */
  async rejectEnrollment(
    userId: string,
    enrollmentId: string,
    dto: RejectEnrollmentDto,
  ): Promise<EnrollmentResponseDto> {
    this.logger.log(
      `수강신청 거절: userId=${userId}, enrollmentId=${enrollmentId}`,
    );

    // 1. 수강신청 조회
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: ENROLLMENT_DETAIL_SELECT,
    });

    if (!enrollment) {
      throw new NotFoundException("수강신청 정보를 찾을 수 없습니다.");
    }

    // 2. 승인 대기 상태인지 확인
    if (enrollment.status !== EnrollmentStatus.PENDING_APPROVAL) {
      throw new BadRequestException("승인 대기 상태가 아닙니다.");
    }

    // 3. 주 보호자인지 확인
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: userId, childId: enrollment.childId },
      },
    });

    if (!parentChild || !parentChild.isPrimary) {
      throw new ForbiddenException("주 보호자만 거절할 수 있습니다.");
    }

    // 4. 거절 처리 — 읽었던 상태(승인 대기) 그대로일 때만(조건부 update 가 판정).
    const updatedEnrollment = await this.updateIfStillPendingApproval(
      enrollmentId,
      {
        status: EnrollmentStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      },
    );

    this.logger.log(`수강신청 거절 완료: enrollmentId=${enrollmentId}`);

    // 자녀(신청자)에게 거절 알림 발송
    {
      const className = updatedEnrollment.class?.className || "수업";
      const reason = dto.reason ? ` 사유: ${dto.reason}` : "";
      this.notificationsService
        .createNotification({
          userId: updatedEnrollment.childId,
          notificationType: "enrollment_rejected",
          title: "수강신청 거절",
          message: `${className} 수업 수강신청이 거절되었습니다.${reason}`,
          linkUrl: `/classes/${updatedEnrollment.classId}`,
        })
        .catch((err) =>
          this.logger.warn(
            `수강 거절 알림 발송 실패: childId=${updatedEnrollment.childId}, error=${err.message}`,
          ),
        );
    }

    return this.mapToEnrollmentResponse(updatedEnrollment);
  }

  // ================ 결제 연동 메서드 ================

  // P1-3 (v0.5): `markAsPaid()` 메서드 제거 (dead code).
  //   - grep 호출처 0건 (2026-05-20 확인)
  //   - 실제 결제 흐름은 `payment-webhook.service.ts:handleWebhook()` 이 직접 처리:
  //       Payment 업데이트 + MemberCredit 발급 + ClassRegistration upsert + Enrollment.status='paid'
  //   - 동일 로직 중복 유지 시 정합성 보장 부담 → 단일 경로로 통일

  /**
   * [DEV ONLY] 수강신청 강제 결제 완료 처리 (Mock Pay)
   *
   * 실제 결제 모듈을 우회하고 enrollment를 paid 상태로 전환합니다.
   * - 운영 환경(NODE_ENV=production)에서는 호출 차단
   * - 가짜 Payment 레코드 생성 (금액 0, method=mock)
   * - ClubMember / ClassRegistration 자동 생성 (markAsPaid 로직 복제)
   * - MemberCredit 발급은 의도적으로 제외 (결제 우회 범위)
   *
   * markAsPaid()는 자체 $transaction을 갖기 때문에 직접 호출 금지.
   * 내부 로직만 복제하여 사용함.
   */
  async mockPay(
    userId: string,
    enrollmentId: string,
  ): Promise<EnrollmentResponseDto> {
    // 1) 운영 환경 가드
    if (process.env.NODE_ENV === "production") {
      this.logger.warn(
        `[MOCK PAY] 운영 환경에서 호출 차단: userId=${userId}, enrollmentId=${enrollmentId}`,
      );
      throw new ForbiddenException("개발 환경 전용 기능입니다.");
    }

    // 2) enrollment 존재 확인
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
    });
    if (!enrollment) {
      throw new NotFoundException("수강신청 정보를 찾을 수 없습니다.");
    }

    // 3) 권한 검증: ADMIN은 모두 가능, 그 외는 본인 신청 건만
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });
    if (!user) {
      throw new NotFoundException("사용자 정보를 찾을 수 없습니다.");
    }
    const isAdmin = user.userType === "ADMIN";
    const isOwner = enrollment.requestedBy === userId;
    if (!isAdmin && !isOwner) {
      throw new ForbiddenException(
        "본인이 신청한 수강신청만 처리할 수 있습니다.",
      );
    }

    // 4) 상태 검증
    if (enrollment.status === EnrollmentStatus.PAID) {
      throw new BadRequestException("이미 결제가 완료된 수강신청입니다.");
    }
    const allowedStatuses: EnrollmentStatus[] = [
      EnrollmentStatus.PENDING,
      EnrollmentStatus.PENDING_APPROVAL,
      EnrollmentStatus.APPROVED,
    ];
    if (!allowedStatuses.includes(enrollment.status as EnrollmentStatus)) {
      throw new BadRequestException("결제를 진행할 수 있는 상태가 아닙니다.");
    }

    // 5) 트랜잭션: Payment 생성 + Enrollment 업데이트 + ClubMember/ClassRegistration 자동 생성
    const updatedEnrollment = await this.prisma.$transaction(async (tx) => {
      // 5-1) 가짜 Payment 생성
      const mockPayment = await tx.payment.create({
        data: {
          orderNumber: `MOCK-${Date.now()}-${enrollmentId}`,
          userId: enrollment.requestedBy,
          amount: 0,
          paymentStatus: "completed",
          paymentMethod: "mock",
          // PG 를 거치지 않은 결제 — 환불 시 PG 호출을 건너뛰어야 한다.
          pgProvider: "mock",
          completedAt: new Date(),
        },
      });

      // 5-2) Enrollment → PAID 전환 — 읽었던 상태 그대로일 때만(그 사이 취소되면 되살리지 않음)
      const claimed = await tx.enrollment.updateMany({
        where: { id: enrollmentId, status: enrollment.status },
        data: { status: EnrollmentStatus.PAID },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("이미 처리된 수강신청입니다.");
      }
      const updated = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status: EnrollmentStatus.PAID,
          paymentId: mockPayment.id,
          paidAt: new Date(),
        },
        select: ENROLLMENT_DETAIL_SELECT,
      });

      // 5-3) ClubMember approved 보조 확인 (Club 수업일 때만 — N-9/N-10).
      //  - Academy 수업은 가입 자격 검증 없이 진행.
      //  - roleInTeam: PLAYER 명시 — PARENT 도입 후 학부모가 결제 자격 검증을 통과하지 않도록 방어
      const childUserId = updated.childId;
      const teamId = updated.class.team?.id;

      if (teamId) {
        const clubMember = await tx.teamMember.findFirst({
          where: {
            userId: childUserId,
            teamId,
            roleInTeam: "PLAYER",
            approvalStatus: "approved",
          },
          select: { id: true },
        });

        if (!clubMember) {
          throw new ForbiddenException(
            "감독님의 팀 가입 승인이 완료된 후 결제할 수 있습니다.",
          );
        }
      }

      // 5-4) ClassRegistration upsert (User 기반 통일, 연속 결제 지원)
      await tx.classRegistration.upsert({
        where: {
          classId_userId: {
            classId: updated.classId,
            userId: childUserId,
          },
        },
        create: {
          classId: updated.classId,
          userId: childUserId,
          status: "active",
        },
        update: {
          status: "active",
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `[MOCK PAY] ClassRegistration upsert 완료: classId=${updated.classId}, userId=${childUserId}`,
      );

      // 5-5) MemberCredit 발급 (P1-3 v0.5 + PR-B CreditDomainService 위임)
      //   - DEV 환경에서 mockPay 호출 후 즉시 출석 처리 가능하도록 보장
      //   - product 정보 (durationDays/sessionsPerMonth/classId) 별도 조회 — ENROLLMENT_DETAIL_SELECT 에 미포함
      const productId = updated.product?.id;
      if (productId) {
        const product = await tx.classProduct.findUnique({
          where: { id: productId },
          select: {
            classId: true,
            durationDays: true,
            sessionsPerMonth: true,
            feeType: true,
            billingTiming: true,
            billingMonth: true,
          },
        });
        // [B4 정합] 후불 상품(billingTiming=POSTPAID)은 크레딧 미발급 — 출석×단가 월말 정산.
        //   webhook(isPostpaidClass)·토스(isPostpaidProduct) 가드와 동일. mock 경로만 누락돼
        //   DEV 에서 후불 선택분이 오발급되던 갭 해소 (Reviewer F-1).
        const isPostpaidProductMock = product?.billingTiming === "POSTPAID";
        if (product && product.sessionsPerMonth > 0 && !isPostpaidProductMock) {
          // [B7 정합] 선불 정액(MONTHLY_FIXED) 만료 = 결제한 그 달 말일 23:59:59 KST (약관 §13).
          //   KG이니시스 webhook · 토스 confirm 과 동일 분기 — 이 mock 경로만 구식
          //   (durationDays+30일)으로 남아 달력 월 귀속 정책과 어긋나 있었음.
          //   그 외 feeType 은 기존 정책 유지 (durationDays + 미사용 회차 사용 30일).
          const MEMBER_CREDIT_EXTRA_USABLE_DAYS = 30;
          const now = new Date();
          // [Lifecycle v4.1 §9.5] 월별 패키지(billingMonth 有)는 귀속월 창 — 실결제 2경로와 동일.
          const passWindow =
            product.feeType === "MONTHLY_FIXED" && product.billingMonth
              ? monthlyPassWindow(product.billingMonth)
              : null;
          const mockStartsAt = passWindow?.startsAt ?? null;
          const expiresAt =
            passWindow?.expiresAt ??
            (product.feeType === "MONTHLY_FIXED"
              ? endOfMonthKst(now)
              : (() => {
                  const durationDays = product.durationDays ?? 28;
                  const e = new Date(now);
                  e.setDate(
                    e.getDate() +
                      durationDays +
                      MEMBER_CREDIT_EXTRA_USABLE_DAYS,
                  );
                  e.setHours(23, 59, 59, 999);
                  return e;
                })());

          await this.creditDomain.issueFromPayment(tx, {
            paymentId: mockPayment.id,
            userId: childUserId,
            classId: product.classId,
            sessions: product.sessionsPerMonth,
            startsAt: mockStartsAt,
            expiresAt,
            sourceLabel: `[MOCK PAY] 수업권 발급 (enrollmentId: ${enrollmentId})`,
          });

          this.logger.log(
            `[MOCK PAY] MemberCredit 발급 완료: classId=${product.classId}, sessions=${product.sessionsPerMonth}, expiresAt=${expiresAt.toISOString()}`,
          );
        } else {
          this.logger.warn(
            `[MOCK PAY] MemberCredit 발급 skip: productId=${productId} 없음 · sessionsPerMonth=0 · 또는 후불(POSTPAID) 상품`,
          );
        }
      } else {
        this.logger.warn(
          `[MOCK PAY] MemberCredit 발급 skip: enrollment.product 없음 (enrollmentId=${enrollmentId})`,
        );
      }

      return updated;
    });

    this.logger.warn(
      `[MOCK PAY] 결제 우회 완료: enrollmentId=${enrollmentId}, userId=${userId}`,
    );

    return this.mapToEnrollmentResponse(updatedEnrollment);
  }

  // ================ Helper Methods ================

  /**
   * 선택 상품 검증 — 수업 소속 · 판매 가능(공용 가드) · 판매 월분 · 수업 결제방식과 timing 일치.
   *   BOTH 수업은 상품 선택이 필수. 통과 시 billingTiming, 미선택 시 null.
   */
  private async resolveSelectedProductTiming(
    classId: string,
    billingMode: string,
    salesOpenMonth: Date | null,
    classProductId?: string,
  ): Promise<SelectedProduct | null> {
    if (!classProductId) {
      // [B6] BOTH(선택형) 수업은 결제방식(선불 정액 / 후불)을 택1해야 하므로 상품 선택 필수.
      if (billingMode === "BOTH") {
        throw new BadRequestException("선불/후불을 선택해주세요.");
      }
      return null;
    }
    const product = await this.prisma.classProduct.findUnique({
      where: { id: classProductId },
      select: {
        classId: true,
        billingTiming: true,
        isActive: true,
        feeType: true,
        durationDays: true,
        billingMonth: true,
        price: true,
        sessionsPerMonth: true,
      },
    });
    if (!product || product.classId !== classId) {
      throw new BadRequestException("유효하지 않은 상품입니다.");
    }
    // 결제 개시 경로(payment-create)와 같은 판매 가능 규칙·문구
    const blockReason = assertPaymentAllowed({
      feeType: product.feeType,
      durationDays: product.durationDays,
      isActive: product.isActive,
    });
    if (blockReason) {
      throw new BadRequestException(
        PACKAGE_PAYMENT_BLOCK_MESSAGES[blockReason],
      );
    }
    if (
      product.billingMonth &&
      (!salesOpenMonth ||
        product.billingMonth.getTime() !== salesOpenMonth.getTime())
    ) {
      throw new BadRequestException(
        "판매 기간이 지난 상품입니다. 화면을 새로고침한 후 다시 시도해주세요.",
      );
    }
    if (
      (billingMode === "PREPAID" || billingMode === "POSTPAID") &&
      product.billingTiming !== billingMode
    ) {
      throw new BadRequestException("수업 결제 방식과 맞지 않는 상품입니다.");
    }
    return {
      billingTiming: product.billingTiming,
      price: product.price,
      sessionsPerMonth: product.sessionsPerMonth,
      feeType: product.feeType,
      durationDays: product.durationDays,
      billingMonth: product.billingMonth,
    };
  }

  /**
   * 무료(0원) 선불 등록 완료 — 결제사를 거치지 않고 우리 DB 상태만 확정한다.
   *  대회의 무료 참가(참가비 0 → 신청 즉시 PAID, Payment 미생성)와 같은 계약이며,
   *  결제 개시(payment-create)는 최소 100원을 요구하므로 0원은 애초에 그 경로를 타지 않는다.
   *  Payment 행은 만들지 않는다 — 돈이 오간 적이 없어 결제 이력·정산 집계 대상이 아니다.
   */
  private async completeFreeEnrollment(
    tx: Prisma.TransactionClient,
    input: {
      enrollmentId: string;
      classId: string;
      childId: string;
      /** 결제 이력의 소유자 — 신청한 학부모. */
      payerUserId: string;
      classProductId: string;
      fromStatuses: EnrollmentStatus[];
      product: Pick<
        SelectedProduct,
        "sessionsPerMonth" | "feeType" | "durationDays" | "billingMonth"
      > | null;
    },
  ): Promise<{ orderNumber: string }> {
    const now = new Date();
    // 0원 결제 이력 — 결제사 승인은 없지만 내부 원장에는 남긴다. 사용자가 결제 내역에서
    //   무엇을 신청했는지 확인할 수 있어야 하고, 취소·환불이 유료 건과 같은 흐름을 타야 한다.
    //   paymentMethod='free' 는 환불 엔진이 PG 호출을 건너뛰는 판정 키다(mock 과 같은 규약).
    const orderNumber = `FREE-${Date.now()}-${input.enrollmentId}`;
    const freePayment = await tx.payment.create({
      data: {
        orderNumber,
        userId: input.payerUserId,
        productId: input.classProductId,
        amount: 0,
        paymentStatus: "completed",
        paymentMethod: "free",
        pgProvider: "free",
        completedAt: now,
      },
      select: { id: true },
    });
    const moved = await tx.enrollment.updateMany({
      where: { id: input.enrollmentId, status: { in: input.fromStatuses } },
      data: {
        status: EnrollmentStatus.PAID,
        paidAt: now,
        paymentId: freePayment.id,
      },
    });
    if (moved.count !== 1) {
      throw new ConflictException("이미 처리된 수강신청입니다.");
    }
    await tx.classRegistration.upsert({
      where: {
        classId_userId: { classId: input.classId, userId: input.childId },
      },
      update: { status: "active" },
      create: {
        classId: input.classId,
        userId: input.childId,
        status: "active",
      },
    });
    // 발급형 상품만 수업권 발급 — 비발급(sessionsPerMonth=0, 1회용 수업 등)은 명단이 SoT.
    const sessions = input.product?.sessionsPerMonth ?? 0;
    if (sessions > 0) {
      const passWindow =
        input.product?.feeType === "MONTHLY_FIXED" && input.product.billingMonth
          ? monthlyPassWindow(input.product.billingMonth)
          : null;
      const expiresAt =
        passWindow?.expiresAt ??
        (input.product?.feeType === "MONTHLY_FIXED"
          ? endOfMonthKst(now)
          : (() => {
              const durationDays = input.product?.durationDays ?? 28;
              const e = new Date(now);
              e.setDate(
                e.getDate() + durationDays + MEMBER_CREDIT_EXTRA_USABLE_DAYS,
              );
              e.setHours(23, 59, 59, 999);
              return e;
            })());
      await this.creditDomain.issueFromPayment(tx, {
        paymentId: freePayment.id,
        userId: input.childId,
        classId: input.classId,
        sessions,
        startsAt: passWindow?.startsAt ?? null,
        expiresAt,
        sourceLabel: `무료 수업 수강권 발급 (enrollmentId: ${input.enrollmentId})`,
      });
    }
    return { orderNumber };
  }

  /**
   * 승인 대기 상태일 때만 갱신 — 조건부 update 가 0행이면 Prisma 는 P2025 를 던지는데, 이를
   *   404 가 아니라 "그 사이 처리됨" 409 로 돌려준다(재확인 조회와 update 사이의 틈까지 닫음).
   */
  private async updateIfStillPendingApproval(
    enrollmentId: string,
    data: Prisma.EnrollmentUncheckedUpdateInput,
  ) {
    try {
      return await this.prisma.enrollment.update({
        where: { id: enrollmentId, status: EnrollmentStatus.PENDING_APPROVAL },
        data,
        select: ENROLLMENT_DETAIL_SELECT,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new ConflictException("이미 처리된 수강신청입니다.");
      }
      throw err;
    }
  }

  /**
   * 좌석 잠금을 잡는 트랜잭션 실행 — 잠금 대기가 기본 timeout(5s)에 포함되므로 여유를 두고,
   *   잠금 대기 초과·풀 고갈은 재시도 가능한 409 로 바꾼다(그 외 예외는 그대로).
   */
  private async runEnrollmentTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        // P2028 잠금 대기 초과 · P2024 풀 고갈 · P2034 쓰기 충돌/교착 —
        //   모두 같은 요청을 다시 보내면 풀리는 일시적 경합이다.
        (err.code === "P2028" || err.code === "P2024" || err.code === "P2034")
      ) {
        throw new ConflictException(
          "신청이 몰려 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
        );
      }
      throw err;
    }
  }

  /**
   * 수강신청 조회 + 접근 권한 검증
   */
  private async findEnrollmentWithAccess(
    userId: string,
    enrollmentId: string,
  ): Promise<any> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: ENROLLMENT_DETAIL_SELECT,
    });

    if (!enrollment) {
      throw new NotFoundException("수강신청 정보를 찾을 수 없습니다.");
    }

    // 접근 권한 검증
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });

    if (!user) {
      throw new NotFoundException("사용자 정보를 찾을 수 없습니다.");
    }

    // 신청자 본인
    if (enrollment.requestedBy === userId) {
      return enrollment;
    }

    // 자녀 본인
    if (enrollment.childId === userId) {
      return enrollment;
    }

    // 학부모 (자녀의 보호자)
    if (user.userType === "PARENT") {
      const parentChild = await this.prisma.parentChild.findUnique({
        where: {
          parentId_childId: { parentId: userId, childId: enrollment.childId },
        },
      });

      if (parentChild) {
        return enrollment;
      }
    }

    throw new ForbiddenException("수강신청 정보에 접근할 수 없습니다.");
  }

  // calculateAge → @/common/utils/age.util 의 calculateKoreanAge 로 통합 (중복 제거)

  /**
   * Enrollment 엔티티를 Response DTO로 변환
   *
   * 입력 타입은 ENROLLMENT_DETAIL_SELECT 와 동기화 — Prisma 가 select 키 변경 시
   * 컴파일 타임에 매퍼 사용 필드와의 불일치를 잡아준다.
   */
  private mapToEnrollmentResponse(
    enrollment: Prisma.EnrollmentGetPayload<{
      select: typeof ENROLLMENT_DETAIL_SELECT;
    }>,
  ): EnrollmentResponseDto {
    const childProfile = enrollment.child?.childProfile;

    // 남은 시간 계산 (초)
    const now = new Date();
    const remainingMs = enrollment.expiresAt.getTime() - now.getTime();
    const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

    return {
      id: enrollment.id,
      // [2026-06-17] top-level 식별자 — FE 등록완료 판정(선택 자녀 필터)용. child.id/class.id 와 동일.
      childId: enrollment.childId,
      classId: enrollment.classId,
      child: {
        id: enrollment.childId,
        fullName: enrollment.child
          ? `${enrollment.child.lastName}${enrollment.child.firstName}`
          : "알 수 없음",
        age: childProfile
          ? calculateKoreanAge(new Date(childProfile.birthDate))
          : 0,
      },
      class: {
        id: enrollment.classId,
        className: enrollment.class?.className || "알 수 없음",
        clubName: enrollment.class?.team?.name || "알 수 없음",
        description: enrollment.class?.description ?? undefined,
        billingMode: enrollment.class?.billingMode ?? undefined,
      },
      product: enrollment.product
        ? {
            id: enrollment.product.id,
            productName: enrollment.product.productName,
            price: Number(enrollment.product.price),
            sessionsPerMonth: enrollment.product.sessionsPerMonth,
            feeType: enrollment.product.feeType ?? undefined,
            billingTiming: enrollment.product.billingTiming ?? undefined,
          }
        : undefined,
      requester: {
        id: enrollment.requestedBy,
        name: enrollment.requester
          ? `${enrollment.requester.lastName || ""}${enrollment.requester.firstName || ""}`
          : "알 수 없음",
        userType: enrollment.requester?.userType || "UNKNOWN",
      },
      requestType: enrollment.requestType,
      status: enrollment.status,
      approvedBy: enrollment.approvedBy ?? undefined,
      approvedAt: enrollment.approvedAt ?? undefined,
      rejectedAt: enrollment.rejectedAt ?? undefined,
      rejectionReason: enrollment.rejectionReason ?? undefined,
      paymentId: enrollment.paymentId ?? undefined,
      paidAt: enrollment.paidAt ?? undefined,
      requestedAt: enrollment.requestedAt,
      expiresAt: enrollment.expiresAt,
      note: enrollment.note ?? undefined,
      remainingSeconds,
    };
  }
}
