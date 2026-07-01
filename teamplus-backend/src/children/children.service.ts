import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { RedisService } from "@/redis/redis.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { securityConfig } from "@/config/security.config";
import { calculateKoreanAge } from "@/common/utils/age.util";
import { Prisma } from "@prisma/client";
import {
  CreateChildDto,
  UpdateChildDto,
  ChildResponseDto,
  CreateChildConsentDto,
  ChildConsentResponseDto,
} from "./dto";

/** ClubMember 관계 타입 (mapParentChildToResponse 내부 사용) */
type ClubMemberWithClub = {
  id: string;
  teamId: string;
  approvalStatus: string;
  rejectionReason: string | null;
  playerLevel: string | null;
  joinedAt: Date;
  team: { id: string; name: string; logoUrl: string | null };
};

/** ParentChild + child + childProfile 타입 (mapParentChildToResponse 파라미터) */
type ParentChildWithChild = {
  relationship: string;
  isPrimary: boolean;
  createdAt: Date;
  child: {
    id: string;
    firstName: string;
    lastName: string;
    gender: string | null;
    note: string | null;
    email: string;
    phone: string | null;
    childProfile: {
      birthDate: Date;
      imageUrl: string | null;
    } | null;
    teamMembers?: ClubMemberWithClub[];
    clubMembers?: ClubMemberWithClub[];
  };
};

/**
 * Children 서비스
 *
 * 학부모-자녀 관계 관리:
 * - 자녀 등록 (학부모 대리 등록)
 * - 자녀 목록 조회
 * - 자녀 정보 수정
 * - 자녀 삭제
 *
 * 비즈니스 규칙:
 * - 자녀는 UserType=CHILD인 User로 생성됨
 * - ParentChild 테이블로 학부모-자녀 관계 관리
 * - 한 자녀에 여러 보호자 연결 가능 (부모, 조부모 등)
 * - 주 보호자(isPrimary)만 결제/승인 권한 보유
 */
@Injectable()
export class ChildrenService {
  private readonly logger = new Logger(ChildrenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * 2026-04-29: 자녀 mutation 후 학부모 dashboard 캐시 무효화.
   *
   * 학부모 대시보드 응답(`/dashboard/parent`)은 Redis 60s TTL 로 캐시되며 children 배열을 포함한다.
   * 자녀를 새로 등록·수정·삭제했을 때 이 캐시가 stale 상태로 남으면 학부모 대시보드의 자녀 셀렉터/안내 카드가
   * 실제 데이터와 어긋나므로 mutation 직후 명시적으로 invalidate 한다.
   *
   * - 캐시 무효화 실패는 핵심 트랜잭션 영향 X (다음 60초 내 자동 만료)
   * - 동일 패턴: attendance.service.ts invalidateDashboardCacheForMember
   *
   * @param parentId  학부모 User.id
   */
  private async invalidateParentDashboardCache(parentId: string) {
    try {
      await this.redis.del(`dashboard:parent:${parentId}`);
    } catch (e) {
      this.logger.warn(
        `[invalidateParentDashboardCache] failed for parentId=${parentId}: ${(e as Error).message}`,
      );
    }
  }

  /**
   * 자녀 팀 멤버십 생성/재활성화 (upsert).
   *
   * (userId, teamId) 는 @@unique 이므로, 과거 탈퇴(leftAt) 이력이 있는 팀에
   * 재가입할 때 create 하면 충돌한다. 기존 레코드가 있으면 재활성화(update),
   * 없으면 신규 create 하여 팀 변경/재가입(Phase 3)에서도 재사용 가능하게 한다.
   */
  private async upsertChildTeamMembership(
    tx: Prisma.TransactionClient,
    params: {
      childUserId: string;
      teamId: string;
      playerName: string;
      playerAge: number;
    },
  ): Promise<void> {
    const { childUserId, teamId, playerName, playerAge } = params;
    const existing = await tx.teamMember.findUnique({
      where: { userId_teamId: { userId: childUserId, teamId } },
      select: { id: true },
    });
    if (existing) {
      await tx.teamMember.update({
        where: { id: existing.id },
        data: {
          playerName,
          playerAge,
          approvalStatus: "pending",
          roleInTeam: "PLAYER",
          leftAt: null,
          rejectionReason: null,
          joinedAt: new Date(),
        },
      });
      return;
    }
    await tx.teamMember.create({
      data: {
        userId: childUserId,
        teamId,
        playerName,
        playerAge,
        approvalStatus: "pending",
        roleInTeam: "PLAYER",
        joinedAt: new Date(),
      },
    });
  }

  /**
   * 자녀 등록
   *
   * 학부모가 자녀를 대리 등록합니다.
   * 1. Child User 생성 (UserType=CHILD)
   * 2. ChildProfile 생성
   * 3. ParentChild 관계 생성
   */
  async createChild(
    parentId: string,
    dto: CreateChildDto,
  ): Promise<ChildResponseDto> {
    this.logger.log(
      `자녀 등록: parentId=${parentId}, name=${dto.lastName}${dto.firstName}`,
    );

    // 1. 학부모 확인
    const parent = await this.prisma.user.findUnique({
      where: { id: parentId },
      select: { id: true, userType: true, isVerified: true },
    });

    if (!parent) {
      throw new NotFoundException("학부모 정보를 찾을 수 없습니다.");
    }

    if (parent.userType !== "PARENT") {
      throw new ForbiddenException("학부모만 자녀를 등록할 수 있습니다.");
    }

    // 2. 본인인증 확인 (선택적 - 정책에 따라 주석 해제)
    // if (!parent.isVerified) {
    //   throw new ForbiddenException('본인인증을 완료한 후 자녀를 등록할 수 있습니다.');
    // }

    // 3. 생년월일 유효성 검사 (한국나이 기준)
    const birthDate = new Date(dto.birthDate);
    const today = new Date();
    const age = calculateKoreanAge(birthDate);

    if (birthDate > today) {
      throw new BadRequestException("생년월일은 오늘 이후일 수 없습니다.");
    }

    if (age < 3 || age > 18) {
      throw new BadRequestException(
        "자녀 나이는 3세 이상 18세 이하여야 합니다.",
      );
    }

    // 4. 한국나이 기반 TEEN/CHILD 자동 분류 (register()와 동일 로직)
    //    - CHILD: 한국나이 10세 미만 (어린이 UI · WCAG AAA · /child 대시보드)
    //    - TEEN:  한국나이 10세 이상 ~ 18세 (/teen 대시보드)
    const resolvedUserType = age < 10 ? "CHILD" : "TEEN";

    // 5. 자녀 개별 로그인 폐지 — email/password 미입력 시 내부 식별자 자동 생성
    const childEmail =
      dto.email?.trim() ||
      `child_${randomUUID().slice(0, 12)}@internal.teamplus.local`;
    const passwordHash = await bcrypt.hash(
      dto.password || randomUUID(),
      securityConfig.password.saltRounds,
    );

    // 6. 트랜잭션으로 User + ChildProfile + ParentChild (+ ClubMember pending) 생성
    const result = await this.prisma.$transaction(async (tx) => {
      // 6.1 email 중복 검사 — P2002 Unique Constraint 오류 사전 차단
      const emailConflict = await tx.user.findUnique({
        where: { email: childEmail },
        select: { id: true },
      });
      if (emailConflict) {
        throw new BadRequestException("이미 등록된 이메일입니다.");
      }

      // 6.2 phone 처리: 입력값이 있으면 중복 검사. 미입력 시 NULL 저장.
      if (dto.phone) {
        const phoneConflict = await tx.user.findUnique({
          where: { phone: dto.phone },
          select: { id: true },
        });
        if (phoneConflict) {
          throw new BadRequestException("이미 등록된 휴대폰 번호입니다.");
        }
      }

      // 6.3 자녀가 가입할 팀 결정 (Phase 1: 부모팀 자동상속 폐지 · 자녀별 팀 선택)
      //  - dto.teamId 지정 시 Team 존재 검증 후 PLAYER pending 멤버십 생성.
      //  - 미지정 시 팀 미소속(무소속) 자녀로 등록 — 멤버십 생성 안 함.
      let teamToJoin: { id: string; name: string } | null = null;
      if (dto.teamId) {
        const targetTeam = await tx.team.findUnique({
          where: { id: dto.teamId },
          select: { id: true, name: true },
        });
        if (!targetTeam) {
          throw new BadRequestException("선택하신 팀을 찾을 수 없습니다.");
        }
        teamToJoin = targetTeam;
      }

      // 6.4 Child User 생성
      const childUser = await tx.user.create({
        data: {
          email: childEmail,
          phone: dto.phone ?? null,
          passwordHash,
          userType: resolvedUserType,
          firstName: dto.firstName,
          lastName: dto.lastName,
          birthDate,
          koreanAge: age,
          ...(dto.gender !== undefined && { gender: dto.gender }),
          ...(dto.note !== undefined && { note: dto.note }),
          createdId: parentId,
        },
      });

      // 6.5 ChildProfile 생성 (birthDate + 선택 imageUrl)
      await tx.childProfile.create({
        data: {
          userId: childUser.id,
          birthDate,
          ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        },
      });

      // 6.6 ParentChild 관계 생성
      const parentChild = await tx.parentChild.create({
        data: {
          parentId,
          childId: childUser.id,
          relationship: dto.relationship || "parent",
          isPrimary: true, // 첫 등록자는 주 보호자
        },
      });

      // 6.7 팀 선택 시에만 PLAYER pending 멤버십 생성.
      //  upsert(재활성화) 패턴 — 과거 탈퇴 이력이 있는 팀 재가입(Phase 3) 시 unique 충돌 방지.
      if (teamToJoin) {
        await this.upsertChildTeamMembership(tx, {
          childUserId: childUser.id,
          teamId: teamToJoin.id,
          playerName: `${dto.lastName}${dto.firstName}`,
          playerAge: age,
        });
      }

      return { childUser, parentChild, teamToJoin };
    });

    this.logger.log(
      `자녀 등록 완료: childId=${result.childUser.id}` +
        (result.teamToJoin
          ? `, 팀 가입 pending: ${result.teamToJoin.name}`
          : ", 팀 미소속"),
    );

    // 학부모 dashboard 캐시 무효화 — children 배열이 stale 되어 안내 카드/셀렉터 표시가 어긋나는 문제 방지
    await this.invalidateParentDashboardCache(parentId);

    // 팀 가입(pending) 시 해당 팀 감독/코치 전원에게 가입 승인 요청 알림 (fire-and-forget)
    if (result.teamToJoin) {
      void this.notificationsService.notifyTeamManagers(result.teamToJoin.id, {
        notificationType: "membership_requested",
        title: "가입 승인 요청",
        message: `${dto.lastName}${dto.firstName} 님이 ${result.teamToJoin.name} 팀 가입을 신청했습니다.`,
        linkUrl: "/approval",
      });
    }

    return this.mapToChildResponse(
      result.childUser.id,
      dto.relationship || "parent",
      true,
    );
  }

  /**
   * 내 자녀 목록 조회
   *
   * ChildProfile 이 누락된 자녀는 로그 경고 후 스킵한다.
   * 단건 항목 누락이 전체 목록 조회 실패로 이어지지 않도록 방어한다.
   * (목록은 partial 허용, 단건 조회 getChild() 는 여전히 NotFoundException 유지)
   */
  async getMyChildren(parentId: string): Promise<ChildResponseDto[]> {
    this.logger.log(`내 자녀 목록 조회: parentId=${parentId}`);

    const parentChildren = await this.prisma.parentChild.findMany({
      where: {
        parentId,
        child: { status: { not: "WITHDRAWN" } },
      },
      include: {
        child: {
          include: {
            childProfile: true,
            teamMembers: {
              // 탈퇴(leftAt) 이력 제외 — 옛 팀이 현재 소속으로 오인되지 않도록(상세 조회와 일관).
              where: { leftAt: null },
              include: {
                team: {
                  select: { id: true, name: true, logoUrl: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return parentChildren
      .filter((pc) => {
        if (!pc.child.childProfile) {
          this.logger.warn(
            `자녀 프로필 누락으로 목록에서 제외: childId=${pc.child.id}, parentId=${parentId}`,
          );
          return false;
        }
        return true;
      })
      .map((pc) => this.mapParentChildToResponse(pc));
  }

  /**
   * 자녀 상세 조회
   */
  async getChild(parentId: string, childId: string): Promise<ChildResponseDto> {
    this.logger.log(`자녀 상세 조회: parentId=${parentId}, childId=${childId}`);

    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId, childId },
      },
      include: {
        child: {
          include: {
            childProfile: true,
            teamMembers: {
              // 탈퇴(leftAt) 이력은 제외 — 교체 정책에서 옛 팀이 '현재 팀'으로 오인되지 않도록.
              where: { leftAt: null },
              include: {
                team: {
                  select: { id: true, name: true, logoUrl: true },
                },
              },
            },
          },
        },
      },
    });

    if (!parentChild) {
      throw new NotFoundException("자녀 정보를 찾을 수 없습니다.");
    }

    return this.mapParentChildToResponse(parentChild);
  }

  /**
   * 자녀 정보 수정
   */
  async updateChild(
    parentId: string,
    childId: string,
    dto: UpdateChildDto,
  ): Promise<ChildResponseDto> {
    this.logger.log(`자녀 정보 수정: parentId=${parentId}, childId=${childId}`);

    // 1. 관계 확인 및 권한 검사
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId, childId },
      },
      include: {
        child: {
          include: { childProfile: true },
        },
      },
    });

    if (!parentChild) {
      throw new NotFoundException("자녀 정보를 찾을 수 없습니다.");
    }

    // 2. 주 보호자만 정보 수정 가능
    if (!parentChild.isPrimary) {
      throw new ForbiddenException(
        "주 보호자만 자녀 정보를 수정할 수 있습니다.",
      );
    }

    // 팀 변경으로 새 팀에 pending 재가입한 경우, 트랜잭션 후 해당 팀 감독/코치에게 알림하기 위해 캡처.
    let teamJoinNotice: {
      teamId: string;
      teamName: string;
      playerName: string;
    } | null = null;

    // 3. 트랜잭션으로 업데이트
    await this.prisma.$transaction(async (tx) => {
      // 3.1 User 업데이트 (firstName/lastName/phone/gender/note → User 테이블)
      if (
        dto.firstName ||
        dto.lastName ||
        dto.phone ||
        dto.gender !== undefined ||
        dto.note !== undefined
      ) {
        const userUpdateData: {
          firstName?: string;
          lastName?: string;
          gender?: string;
          note?: string;
          phone?: string;
          updatedId?: string;
        } = {};
        if (dto.firstName) userUpdateData.firstName = dto.firstName;
        if (dto.lastName) userUpdateData.lastName = dto.lastName;
        if (dto.gender !== undefined) userUpdateData.gender = dto.gender;
        if (dto.note !== undefined) userUpdateData.note = dto.note;
        if (dto.phone) {
          const phoneConflict = await tx.user.findFirst({
            where: { phone: dto.phone, NOT: { id: childId } },
            select: { id: true },
          });
          if (phoneConflict) {
            throw new BadRequestException("이미 등록된 휴대폰 번호입니다.");
          }
          userUpdateData.phone = dto.phone;
        }
        userUpdateData.updatedId = parentId;
        await tx.user.update({ where: { id: childId }, data: userUpdateData });
      }

      // 3.1b [2026-06-17] 이름 변경 시 TeamMember.playerName 동기화.
      //   playerName 은 가입 시점 스냅샷이라, 이름 변경 후 동기화하지 않으면 감독 회원 승인 내역 등
      //   playerName 소비처에 옛 이름이 남는다(생년월일은 ChildProfile 에서 가져와 갱신되는 것과 대비).
      //   활성 멤버십(leftAt null · pending/approved 포함) 전체를 현재 이름으로 갱신한다.
      if (dto.firstName || dto.lastName) {
        const newLastName = dto.lastName ?? parentChild.child.lastName;
        const newFirstName = dto.firstName ?? parentChild.child.firstName;
        await tx.teamMember.updateMany({
          where: { userId: childId, leftAt: null },
          data: { playerName: `${newLastName}${newFirstName}` },
        });
      }

      // 3.2 ChildProfile 업데이트 (birthDate / imageUrl)
      if (dto.birthDate !== undefined || dto.imageUrl !== undefined) {
        const profileUpdateData: {
          birthDate?: Date;
          imageUrl?: string | null;
        } = {};
        if (dto.birthDate !== undefined)
          profileUpdateData.birthDate = new Date(dto.birthDate);
        if (dto.imageUrl !== undefined)
          profileUpdateData.imageUrl = dto.imageUrl;
        await tx.childProfile.update({
          where: { userId: childId },
          data: profileUpdateData,
        });
      }

      // 3.3 ParentChild 관계 업데이트 (relationship/isPrimary)
      if (dto.relationship !== undefined || dto.isPrimary !== undefined) {
        const parentChildUpdateData: {
          relationship?: string;
          isPrimary?: boolean;
        } = {};
        if (dto.relationship !== undefined)
          parentChildUpdateData.relationship = dto.relationship;
        if (dto.isPrimary !== undefined)
          parentChildUpdateData.isPrimary = dto.isPrimary;
        await tx.parentChild.update({
          where: {
            parentId_childId: { parentId, childId },
          },
          data: parentChildUpdateData,
        });
      }

      // 3.4 팀 변경 (Phase 3 · 교체 정책)
      //   teamId 키가 전달된 경우에만 동작한다.
      //    · null    → 무소속 전환 (기존 활성 멤버십 전체 탈퇴)
      //    · 문자열  → 기존 활성 멤버십 탈퇴 후 해당 팀에 PLAYER pending 재가입
      //   미전송(undefined)이면 팀 멤버십을 건드리지 않는다.
      if (dto.teamId !== undefined) {
        // 기존 활성 멤버십(미탈퇴) 전체를 탈퇴 처리 — 자녀 1명=현재 1팀 정책.
        await tx.teamMember.updateMany({
          where: { userId: childId, leftAt: null },
          data: { leftAt: new Date() },
        });

        if (dto.teamId) {
          const targetTeam = await tx.team.findUnique({
            where: { id: dto.teamId },
            select: { id: true, name: true },
          });
          if (!targetTeam) {
            throw new BadRequestException("선택하신 팀을 찾을 수 없습니다.");
          }
          const lastName = dto.lastName ?? parentChild.child.lastName;
          const firstName = dto.firstName ?? parentChild.child.firstName;
          const playerName = `${lastName}${firstName}`;
          const birthDate = dto.birthDate
            ? new Date(dto.birthDate)
            : parentChild.child.childProfile?.birthDate;
          await this.upsertChildTeamMembership(tx, {
            childUserId: childId,
            teamId: dto.teamId,
            playerName,
            playerAge: birthDate ? calculateKoreanAge(new Date(birthDate)) : 0,
          });
          teamJoinNotice = {
            teamId: targetTeam.id,
            teamName: targetTeam.name,
            playerName,
          };
        }
      }
    });

    this.logger.log(`자녀 정보 수정 완료: childId=${childId}`);

    // 팀 변경(새 팀 pending 재가입) 시 새 팀 감독/코치 전원에게 가입 승인 요청 알림 (fire-and-forget)
    if (teamJoinNotice) {
      const notice: { teamId: string; teamName: string; playerName: string } =
        teamJoinNotice;
      void this.notificationsService.notifyTeamManagers(notice.teamId, {
        notificationType: "membership_requested",
        title: "가입 승인 요청",
        message: `${notice.playerName} 님이 ${notice.teamName} 팀 가입을 신청했습니다.`,
        linkUrl: "/approval",
      });
    }

    return this.getChild(parentId, childId);
  }

  /**
   * 자녀 삭제 (관계 해제)
   *
   * 주의: 실제 User는 삭제하지 않고 ParentChild 관계만 해제합니다.
   * 다른 보호자가 있으면 관계만 해제, 없으면 자녀 데이터도 삭제.
   */
  async deleteChild(parentId: string, childId: string): Promise<void> {
    this.logger.log(`자녀 삭제: parentId=${parentId}, childId=${childId}`);

    // 1. 관계 확인 (child 정보 포함 — soft delete 시 email/phone 접근 필요)
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId, childId },
      },
      include: {
        child: {
          select: { id: true, email: true, phone: true },
        },
      },
    });

    if (!parentChild) {
      throw new NotFoundException("자녀 정보를 찾을 수 없습니다.");
    }

    // 2. 주 보호자만 삭제 가능
    if (!parentChild.isPrimary) {
      throw new ForbiddenException(
        "주 보호자만 자녀 정보를 삭제할 수 있습니다.",
      );
    }

    const child = parentChild.child;

    // 3. 다른 보호자 확인
    const otherGuardians = await this.prisma.parentChild.count({
      where: {
        childId,
        parentId: { not: parentId },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      if (otherGuardians > 0) {
        // 3.1 다른 보호자가 있으면 관계만 해제 + 다른 보호자를 주 보호자로
        await tx.parentChild.delete({
          where: {
            parentId_childId: { parentId, childId },
          },
        });

        // 다른 보호자 중 첫 번째를 주 보호자로 설정
        const nextPrimary = await tx.parentChild.findFirst({
          where: { childId },
          orderBy: { createdAt: "asc" },
        });

        if (nextPrimary) {
          await tx.parentChild.update({
            where: { id: nextPrimary.id },
            data: { isPrimary: true },
          });
        }
      } else {
        // 3.2 다른 보호자가 없으면 자녀를 soft delete (status=WITHDRAWN)
        // 진행 중인 수강신청이 있는지 확인
        const activeEnrollments = await tx.enrollment.count({
          where: {
            childId,
            status: { in: ["pending", "pending_approval", "approved"] },
          },
        });

        if (activeEnrollments > 0) {
          throw new BadRequestException(
            "진행 중인 수강신청이 있어 삭제할 수 없습니다. 먼저 수강신청을 취소해주세요.",
          );
        }

        // ParentChild 관계 삭제 (관계 자체는 의미 없음)
        await tx.parentChild.deleteMany({
          where: { childId },
        });

        // [2026-06-18] 팀 멤버십도 함께 종료(leftAt) — 자녀 삭제 후 감독 회원 승인 내역·선수 관리에
        //   '유령' 멤버로 남지 않도록. (getTeamMembers 는 leftAt/WITHDRAWN 이중 필터)
        await tx.teamMember.updateMany({
          where: { userId: childId, leftAt: null },
          data: { leftAt: new Date() },
        });

        // User soft delete — status 변경 + email/phone 충돌 방지 prefix
        // ChildProfile은 그대로 유지 (PIPA Phase 2에서 비식별화)
        await tx.user.update({
          where: { id: childId },
          data: {
            status: "WITHDRAWN",
            withdrawRequestedAt: new Date(),
            withdrawProcessedAt: new Date(),
            withdrawReason: "학부모에 의한 자녀 삭제",
            email: `deleted_${childId}_${child.email}`,
            phone: child.phone ? `deleted_${childId}_${child.phone}` : null,
          },
        });
      }
    });

    this.logger.log(`자녀 삭제 완료: childId=${childId}`);
  }

  /**
   * 보호자 추가
   *
   * 기존 자녀에 다른 보호자를 추가합니다.
   */
  async addGuardian(
    primaryParentId: string,
    childId: string,
    newGuardianId: string,
    relationship: string,
  ): Promise<void> {
    this.logger.log(
      `보호자 추가: childId=${childId}, newGuardianId=${newGuardianId}`,
    );

    // 1. 주 보호자 확인
    const primaryRelation = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: primaryParentId, childId },
      },
    });

    if (!primaryRelation || !primaryRelation.isPrimary) {
      throw new ForbiddenException(
        "주 보호자만 다른 보호자를 추가할 수 있습니다.",
      );
    }

    // 2. 새 보호자가 학부모인지 확인
    const newGuardian = await this.prisma.user.findUnique({
      where: { id: newGuardianId },
      select: { id: true, userType: true },
    });

    if (!newGuardian || newGuardian.userType !== "PARENT") {
      throw new BadRequestException(
        "보호자는 학부모 유형의 사용자만 가능합니다.",
      );
    }

    // 3. 이미 등록된 보호자인지 확인
    const existing = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId: newGuardianId, childId },
      },
    });

    if (existing) {
      throw new ConflictException("이미 등록된 보호자입니다.");
    }

    // 4. 보호자 관계 생성
    await this.prisma.parentChild.create({
      data: {
        parentId: newGuardianId,
        childId,
        relationship,
        isPrimary: false, // 추가 보호자는 주 보호자가 아님
      },
    });

    this.logger.log(
      `보호자 추가 완료: childId=${childId}, guardianId=${newGuardianId}`,
    );
  }

  /**
   * 자녀 연결 해제
   *
   * 학부모-자녀 관계(ParentChild)만 삭제합니다.
   * 자녀 계정 자체는 유지됩니다.
   * 마지막 보호자인 경우 거부합니다 (자녀에게 최소 1명의 보호자 필요).
   */
  async unlinkChild(parentId: string, childId: string): Promise<void> {
    this.logger.log(`자녀 연결 해제: parentId=${parentId}, childId=${childId}`);

    // 1. 관계 확인
    const parentChild = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId, childId },
      },
    });

    if (!parentChild) {
      throw new NotFoundException("자녀 연결 정보를 찾을 수 없습니다.");
    }

    // 2. 보호자 수 확인 — 마지막 보호자이면 거부
    const guardianCount = await this.prisma.parentChild.count({
      where: { childId },
    });

    if (guardianCount <= 1) {
      throw new BadRequestException(
        "마지막 보호자는 연결을 해제할 수 없습니다. 자녀에게 최소 1명의 보호자가 필요합니다.",
      );
    }

    // 3. 관계 삭제
    await this.prisma.parentChild.delete({
      where: {
        parentId_childId: { parentId, childId },
      },
    });

    // 4. 삭제한 보호자가 주 보호자였으면 다른 보호자를 주 보호자로 승격
    if (parentChild.isPrimary) {
      const nextPrimary = await this.prisma.parentChild.findFirst({
        where: { childId },
        orderBy: { createdAt: "asc" },
      });

      if (nextPrimary) {
        await this.prisma.parentChild.update({
          where: { id: nextPrimary.id },
          data: { isPrimary: true },
        });
      }
    }

    this.logger.log(`자녀 연결 해제 완료: childId=${childId}`);
  }

  // ================ Helper Methods ================
  // calculateAge → @/common/utils/age.util 의 calculateKoreanAge 로 통합 (중복 제거)

  /**
   * ParentChild 엔티티를 ChildResponseDto로 변환
   */
  private mapParentChildToResponse(
    parentChild: ParentChildWithChild,
  ): ChildResponseDto {
    const child = parentChild.child;
    const profile = child.childProfile;

    if (!profile) {
      throw new NotFoundException("자녀 프로필 정보가 없습니다.");
    }

    const age = calculateKoreanAge(new Date(profile.birthDate));

    return {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      fullName: `${child.lastName}${child.firstName}`,
      birthDate: profile.birthDate,
      age,
      gender: child.gender ?? undefined,
      note: child.note ?? undefined,
      email: child.email,
      phone: child.phone ?? undefined,
      imageUrl: profile.imageUrl ?? undefined,
      relationship: parentChild.relationship,
      isPrimary: parentChild.isPrimary,
      createdAt: parentChild.createdAt,
      clubMemberships: child.teamMembers?.map((cm: ClubMemberWithClub) => ({
        id: cm.id,
        teamId: cm.team.id,
        clubName: cm.team.name,
        teamLogoUrl: cm.team.logoUrl ?? undefined,
        approvalStatus: cm.approvalStatus,
        rejectionReason: cm.rejectionReason ?? undefined,
        playerLevel: cm.playerLevel ?? undefined,
        joinedAt: cm.joinedAt,
      })),
    };
  }

  /**
   * 신규 생성된 자녀 정보를 ChildResponseDto로 변환
   */
  private async mapToChildResponse(
    childId: string,
    relationship: string,
    isPrimary: boolean,
  ): Promise<ChildResponseDto> {
    const child = await this.prisma.user.findUnique({
      where: { id: childId },
      include: {
        childProfile: true,
        teamMembers: {
          include: {
            team: {
              select: { id: true, name: true, logoUrl: true },
            },
          },
        },
      },
    });

    if (!child || !child.childProfile) {
      throw new NotFoundException("자녀 정보를 찾을 수 없습니다.");
    }

    const profile = child.childProfile;
    const age = calculateKoreanAge(new Date(profile.birthDate));

    return {
      id: child.id,
      firstName: child.firstName,
      lastName: child.lastName,
      fullName: `${child.lastName}${child.firstName}`,
      birthDate: profile.birthDate,
      age,
      gender: child.gender ?? undefined,
      note: child.note ?? undefined,
      email: child.email,
      phone: child.phone ?? undefined,
      imageUrl: profile.imageUrl ?? undefined,
      relationship,
      isPrimary,
      createdAt: profile.createdAt,
      clubMemberships: child.teamMembers?.map((cm: ClubMemberWithClub) => ({
        id: cm.id,
        teamId: cm.team.id,
        clubName: cm.team.name,
        teamLogoUrl: cm.team.logoUrl ?? undefined,
        approvalStatus: cm.approvalStatus,
        rejectionReason: cm.rejectionReason ?? undefined,
        playerLevel: cm.playerLevel ?? undefined,
        joinedAt: cm.joinedAt,
      })),
    };
  }

  /**
   * 자녀 연간 수업 이력 조회
   * ClassAttendance(memberId=childUserId) + ClassSchedule + Class 조인
   */
  async getChildClassHistory(
    requesterId: string,
    requesterType: string,
    childId: string,
    year: string,
  ) {
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new BadRequestException("유효하지 않은 연도입니다.");
    }

    // 접근 권한: PARENT(자신의 자녀만), COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN
    const allowedRoles = ["COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN"];
    if (requesterType === "PARENT") {
      const link = await this.prisma.parentChild.findFirst({
        where: { parentId: requesterId, childId },
        select: { id: true },
      });
      if (!link)
        throw new ForbiddenException("본인의 자녀 정보만 조회할 수 있습니다.");
    } else if (!allowedRoles.includes(requesterType)) {
      throw new ForbiddenException("접근 권한이 없습니다.");
    }

    const yearStart = new Date(yearNum, 0, 1);
    const yearEnd = new Date(yearNum + 1, 0, 1);

    // 연도 필터는 실제 수업일(scheduledDate) 기준 — 레코드 생성일(createdAt)이 아님.
    // 월 분류/표시가 checkedInAt ?? scheduledDate 이므로 필터도 수업일로 맞춰야
    // 작년 수업이 올해로 잡히는 연도 오분류를 막는다.
    const attendances = await this.prisma.classAttendance.findMany({
      where: {
        memberId: childId,
        schedule: {
          scheduledDate: { gte: yearStart, lt: yearEnd },
        },
      },
      select: {
        attendanceStatus: true,
        checkedInAt: true,
        creditDeducted: true,
        schedule: {
          select: {
            scheduledDate: true,
            class: { select: { className: true } },
          },
        },
      },
      orderBy: { schedule: { scheduledDate: "asc" } },
    });

    // 월별 그룹핑
    const monthMap = new Map<
      number,
      Array<{
        name: string;
        attendedAt: string;
        creditUsed: boolean;
        status: string;
      }>
    >();

    for (const a of attendances) {
      const date = a.checkedInAt ?? a.schedule.scheduledDate;
      const month = date.getMonth() + 1;
      if (!monthMap.has(month)) monthMap.set(month, []);
      monthMap.get(month)!.push({
        name: a.schedule.class.className,
        attendedAt: date.toISOString(),
        creditUsed: a.creditDeducted,
        status: a.attendanceStatus,
      });
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([month, classes]) => ({ month, classes }));
  }

  // ====================================================================
  // L-10 (2026-05-22) — 만 14세 미만 자녀 법정대리인 동의 저장 API
  //
  // PIPA(개인정보보호법) §22조 + 정통망법 §31조2 근거.
  // - 생성: POST /api/v1/children/consent  → createChildConsent()
  // - 조회: GET  /api/v1/children/:childId/consent → getChildConsent()
  // - 철회: POST /api/v1/children/:childId/consent/revoke → revokeChildConsent()
  // ====================================================================

  /**
   * 자녀 법정대리인 동의 저장 (PARENT 전용).
   *
   * 검증:
   *  1) child 존재 + userType === 'CHILD' + birthDate 존재
   *  2) parentChild 관계 확인 (요청자가 해당 자녀의 보호자인지)
   *  3) child 만나이 ≥ 14세 → BadRequest (동의 불요 — 본인 직접 동의)
   *  4) consentPersonalInfo === true 필수 (선택동의 2개는 false 허용)
   *  5) 동일 (guardian, child) 쌍의 활성 동의가 이미 있으면 ConflictException
   */
  async createChildConsent(
    parentId: string,
    dto: CreateChildConsentDto,
    meta: { ipAddress?: string; userAgent?: string } = {},
  ): Promise<ChildConsentResponseDto> {
    // 1) 자녀 + ChildProfile 조회
    const child = await this.prisma.user.findUnique({
      where: { id: dto.childUserId },
      select: {
        id: true,
        userType: true,
        childProfile: { select: { birthDate: true } },
      },
    });
    if (!child) {
      throw new NotFoundException("자녀를 찾을 수 없습니다.");
    }
    if (child.userType !== "CHILD") {
      throw new BadRequestException(
        "만 14세 미만 자녀에 대한 동의만 저장할 수 있습니다.",
      );
    }
    if (!child.childProfile?.birthDate) {
      throw new BadRequestException("자녀 출생일이 등록되어 있지 않습니다.");
    }

    // 2) 보호자 관계 검증
    const relation = await this.prisma.parentChild.findUnique({
      where: {
        parentId_childId: { parentId, childId: dto.childUserId },
      },
      select: { id: true },
    });
    if (!relation) {
      throw new ForbiddenException(
        "해당 자녀의 보호자만 동의를 저장할 수 있습니다.",
      );
    }

    // 3) 만나이 계산 (14세 미만 검증)
    const now = new Date();
    const birth = child.childProfile.birthDate;
    const ageMonths =
      (now.getFullYear() - birth.getFullYear()) * 12 +
      (now.getMonth() - birth.getMonth()) -
      (now.getDate() < birth.getDate() ? 1 : 0);
    if (ageMonths >= 14 * 12) {
      throw new BadRequestException(
        "만 14세 이상은 본인이 직접 동의해야 합니다.",
      );
    }

    // 4) 필수 동의 검증
    if (!dto.consentPersonalInfo) {
      throw new BadRequestException("개인정보 수집·이용 동의는 필수입니다.");
    }

    // 5) 중복 활성 동의 차단
    const existing = await this.prisma.childConsent.findFirst({
      where: {
        guardianUserId: parentId,
        childUserId: dto.childUserId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        "해당 자녀에 대한 활성 법정대리인 동의가 이미 존재합니다.",
      );
    }

    // 6) AppSettings 의 termsVersion / privacyVersion 스냅샷 (없으면 dto fallback)
    const appSettings = await this.prisma.appSettings.findFirst({
      select: { termsVersion: true, privacyVersion: true },
    });
    const termsVersion =
      dto.termsVersion ?? appSettings?.termsVersion ?? "1.0";
    const privacyVersion =
      dto.privacyVersion ?? appSettings?.privacyVersion ?? "1.0";

    const created = await this.prisma.childConsent.create({
      data: {
        guardianUserId: parentId,
        childUserId: dto.childUserId,
        childAgeMonths: ageMonths,
        termsVersion,
        privacyVersion,
        consentPersonalInfo: dto.consentPersonalInfo,
        consentThirdParty: dto.consentThirdParty,
        consentMarketing: dto.consentMarketing,
        verificationMethod: dto.verificationMethod,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
      select: {
        id: true,
        guardianUserId: true,
        childUserId: true,
        childAgeMonths: true,
        termsVersion: true,
        privacyVersion: true,
        consentPersonalInfo: true,
        consentThirdParty: true,
        consentMarketing: true,
        verificationMethod: true,
        revokedAt: true,
        signedAt: true,
      },
    });

    this.logger.log(
      `[L-10] ChildConsent 저장: guardian=${parentId}, child=${dto.childUserId}, ageMonths=${ageMonths}`,
    );

    return created;
  }

  /** 자녀에 대한 최신 활성 동의 1건 조회. 없으면 404. */
  async getChildConsent(
    parentId: string,
    childId: string,
  ): Promise<ChildConsentResponseDto> {
    // 보호자 관계 검증
    const relation = await this.prisma.parentChild.findUnique({
      where: { parentId_childId: { parentId, childId } },
      select: { id: true },
    });
    if (!relation) {
      throw new ForbiddenException(
        "해당 자녀의 보호자만 동의를 조회할 수 있습니다.",
      );
    }

    const consent = await this.prisma.childConsent.findFirst({
      where: {
        guardianUserId: parentId,
        childUserId: childId,
        revokedAt: null,
      },
      orderBy: { signedAt: "desc" },
      select: {
        id: true,
        guardianUserId: true,
        childUserId: true,
        childAgeMonths: true,
        termsVersion: true,
        privacyVersion: true,
        consentPersonalInfo: true,
        consentThirdParty: true,
        consentMarketing: true,
        verificationMethod: true,
        revokedAt: true,
        signedAt: true,
      },
    });
    if (!consent) {
      throw new NotFoundException(
        "법정대리인 동의 정보를 찾을 수 없습니다.",
      );
    }
    return consent;
  }

  /** 동의 철회 — revokedAt 갱신. 이미 철회된 경우 noop. */
  async revokeChildConsent(
    parentId: string,
    childId: string,
  ): Promise<{ revokedAt: Date }> {
    const consent = await this.prisma.childConsent.findFirst({
      where: {
        guardianUserId: parentId,
        childUserId: childId,
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!consent) {
      throw new NotFoundException(
        "철회할 활성 동의가 없습니다.",
      );
    }
    const now = new Date();
    await this.prisma.childConsent.update({
      where: { id: consent.id },
      data: { revokedAt: now },
    });
    this.logger.log(
      `[L-10] ChildConsent 철회: guardian=${parentId}, child=${childId}`,
    );
    return { revokedAt: now };
  }
}
