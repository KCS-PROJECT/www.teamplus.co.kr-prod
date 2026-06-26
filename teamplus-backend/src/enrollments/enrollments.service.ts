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
import { CreditDomainService } from "@/credits/credit-domain.service";
import { calculateKoreanAge } from "@/common/utils/age.util";
import {
  CreateEnrollmentDto,
  ApproveEnrollmentDto,
  RejectEnrollmentDto,
  EnrollmentResponseDto,
  EnrollmentStatus,
} from "./dto";

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
      include: {
        team: { select: { id: true, name: true } },
      },
    });

    if (!classInfo) {
      throw new NotFoundException("수업 정보를 찾을 수 없습니다.");
    }

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
        const birthYear = new Date(childProfile.birthDate).getFullYear();
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

    // 4. 상품 확인 (선택 사항) — 선택 시 billingTiming 을 캡처해 BOTH 선·후불 분기에 사용.
    let selectedProductTiming: string | null = null;
    if (dto.classProductId) {
      const product = await this.prisma.classProduct.findUnique({
        where: { id: dto.classProductId },
        select: { classId: true, billingTiming: true },
      });

      if (!product || product.classId !== dto.classId) {
        throw new BadRequestException("유효하지 않은 상품입니다.");
      }
      selectedProductTiming = product.billingTiming;
    }

    // 4-1. [B6] BOTH(선택형) 수업은 결제방식(선불 정액 / 후불)을 택1해야 하므로 상품 선택 필수.
    //   전용 PREPAID/POSTPAID 수업은 기존대로 상품 선택이 선택 사항.
    if (classInfo.billingMode === "BOTH" && !dto.classProductId) {
      throw new BadRequestException("선불/후불을 선택해주세요.");
    }

    // 5~6. 중복 신청 확인 + 정원 체크 + 수강신청 생성을 원자적으로 수행
    // - 중복/정원/생성 을 한 트랜잭션에 묶어 race condition (동시 신청으로 정원 초과 저장) 방지.
    // - 정원 기준: ClassRegistration.status='active' 개수 (실제 결제 완료·수강 중인 등록자)
    // - 정원 정책 상세: docs/Planning/PAYMENT_FEE_POLICY.md 및 대기자 시스템(Waitlist) 연계 참조.
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.ENROLLMENT_EXPIRY_HOURS);

    const enrollment = await this.prisma.$transaction(async (tx) => {
      const existingEnrollment = await tx.enrollment.findFirst({
        where: {
          childId: dto.childId,
          classId: dto.classId,
          status: {
            in: ["pending", "pending_approval", "approved", "paid"],
          },
        },
        select: { id: true, status: true, requestedBy: true, paymentId: true },
      });

      // [Phase B] 후불 여부 — 전용 POSTPAID 또는 BOTH(선택형)+후불 상품 선택.
      //   [B5c] BOTH+선불(PREPAID 상품)은 일반 결제대기(PENDING)로 흘러간다.
      //   (재활용 분기·신규 생성 분기 양쪽에서 쓰므로 블록 상단에서 1회 계산)
      const isPostpaid =
        classInfo.billingMode === "POSTPAID" ||
        (classInfo.billingMode === "BOTH" &&
          selectedProductTiming === "POSTPAID");

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
            await tx.payment.updateMany({
              where: {
                id: existingEnrollment.paymentId,
                paymentStatus: { not: "completed" },
              },
              data: { paymentStatus: "cancelled" },
            });
          }
          // 정원 가드 — 재활용 후불 전환도 새 active 좌석을 만들므로 신규 create 경로와
          //   동일 기준·동일 메시지로 정원 마감을 차단(본인 prepaid pending 은 active 아님 → 미집계).
          if (classInfo.capacity && classInfo.capacity > 0) {
            const activeCount = await tx.classRegistration.count({
              where: { classId: dto.classId, status: "active" },
            });
            if (activeCount >= classInfo.capacity) {
              throw new ConflictException(
                "수업 정원이 마감되었습니다. 대기 등록을 이용해주세요.",
              );
            }
          }

          const converted = await tx.enrollment.update({
            where: { id: existingEnrollment.id },
            data: {
              classProductId: dto.classProductId,
              status: EnrollmentStatus.APPROVED,
              paymentId: null,
              requestedBy: userId,
              requestType,
              expiresAt,
              note: dto.note,
            },
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

        // 그 외(approved/paid·PENDING_APPROVAL·후불 아님·재활용 불가) → 기존대로 차단.
        throw new ConflictException("이미 신청 중이거나 수강 중인 수업입니다.");
      }

      // 정원 초과 시 차단 (대기 등록은 별도 /api/v1/waitlist 엔드포인트 사용)
      if (classInfo.capacity && classInfo.capacity > 0) {
        const activeCount = await tx.classRegistration.count({
          where: { classId: dto.classId, status: "active" },
        });
        if (activeCount >= classInfo.capacity) {
          throw new ConflictException(
            "수업 정원이 마감되었습니다. 대기 등록을 이용해주세요.",
          );
        }
      }

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
          })
          .catch((err) =>
            this.logger.warn(
              `수강 요청 알림 발송 실패: parentId=${pc.parentId}, error=${err.message}`,
            ),
          );
      }
    }

    return this.mapToEnrollmentResponse(enrollment);
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

    return enrollments.map((e) => this.mapToEnrollmentResponse(e));
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

    // 결제 완료된 건은 취소 불가 (환불 절차 필요)
    if (enrollment.status === EnrollmentStatus.PAID) {
      throw new BadRequestException(
        "결제 완료된 수강신청은 환불 절차를 통해 취소해주세요.",
      );
    }

    // 이미 취소/거절/만료된 건
    if (
      [
        EnrollmentStatus.CANCELLED,
        EnrollmentStatus.REJECTED,
        EnrollmentStatus.EXPIRED,
      ].includes(enrollment.status as EnrollmentStatus)
    ) {
      throw new BadRequestException("이미 취소/거절/만료된 수강신청입니다.");
    }

    const cancelledEnrollment = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status: EnrollmentStatus.CANCELLED },
      select: { classId: true, childId: true },
    });

    // [Phase B] 수강 종료 — ClassRegistration inactive 처리(후불 active 등록 해지).
    //   선불(미결제 → active 등록 없음)은 매칭 행 없어 no-op.
    await this.prisma.classRegistration.updateMany({
      where: {
        classId: cancelledEnrollment.classId,
        userId: cancelledEnrollment.childId,
      },
      data: { status: "inactive" },
    });

    this.logger.log(`수강신청 취소 완료: enrollmentId=${enrollmentId}`);

    // 취소로 빈 자리 발생 → 대기자 자동 승격
    this.waitlistService
      .promoteNextWaitlist(cancelledEnrollment.classId)
      .catch((err) =>
        this.logger.warn(
          `대기자 승격 실패: classId=${cancelledEnrollment.classId}, error=${err.message}`,
        ),
      );
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
      await this.prisma.enrollment.update({
        where: { id: enrollmentId },
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

    // 5. 승인 처리
    const updatedEnrollment = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: EnrollmentStatus.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
        note: dto.note
          ? `${enrollment.note || ""}\n[승인메모] ${dto.note}`
          : enrollment.note,
      },
      select: ENROLLMENT_DETAIL_SELECT,
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

    // 4. 거절 처리
    const updatedEnrollment = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: EnrollmentStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: dto.reason,
      },
      select: ENROLLMENT_DETAIL_SELECT,
    });

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
          completedAt: new Date(),
        },
      });

      // 5-2) Enrollment → PAID 전환
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
          },
        });
        if (product && product.sessionsPerMonth > 0) {
          // 2026-05-22 정책 — 수업권 사용 기간 = durationDays + 미사용 회차 사용 30일.
          //   KG이니시스 webhook · 토스 confirm 흐름과 일관.
          const MEMBER_CREDIT_EXTRA_USABLE_DAYS = 30;
          const now = new Date();
          const durationDays = product.durationDays ?? 28;
          const expiresAt = new Date(now);
          expiresAt.setDate(
            expiresAt.getDate() +
              durationDays +
              MEMBER_CREDIT_EXTRA_USABLE_DAYS,
          );
          expiresAt.setHours(23, 59, 59, 999);

          await this.creditDomain.issueFromPayment(tx, {
            paymentId: mockPayment.id,
            userId: childUserId,
            classId: product.classId,
            sessions: product.sessionsPerMonth,
            expiresAt,
            sourceLabel: `[MOCK PAY] 수업권 발급 (enrollmentId: ${enrollmentId})`,
          });

          this.logger.log(
            `[MOCK PAY] MemberCredit 발급 완료: classId=${product.classId}, sessions=${product.sessionsPerMonth}, expiresAt=${expiresAt.toISOString()}`,
          );
        } else {
          this.logger.warn(
            `[MOCK PAY] MemberCredit 발급 skip: productId=${productId} 없음 또는 sessionsPerMonth=0`,
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
