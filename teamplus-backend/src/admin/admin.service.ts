import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as XLSX from "xlsx";
import * as os from "os";
import * as http from "http";
import { PrismaService } from "../prisma/prisma.service";
import { CreditDomainService } from "@/credits/credit-domain.service";
import { NotificationsService } from "../notifications/notifications.service";
import { UserType, Prisma } from "@prisma/client";
import { isAdminRole } from "../auth/constants/chldiv.constants";
import {
  encryptField,
  decryptField,
  isEncryptedField,
} from "@/common/utils/field-encryption.util";
import { resolveManagedTeamIds } from "@/common/utils/team-scope.util";
import Redis from "ioredis";

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly creditDomain: CreditDomainService, // PR-B (v0.5): 관리자 일괄 발급 단일 진입점
  ) {}

  /**
   * Settlement 레코드의 bankAccount 필드를 복호화하여 반환.
   * 이미 평문(미암호화)인 경우 그대로 반환 (마이그레이션 호환).
   */
  private decryptSettlementBankAccount<
    T extends { bankAccount?: string | null },
  >(settlement: T): T {
    if (settlement.bankAccount && isEncryptedField(settlement.bankAccount)) {
      try {
        return {
          ...settlement,
          bankAccount: decryptField(settlement.bankAccount),
        };
      } catch {
        // 복호화 실패 시 원본 유지 (키 변경 등 예외 상황)
        return settlement;
      }
    }
    return settlement;
  }

  // ==================== 사용자 관리 ====================

  /**
   * 전체 사용자 목록 조회 (페이지네이션)
   */
  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    userType?: UserType;
    isVerified?: boolean;
  }) {
    const { page = 1, limit = 20, search, userType, isVerified } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {};

    if (search) {
      where.OR = [
        { email: { contains: search } },
        { phone: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }

    if (userType) {
      // 다중 타입 지원 (콤마 구분): TEEN,CHILD
      const typeStr = String(userType);
      if (typeStr.includes(",")) {
        where.userType = {
          in: typeStr.split(",").map((t) => t.trim()) as UserType[],
        };
      } else {
        where.userType = userType;
      }
    } else {
      // userType 미지정 시 ADMIN 제외
      where.NOT = { userType: UserType.ADMIN };
    }

    // [추가 2026-05-12] 탈퇴/삭제 회원은 어드민 회원 관리 리스트에서 제외.
    //  - parent 가 자녀를 삭제하거나 회원이 탈퇴하면 status='WITHDRAWN' 으로 soft delete 됨.
    //  - 이런 사용자는 email/phone 에 `deleted_*`/`withdrawn_*` prefix 가 붙어 노출 의미가 없음.
    where.status = { notIn: ["WITHDRAWN", "WITHDRAW_PENDING"] };

    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          userType: true,
          isVerified: true,
          koreanAge: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
          coachProfile: {
            select: {
              teamId: true,
              team: { select: { name: true, teamCode: true } },
            },
          },
          // [수정 2026-05-07] approvalStatus 미필터 — admin 페이지에서 pending/approved/rejected 모두 표기 필요
          //  이전엔 approved 만 select 해서 대기중인 학생의 팀이 "-" 로 표시되던 문제 해소.
          teamMembers: {
            where: { leftAt: null },
            select: {
              roleInTeam: true,
              approvalStatus: true,
              team: { select: { id: true, name: true } },
            },
          },
          // [추가 2026-05-12] DIRECTOR 가 운영하는(Team.coachId=self) 팀 — TeamMember 와 별개.
          //  관리자 페이지 팀별 그룹핑에서 임감독이 블리자드/타이탄스 양쪽에 표시되도록.
          managedTeams: { select: { id: true, name: true } },
          // [추가 2026-05-13] ACADEMY_DIRECTOR 가 운영하는 오픈클래스(Academy).
          //  팀(Team) 과 별개 체계라 teamIds 와 다른 academyIds/academyNames 로 응답.
          //  admin coaches 페이지에서 앜뎀이 같은 academy 감독을 "오픈클래스" 그룹에 노출하기 위함.
          managedAcademies: {
            where: { isActive: true },
            select: { id: true, name: true },
          },
          parentChildren: {
            select: {
              child: {
                select: {
                  teamMembers: {
                    where: { leftAt: null },
                    select: {
                      approvalStatus: true,
                      team: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
          childParents: {
            select: {
              parent: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                  phone: true,
                  // [추가 2026-05-07] 학생 팀 폴백 — 본인 TeamMember 없을 때 부모 팀 표시
                  teamMembers: {
                    where: { leftAt: null, approvalStatus: "approved" },
                    select: {
                      team: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
          _count: {
            select: {
              teamMembers: true,
              payments: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users.map((u) => {
        // 본인이 속한 팀 (TeamMember.team) — 모든 status 포함
        const ownTeams = (u.teamMembers ?? [])
          .map((tm) => tm.team)
          .filter((t): t is { id: string; name: string } =>
            Boolean(t?.id && t?.name),
          );
        // [추가 2026-05-12] DIRECTOR 가 운영하는(Team.coachId=self) 팀
        //  TeamMember 와 별개로 Team.coachId 로만 연결된 케이스 누락 방지.
        const managedTeamsList = (u.managedTeams ?? []).filter(
          (t): t is { id: string; name: string } => Boolean(t?.id && t?.name),
        );
        // 학부모일 때 자녀의 팀 매핑
        const childTeams = (u.parentChildren ?? [])
          .flatMap((pc) => pc.child?.teamMembers ?? [])
          .map((tm) => tm.team)
          .filter((t): t is { id: string; name: string } =>
            Boolean(t?.id && t?.name),
          );
        // [추가 2026-05-07] 학생일 때 부모 팀 폴백 — 본인 팀 없으면 부모 팀 사용
        const parentTeams = (u.childParents ?? [])
          .flatMap((cp) => cp.parent?.teamMembers ?? [])
          .map((tm) => tm.team)
          .filter((t): t is { id: string; name: string } =>
            Boolean(t?.id && t?.name),
          );

        // 우선순위: 본인 팀(직접 가입) + 운영 팀(감독) > 부모 팀(학생) > 자녀 팀(학부모)
        const primaryTeams =
          ownTeams.length || managedTeamsList.length
            ? [...ownTeams, ...managedTeamsList]
            : parentTeams.length
              ? parentTeams
              : childTeams;
        // 중복 제거 (같은 팀 ID 한 번만)
        const teamMap = new Map<string, string>();
        for (const t of primaryTeams) teamMap.set(t.id, t.name);
        // [추가 2026-05-12] teamIds — 프론트 그룹핑용. teamName 은 호환 위해 유지.
        const teamIds = Array.from(teamMap.keys());
        const teamNames = Array.from(teamMap.values());
        const teamName = teamNames.join(", ") || "";

        // [추가 2026-05-13] managedAcademies — ACADEMY_DIRECTOR 의 운영 오픈클래스.
        //  Academy 는 Team 과 별개 체계지만 admin coaches 페이지에서 그룹 노출용으로 함께 응답.
        const academyIds = (u.managedAcademies ?? [])
          .map((a) => a.id)
          .filter((id): id is string => Boolean(id));
        const academyNames = (u.managedAcademies ?? [])
          .map((a) => a.name)
          .filter((n): n is string => Boolean(n));

        // [추가 2026-05-07] approvalStatus 노출 — 학생 본인 TeamMember 가 있으면 그 status 사용
        // (없으면 빈 문자열 = 가입 이력 없음)
        const approvalStatus = (u.teamMembers ?? [])[0]?.approvalStatus ?? "";

        return {
          ...u,
          name: `${u.lastName ?? ""}${u.firstName ?? ""}`.trim(),
          coachTeamName: u.coachProfile?.team?.teamCode?.includes("ACADEMY")
            ? ""
            : (u.coachProfile?.team?.name ?? ""),
          // [수정 2026-05-13] ACADEMY_DIRECTOR 의 managedAcademies 우선,
          //  없으면 coachProfile.team(레거시) 폴백.
          academyName:
            academyNames.length > 0
              ? academyNames.join(", ")
              : u.coachProfile?.team?.teamCode?.includes("ACADEMY")
                ? (u.coachProfile?.team?.name ?? "")
                : "",
          teamName, // 사용자가 어느 팀(들)에 속하는지 — 학생일 땐 부모팀 폴백 포함
          // [추가 2026-05-12] teamIds — admin 프론트의 팀별 그룹핑용
          teamIds,
          // [추가 2026-05-13] academyIds/academyNames — ACADEMY_DIRECTOR 운영 오픈클래스
          academyIds,
          academyNames,
          approvalStatus, // [신규] 학생 본인 TeamMember 의 approval_status
          childrenCount: u.parentChildren?.length ?? 0,
          parentName: u.childParents?.[0]?.parent
            ? `${u.childParents[0].parent.lastName ?? ""}${u.childParents[0].parent.firstName ?? ""}`.trim()
            : "",
          parentEmail: u.childParents?.[0]?.parent?.email ?? "",
          parentPhone: u.childParents?.[0]?.parent?.phone ?? "",
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 사용자 정보 수정
   */
  async updateUser(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      age?: number;
    },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다.");

    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.age !== undefined) updateData.koreanAge = data.age;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        koreanAge: true,
      },
    });

    return updated;
  }

  /**
   * 사용자 상세 조회
   */
  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        parentProfile: true,
        coachProfile: { include: { team: true } },
        childProfile: true,
        teamMembers: { include: { team: true } },
        memberLevel: true,
        _count: {
          select: {
            payments: true,
            memberCredits: true,
            attendances: true,
            notifications: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    return user;
  }

  /**
   * 사용자 타입 변경
   */
  async updateUserType(userId: string, userType: UserType) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 관리자 계정(ADMIN/SYSTEM/OPER)의 역할은 변경 불가
    if (isAdminRole(user.userType)) {
      throw new BadRequestException(
        "시스템 관리자 계정의 역할은 변경할 수 없습니다.",
      );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { userType },
    });
  }

  /**
   * 사용자 하드 삭제 — Cascade 차단 정책 (2026-05-12 정책 변경).
   *
   * 정책: "DIRECTOR/PARENT 삭제 시 산하 팀멤버/자녀가 한 명이라도 있으면 삭제 불가"
   *   - DIRECTOR/ACADEMY_DIRECTOR: 본인이 운영하는(coachId=self) 팀에 본인 외 다른 멤버가 있으면 차단
   *   - COACH: 팀 소유자가 아닌 단순 구성원이므로 차단하지 않음 (삭제해도 팀·감독·학생 고아화 없음, 본인 TeamMember/CoachProfile만 cascade)
   *   - PARENT: ParentChild 관계로 등록된 자녀가 1명이라도 있으면 차단
   *   - CHILD/TEEN(학생): 별도 dependent 없음 — 그대로 삭제 (User cascade)
   *
   * 의도: 운영 중인 팀이나 자녀가 있는 계정의 무책임 삭제 방지.
   */
  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, userType: true },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 관리자(ADMIN/SYSTEM/OPER) 는 삭제 불가
    if (isAdminRole(user.userType)) {
      throw new BadRequestException("관리자 계정은 삭제할 수 없습니다.");
    }

    // ─── 사전 cascade 차단 검사 ───
    if (user.userType === "DIRECTOR" || user.userType === "ACADEMY_DIRECTOR") {
      const ownedTeams = await this.prisma.team.findMany({
        where: { coachId: userId },
        select: { id: true, name: true },
      });
      for (const t of ownedTeams) {
        const otherMembers = await this.prisma.teamMember.count({
          where: {
            teamId: t.id,
            userId: { not: userId },
            leftAt: null,
          },
        });
        if (otherMembers > 0) {
          throw new BadRequestException(
            `'${t.name}' 팀에 소속된 코치/학부모/학생이 ${otherMembers}명 있어 삭제할 수 없습니다. 먼저 멤버를 정리해주세요.`,
          );
        }
      }
    }

    if (user.userType === "PARENT") {
      const childrenCount = await this.prisma.parentChild.count({
        where: { parentId: userId },
      });
      if (childrenCount > 0) {
        throw new BadRequestException(
          `등록된 자녀가 ${childrenCount}명 있어 삭제할 수 없습니다. 먼저 자녀를 정리해주세요.`,
        );
      }
    }

    // ─── 실제 삭제 (의존 없는 정상 케이스) ───
    return this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: null,
          action: "USER_DELETED",
          resource: "users",
          newValue: {
            deletedUserId: userId,
            email: user.email,
            userType: user.userType,
          },
          ipAddress: "admin-action",
        },
      });

      // DIRECTOR 의 빈 팀 자체는 함께 정리 (멤버 0명 이미 확인됨)
      if (
        user.userType === "DIRECTOR" ||
        user.userType === "ACADEMY_DIRECTOR"
      ) {
        const ownedTeams = await tx.team.findMany({
          where: { coachId: userId },
          select: { id: true },
        });
        for (const t of ownedTeams) {
          for (const model of [
            "teamGroup",
            "teamEvent",
            "teamPost",
            "tournament",
            "teamAward",
            "teamDivision",
            "camp",
            "lessonPackage",
            "venueBooking",
            "venueRentalContract",
            "academyPromotion",
            "league",
            "overseasTrip",
            "gallery",
            "stickerBoard",
            "classDiary",
            "workSchedule",
            "trainingSession",
          ]) {
            try {
              await (tx as any)[model].deleteMany({ where: { teamId: t.id } });
            } catch {
              /* skip */
            }
          }
          try {
            await tx.class.deleteMany({ where: { teamId: t.id } });
          } catch {}
          // 본인 TeamMember 만 남아있을 수 있음
          const selfTm = await tx.teamMember.findMany({
            where: { teamId: t.id },
            select: { id: true },
          });
          if (selfTm.length) {
            try {
              await tx.teamGroupMember.deleteMany({
                where: { memberId: { in: selfTm.map((m) => m.id) } },
              });
            } catch {}
            await tx.teamMember.deleteMany({
              where: { id: { in: selfTm.map((m) => m.id) } },
            });
          }
          await tx.team.delete({ where: { id: t.id } }).catch(() => undefined);
        }
      }

      return tx.user.delete({ where: { id: userId } });
    });
  }

  /**
   * 관리자 계정 생성 (SYSTEM / OPER) — 2026-05-22
   * 관리자계정관리 페이지에서 신규 관리자를 등록한다.
   */
  async createAdminUser(data: {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    userType?: string;
  }) {
    const email = (data.email ?? "").trim().toLowerCase();
    const password = data.password ?? "";
    const userType = String(data.userType ?? "").toUpperCase();

    if (!email) throw new BadRequestException("이메일(ID)을 입력해주세요.");
    if (password.length < 8)
      throw new BadRequestException("비밀번호는 8자 이상이어야 합니다.");
    if (userType !== "SYSTEM" && userType !== "OPER")
      throw new BadRequestException(
        "관리자 유형은 시스템관리자(SYSTEM) 또는 업무관리자(OPER) 만 가능합니다.",
      );

    const existing = await this.prisma.user.findFirst({ where: { email } });
    if (existing)
      throw new BadRequestException("이미 사용 중인 이메일(ID)입니다.");

    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.user.create({
      data: {
        email,
        phone: data.phone?.trim() || "",
        firstName: data.firstName?.trim() || "",
        lastName: data.lastName?.trim() || "",
        passwordHash,
        userType: userType as UserType,
        isVerified: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        userType: true,
        createdAt: true,
      },
    });
  }

  /**
   * 관리자 계정 삭제 — deleteUser 의 "관리자 삭제 불가" 가드를 우회하는 전용 메서드.
   */
  async deleteAdminUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, userType: true },
    });
    if (!user) throw new NotFoundException("관리자를 찾을 수 없습니다.");
    if (!isAdminRole(user.userType))
      throw new BadRequestException("관리자 계정이 아닙니다.");

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          userId: null,
          action: "ADMIN_DELETED",
          resource: "users",
          newValue: {
            deletedUserId: id,
            email: user.email,
            userType: user.userType,
          },
          ipAddress: "admin-action",
        },
      });
      await tx.user.delete({ where: { id } });
    });
    return { success: true };
  }

  // ==================== 정산 관리 ====================

  /**
   * 정산 목록 조회
   */
  async getSettlements(params: {
    page?: number;
    limit?: number;
    status?: string;
    period?: string;
    teamId?: string;
  }) {
    const { page = 1, limit = 20, status, period, teamId } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.SettlementWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (period) {
      where.settlementMonth = period;
    }

    if (teamId) {
      where.teamId = teamId;
    }

    const [settlements, total] = await Promise.all([
      this.prisma.settlement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          team: { select: { id: true, name: true } },
        },
      }),
      this.prisma.settlement.count({ where }),
    ]);

    return {
      data: settlements.map((s) => this.decryptSettlementBankAccount(s)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 정산 상세 조회
   */
  async getSettlement(settlementId: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        team: true,
        transactions: true,
      },
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    return this.decryptSettlementBankAccount(settlement);
  }

  /**
   * 정산 승인
   */
  async approveSettlement(settlementId: string, adminId: string) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    if (settlement.status !== "pending") {
      throw new BadRequestException("대기 중인 정산만 승인할 수 있습니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id: settlementId },
        data: {
          status: "processing",
          approvedBy: adminId,
        },
      });

      // 감사 로그
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "SETTLEMENT_APPROVED",
          resource: "settlements",
          newValue: { settlementId, amount: settlement.netAmount },
        },
      });

      return updated;
    });
  }

  /**
   * 정산 거절
   */
  async rejectSettlement(
    settlementId: string,
    adminId: string,
    reason?: string,
  ) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    if (settlement.status !== "pending") {
      throw new BadRequestException("대기 중인 정산만 거절할 수 있습니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id: settlementId },
        data: {
          status: "failed",
        },
      });

      // 감사 로그
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "SETTLEMENT_REJECTED",
          resource: "settlements",
          newValue: { settlementId, amount: settlement.netAmount, reason },
        },
      });

      return updated;
    });
  }

  /**
   * 정산 계좌 정보 업데이트 (bankAccount 암호화 저장)
   */
  async updateSettlementBankInfo(
    settlementId: string,
    adminId: string,
    bankInfo: {
      bankName: string;
      bankAccount: string;
      accountHolder: string;
    },
  ) {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement) {
      throw new NotFoundException("정산 내역을 찾을 수 없습니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.settlement.update({
        where: { id: settlementId },
        data: {
          bankName: bankInfo.bankName,
          bankAccount: encryptField(bankInfo.bankAccount),
          accountHolder: bankInfo.accountHolder,
        },
      });

      // 감사 로그 (계좌번호는 마스킹하여 기록)
      const maskedAccount =
        bankInfo.bankAccount.length > 4
          ? "****" + bankInfo.bankAccount.slice(-4)
          : "****";

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "SETTLEMENT_BANK_UPDATED",
          resource: "settlements",
          newValue: {
            settlementId,
            bankName: bankInfo.bankName,
            bankAccount: maskedAccount,
            accountHolder: bankInfo.accountHolder,
          },
        },
      });

      return this.decryptSettlementBankAccount(updated);
    });
  }

  // ==================== 정산 엑셀 다운로드 ====================

  /**
   * 정산 목록을 CSV 버퍼로 반환 (추가 패키지 없이 JSON → CSV 변환)
   */
  async exportSettlements(startDate?: Date, endDate?: Date): Promise<Buffer> {
    const where: Prisma.SettlementWhereInput = {};

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const settlements = await this.prisma.settlement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        team: { select: { id: true, name: true } },
      },
    });

    // CSV 헤더
    const headers = [
      "ID",
      "정산월",
      "클럽명",
      "총매출",
      "플랫폼수수료",
      "PG수수료",
      "환불금액",
      "정산금액",
      "상태",
      "은행명",
      "계좌번호",
      "예금주",
      "생성일",
    ];

    // CSV 행 변환
    const rows = settlements.map((s) => {
      const decrypted = this.decryptSettlementBankAccount(s);
      return [
        s.id,
        s.settlementMonth ?? "",
        s.team?.name ?? "",
        s.totalRevenue?.toString() ?? "0",
        s.platformFee?.toString() ?? "0",
        s.paymentFee?.toString() ?? "0",
        s.refundAmount?.toString() ?? "0",
        s.netAmount?.toString() ?? "0",
        s.status ?? "",
        s.bankName ?? "",
        decrypted.bankAccount ?? "",
        s.accountHolder ?? "",
        s.createdAt?.toISOString() ?? "",
      ];
    });

    // CSV 문자열 생성 (BOM 포함하여 엑셀 한글 깨짐 방지)
    const escapeCsv = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csvLines = [
      headers.map(escapeCsv).join(","),
      ...rows.map((row) => row.map(escapeCsv).join(",")),
    ];

    const bom = "\uFEFF";
    const csvString = bom + csvLines.join("\n");

    return Buffer.from(csvString, "utf-8");
  }

  // ==================== 사용자 일괄 상태 변경 ====================

  /**
   * 여러 사용자의 isVerified 상태를 일괄 변경
   */
  async bulkUpdateUserStatus(
    userIds: string[],
    isVerified: boolean,
    adminId: string,
  ) {
    // 대상 사용자 존재 확인
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: userIds },
        NOT: { userType: UserType.ADMIN },
      },
      select: { id: true, email: true, isVerified: true },
    });

    if (users.length === 0) {
      throw new BadRequestException("변경 대상 사용자를 찾을 수 없습니다.");
    }

    // 이미 동일한 상태인 사용자 필터
    const toUpdate = users.filter((u) => u.isVerified !== isVerified);

    if (toUpdate.length === 0) {
      return {
        success: true,
        updatedCount: 0,
        message: "모든 사용자가 이미 해당 상태입니다.",
      };
    }

    const toUpdateIds = toUpdate.map((u) => u.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: { id: { in: toUpdateIds } },
        data: { isVerified },
      });

      // 감사 로그
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "BULK_USER_STATUS_UPDATED",
          resource: "users",
          newValue: {
            targetUserIds: toUpdateIds,
            isVerified,
            count: toUpdateIds.length,
          },
        },
      });
    });

    return {
      success: true,
      updatedCount: toUpdate.length,
      totalRequested: userIds.length,
      skipped: userIds.length - toUpdate.length,
    };
  }

  // ==================== 감사 로그 ====================

  /**
   * 감사 로그 조회
   */
  async getAuditLogs(params: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      resource,
      startDate,
      endDate,
    } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = action;
    }

    if (resource) {
      where.resource = resource;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              userType: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ==================== 시스템 통계 ====================

  /**
   * 시스템 전체 통계
   */
  async getSystemStats() {
    const [
      totalUsers,
      totalClubs,
      totalPayments,
      totalOrders,
      usersByType,
      recentPayments,
      pendingSettlements,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.team.count(),
      this.prisma.payment.count(),
      this.prisma.shopOrder.count(),
      this.prisma.user.groupBy({
        by: ["userType"],
        _count: true,
      }),
      this.prisma.payment.aggregate({
        where: {
          paymentStatus: "completed",
          createdAt: {
            gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
          },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.settlement.count({
        where: { status: "pending" },
      }),
    ]);

    return {
      users: {
        total: totalUsers,
        byType: usersByType.reduce(
          (acc, item) => {
            acc[item.userType] = item._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
      },
      clubs: totalClubs,
      payments: {
        total: totalPayments,
        recentMonth: {
          count: recentPayments._count,
          amount: recentPayments._sum.amount || 0,
        },
      },
      orders: totalOrders,
      settlements: {
        pending: pendingSettlements,
      },
    };
  }

  // ==================== 회원 레벨/포인트 관리 ====================

  /**
   * 회원 레벨 목록 조회
   */
  async getMemberLevels(params: {
    page?: number;
    limit?: number;
    levelName?: string;
  }) {
    const { page = 1, limit = 20, levelName } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.MemberLevelWhereInput = {};

    if (levelName) {
      where.levelName = levelName;
    }

    const [levels, total] = await Promise.all([
      this.prisma.memberLevel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { totalPoints: "desc" },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.memberLevel.count({ where }),
    ]);

    return {
      data: levels,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 포인트 조정 (수동)
   */
  async adjustPoints(
    userId: string,
    amount: number,
    reason: string,
    adminId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberLevel: true },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    return this.prisma.$transaction(async (tx) => {
      // 포인트 트랜잭션 생성
      await tx.pointTransaction.create({
        data: {
          userId,
          type: "ADJUST",
          amount,
          balance: (user.memberLevel?.currentPoints || 0) + amount,
          description: reason,
          referenceType: "admin_adjust",
        },
      });

      // 회원 레벨 업데이트
      const newCurrentPoints = (user.memberLevel?.currentPoints || 0) + amount;
      const newTotalPoints =
        amount > 0
          ? (user.memberLevel?.totalPoints || 0) + amount
          : user.memberLevel?.totalPoints || 0;

      // 레벨 재계산
      const levelName = this.calculateLevel(newTotalPoints);

      if (user.memberLevel) {
        const previousLevelName = user.memberLevel.levelName;
        await tx.memberLevel.update({
          where: { userId },
          data: {
            currentPoints: Math.max(0, newCurrentPoints),
            totalPoints: newTotalPoints,
            levelName,
          },
        });

        // 레벨이 변경되면 이력 기록
        if (previousLevelName !== levelName) {
          const LEVEL_MAP: Record<string, number> = {
            Bronze: 1,
            Silver: 2,
            Gold: 3,
            Platinum: 4,
            Diamond: 5,
          };
          const now = new Date();
          const season = `${now.getFullYear()}-${now.getFullYear() + 1}`;
          await tx.memberLevelHistory.create({
            data: {
              userId,
              previousLevel: LEVEL_MAP[previousLevelName] ?? 1,
              newLevel: LEVEL_MAP[levelName] ?? 1,
              previousName: previousLevelName,
              newName: levelName,
              reason: reason || "포인트 변동",
              season,
            },
          });
        }
      } else {
        await tx.memberLevel.create({
          data: {
            userId,
            currentPoints: Math.max(0, amount),
            totalPoints: amount > 0 ? amount : 0,
            levelName,
          },
        });
      }

      // 감사 로그
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "POINTS_ADJUSTED",
          resource: "member_levels",
          newValue: { targetUserId: userId, amount, reason },
        },
      });

      return { success: true, newBalance: Math.max(0, newCurrentPoints) };
    });
  }

  /**
   * 레벨 계산
   */
  private calculateLevel(totalPoints: number): string {
    if (totalPoints >= 50000) return "Diamond";
    if (totalPoints >= 15000) return "Platinum";
    if (totalPoints >= 5000) return "Gold";
    if (totalPoints >= 1000) return "Silver";
    return "Bronze";
  }

  // ==================== 승인 이력 ====================

  /**
   * 회원 승인/거절 이력 조회
   */
  async getApprovalHistory(limit = 50) {
    return this.prisma.teamMember.findMany({
      where: { approvalStatus: { in: ["approved", "rejected"] } },
      take: limit,
      orderBy: { joinedAt: "desc" },
      select: {
        id: true,
        approvalStatus: true,
        joinedAt: true,
        playerName: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        team: { select: { id: true, name: true } },
      },
    });
  }

  // ==================== 권한 관리 ====================

  /**
   * 사용자 권한(타입) 조회
   */
  async getUserPermissions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userType: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다.");
    return {
      userId: user.id,
      userType: user.userType,
      email: user.email,
      name: `${user.lastName}${user.firstName}`,
    };
  }

  // ==================== 구장 관리 (Rink - 레거시) ====================

  async getRinks(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;
    const [rinks, total] = await Promise.all([
      this.prisma.rink.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          location: true,
          phone: true,
          memo: true,
          createdAt: true,
        },
      }),
      this.prisma.rink.count(),
    ]);
    return {
      data: rinks,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==================== 구장 관리 (Venue - 신규) ====================

  /**
   * 구장 목록 조회 (검색/필터/페이지네이션)
   */
  async getVenues(params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    city?: string;
    teamId?: string;
  }) {
    const { page = 1, limit = 20, search, status, city, teamId } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.VenueWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (city) {
      where.city = city;
    }

    if (teamId) {
      where.teamId = teamId;
    }

    const [venues, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          address: true,
          addressDetail: true,
          city: true,
          phone: true,
          latitude: true,
          longitude: true,
          capacity: true,
          rinkSize: true,
          amenities: true,
          operatingHours: true,
          status: true,
          imageUrl: true,
          hourlyRate: true,
          createdAt: true,
          updatedAt: true,
          team: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.venue.count({ where }),
    ]);

    return {
      data: venues,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * 구장 상세 조회
   */
  async getVenue(id: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        address: true,
        addressDetail: true,
        city: true,
        zipCode: true,
        phone: true,
        latitude: true,
        longitude: true,
        capacity: true,
        rinkSize: true,
        amenities: true,
        operatingHours: true,
        status: true,
        imageUrl: true,
        hourlyRate: true,
        managerId: true,
        createdAt: true,
        updatedAt: true,
        team: {
          select: { id: true, name: true },
        },
        bookings: {
          take: 5,
          orderBy: { date: "desc" },
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            purpose: true,
            status: true,
          },
        },
        holidays: {
          take: 10,
          orderBy: { date: "desc" },
          select: {
            id: true,
            date: true,
            reason: true,
            type: true,
            isAllDay: true,
          },
        },
      },
    });

    if (!venue) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    return venue;
  }

  /**
   * 구장 등록
   */
  async createVenue(data: {
    name: string;
    teamId?: string;
    address?: string;
    addressDetail?: string;
    city?: string;
    zipCode?: string;
    phone?: string;
    latitude?: number;
    longitude?: number;
    capacity?: number;
    rinkSize?: string;
    amenities?: Record<string, boolean>;
    operatingHours?: Record<string, { open: string; close: string }>;
    hourlyRate?: number;
    managerId?: string;
    imageUrl?: string;
  }) {
    // teamId 유효성 검증
    if (data.teamId) {
      const club = await this.prisma.team.findUnique({
        where: { id: data.teamId },
      });
      if (!club) {
        throw new BadRequestException("유효하지 않은 클럽 ID입니다.");
      }
    }

    const venue = await this.prisma.venue.create({
      data: {
        name: data.name,
        teamId: data.teamId,
        address: data.address,
        addressDetail: data.addressDetail,
        city: data.city,
        zipCode: data.zipCode,
        phone: data.phone,
        latitude: data.latitude,
        longitude: data.longitude,
        capacity: data.capacity,
        rinkSize: data.rinkSize,
        amenities: data.amenities ?? undefined,
        operatingHours: data.operatingHours ?? undefined,
        hourlyRate: data.hourlyRate,
        managerId: data.managerId,
        imageUrl: data.imageUrl,
        status: "active",
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        phone: true,
        status: true,
        imageUrl: true,
        createdAt: true,
      },
    });

    return venue;
  }

  /**
   * 구장 정보 수정
   */
  async updateVenue(
    id: string,
    data: {
      name?: string;
      teamId?: string;
      address?: string;
      addressDetail?: string;
      city?: string;
      zipCode?: string;
      phone?: string;
      latitude?: number;
      longitude?: number;
      capacity?: number;
      rinkSize?: string;
      amenities?: Record<string, boolean>;
      operatingHours?: Record<string, { open: string; close: string }>;
      hourlyRate?: number;
      managerId?: string;
      imageUrl?: string;
    },
  ) {
    // 존재 여부 확인
    const existing = await this.prisma.venue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    // teamId 유효성 검증
    if (data.teamId) {
      const club = await this.prisma.team.findUnique({
        where: { id: data.teamId },
      });
      if (!club) {
        throw new BadRequestException("유효하지 않은 클럽 ID입니다.");
      }
    }

    const venue = await this.prisma.venue.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.teamId !== undefined && { teamId: data.teamId }),
        ...(data.address !== undefined && { address: data.address }),
        ...(data.addressDetail !== undefined && {
          addressDetail: data.addressDetail,
        }),
        ...(data.city !== undefined && { city: data.city }),
        ...(data.zipCode !== undefined && { zipCode: data.zipCode }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.latitude !== undefined && { latitude: data.latitude }),
        ...(data.longitude !== undefined && { longitude: data.longitude }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.rinkSize !== undefined && { rinkSize: data.rinkSize }),
        ...(data.amenities !== undefined && { amenities: data.amenities }),
        ...(data.operatingHours !== undefined && {
          operatingHours: data.operatingHours,
        }),
        ...(data.hourlyRate !== undefined && { hourlyRate: data.hourlyRate }),
        ...(data.managerId !== undefined && { managerId: data.managerId }),
        ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
      },
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        phone: true,
        status: true,
        imageUrl: true,
        updatedAt: true,
      },
    });

    return venue;
  }

  /**
   * 구장 상태 변경 (운영중/점검중/폐쇄)
   */
  async updateVenueStatus(
    id: string,
    status: string,
    _maintenanceNote?: string,
  ) {
    const existing = await this.prisma.venue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    const validStatuses = ["active", "maintenance", "closed"];
    if (!validStatuses.includes(status)) {
      throw new BadRequestException(
        `유효하지 않은 상태입니다. (${validStatuses.join(", ")})`,
      );
    }

    const venue = await this.prisma.venue.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
    });

    return venue;
  }

  /**
   * 구장 삭제
   */
  async deleteVenue(id: string) {
    const existing = await this.prisma.venue.findUnique({
      where: { id },
      select: {
        id: true,
        _count: {
          select: {
            bookings: { where: { status: { in: ["pending", "confirmed"] } } },
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("구장을 찾을 수 없습니다.");
    }

    if (existing._count.bookings > 0) {
      throw new BadRequestException(
        "진행 중인 예약이 있는 구장은 삭제할 수 없습니다.",
      );
    }

    await this.prisma.venue.delete({ where: { id } });
    return { success: true, message: "구장이 삭제되었습니다." };
  }

  /**
   * 구장 목록 공개 조회 (비인증 사용자용)
   */
  async getPublicVenues(params: {
    search?: string;
    city?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, city, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.VenueWhereInput = {
      status: "active",
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }

    if (city) {
      where.city = city;
    }

    const [venues, total] = await Promise.all([
      this.prisma.venue.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          city: true,
          phone: true,
          latitude: true,
          longitude: true,
          amenities: true,
          operatingHours: true,
          status: true,
          imageUrl: true,
          rinkSize: true,
        },
      }),
      this.prisma.venue.count({ where }),
    ]);

    return {
      data: venues,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==================== 코치 관리 ====================

  async getCoaches(params: { page?: number; limit?: number; teamId?: string }) {
    const { page = 1, limit = 20, teamId } = params;
    const skip = (page - 1) * limit;
    // 감독(HEAD_COACH/DIRECTOR)은 코치 목록에서 제외 — user.userType=COACH 만 노출
    const where: Prisma.CoachProfileWhereInput = {
      ...(teamId ? { teamId } : {}),
      user: { userType: "COACH" },
    };
    try {
      const [coaches, total] = await Promise.all([
        this.prisma.coachProfile.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
                userType: true,
                avatarUrl: true,
              },
            },
            team: { select: { id: true, name: true } },
          },
        }),
        this.prisma.coachProfile.count({ where }),
      ]);
      return {
        data: coaches,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch {
      // coachProfile 테이블/관계 오류 시 Prisma ORM 폴백
      const coachWhere = { userType: "COACH" as const };
      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where: coachWhere,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            createdAt: true,
          },
        }),
        this.prisma.user.count({ where: coachWhere }),
      ]);
      return {
        data: users.map((u) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          user: {
            id: u.id,
            email: u.email,
            name: `${u.lastName ?? ""}${u.firstName ?? ""}`.trim() || u.email,
            phone: u.phone,
          },
          club: null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  }

  /**
   * 코치 등록 — 감독(DIRECTOR/ADMIN)이 코치 계정을 직접 생성.
   *  · 본인인증·승인 단계 없음. 감독이 지정한 아이디(loginId)/비밀번호로 계정 생성.
   *  · 감독의 운영 팀에 TeamMember(roleInTeam='COACH', approved)로 즉시 소속 →
   *    director-coaches 목록(/teams/:id/members approved COACH 필터)에 바로 노출.
   *  · 생성된 아이디/비밀번호는 감독이 코치에게 직접 전달(카카오 등). 코치 첫 로그인 후 변경 권장.
   *  · 아이디(email)·전화번호(phone)는 @unique → 중복 시 409.
   */
  async createCoach(
    dto: {
      name: string;
      phone: string;
      loginId: string;
      password: string;
      roleInTeam?: "COACH" | "MANAGER";
    },
    currentUser: { id: string; userType: string },
  ) {
    // 1) 감독의 운영 팀 — 감독 1인 = 1팀 정책. 첫 팀에 코치 소속.
    const teamIds = await resolveManagedTeamIds(this.prisma, currentUser.id);
    const teamId = teamIds[0];
    if (!teamId) {
      throw new BadRequestException(
        "운영 중인 팀이 없습니다. 먼저 팀을 등록한 후 코치를 추가해주세요.",
      );
    }

    // 2) 전화번호 정규화: 국가코드 82 → 0으로 변환
    let normalizedPhone = dto.phone.replace(/[^0-9]/g, "");
    if (normalizedPhone.startsWith("82")) {
      normalizedPhone = "0" + normalizedPhone.slice(2);
    }

    // 3) 한국어 이름 분리: 첫 글자 = 성(lastName), 나머지 = 이름(firstName)
    const lastName = dto.name.charAt(0);
    const firstName = dto.name.length > 1 ? dto.name.slice(1) : dto.name;

    // 4) 감독 지정 아이디/비밀번호 — 자동합성 이메일·고정 비번 폐기.
    const email = dto.loginId;
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            firstName,
            lastName,
            email,
            phone: normalizedPhone,
            passwordHash,
            userType: "COACH",
          },
        });

        const coachProfile = await tx.coachProfile.create({
          data: { userId: user.id, teamId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                phone: true,
              },
            },
            team: { select: { id: true, name: true } },
          },
        });

        // 감독이 직접 생성 → 승인 불필요(approved). 목록·권한 자동 해결.
        //   직책: COACH(코치, 기본) | MANAGER(단장). 단장도 코치와 동일 권한, 표기만 다름.
        await tx.teamMember.create({
          data: {
            userId: user.id,
            teamId,
            playerName: `${lastName}${firstName}`,
            playerAge: 0,
            approvalStatus: "approved",
            roleInTeam: dto.roleInTeam ?? "COACH",
          },
        });

        return coachProfile;
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        // 중복 대상 구분: email(아이디) vs phone(전화번호)
        const target = Array.isArray(e.meta?.target)
          ? (e.meta?.target as string[]).join(",")
          : String(e.meta?.target ?? "");
        if (target.includes("email")) {
          throw new ConflictException("이미 사용 중인 아이디입니다.");
        }
        if (target.includes("phone")) {
          throw new ConflictException("이미 사용 중인 전화번호입니다.");
        }
        throw new ConflictException("이미 사용 중인 정보입니다.");
      }
      throw e;
    }
  }

  /**
   * [신규 2026-05-15] 감독(DIRECTOR) 결제 요약 — director-payments 페이지용.
   *
   * 동작:
   *  - DIRECTOR/ACADEMY_DIRECTOR 가 운영하는 팀(teams.coachId=self) 만 집계.
   *  - ADMIN/SYSTEM/OPER 는 전체 활성 팀 집계 (admin 화면 호환).
   *  - 각 팀별 결제완료/미납 금액·인원, 정산 예정(approved 상태 settlements) 합산.
   *  - 운영 팀이 0개면 빈 결과 반환 (요청 자체는 정상 200).
   *
   * 응답 스키마 (프론트엔드 PaymentSummary + TeamPayment[] 호환):
   * {
   *   summary: {
   *     totalRevenue, unpaid, pendingSettlement,
   *     completedCount, unpaidCount,
   *   },
   *   teams: [{ id, teamName, totalMembers, paidMembers, unpaidMembers,
   *              totalAmount, paidAmount, feeType, billingTiming }]
   * }
   */
  async getDirectorPaymentSummary(currentUser: {
    id: string;
    userType: string;
  }) {
    // 1) 권한별 팀 화이트리스트
    const isAdmin =
      currentUser.userType === "ADMIN" || isAdminRole(currentUser.userType);

    const teams = isAdmin
      ? await this.prisma.team.findMany({
          where: { isActive: true },
          select: { id: true, name: true, defaultBillingTiming: true },
          orderBy: { name: "asc" },
        })
      : await this.prisma.team.findMany({
          where: { coachId: currentUser.id, isActive: true },
          select: { id: true, name: true, defaultBillingTiming: true },
          orderBy: { name: "asc" },
        });

    if (teams.length === 0) {
      return {
        summary: {
          totalRevenue: 0,
          unpaid: 0,
          pendingSettlement: 0,
          completedCount: 0,
          unpaidCount: 0,
        },
        teams: [],
      };
    }

    const teamIds = teams.map((t) => t.id);

    // 2) 정산 예정 (pending/processing 단계 — completed 직전까지)
    //  status: pending|processing|completed|failed
    const pendingSettlements = await this.prisma.settlement.findMany({
      where: {
        teamId: { in: teamIds },
        status: { in: ["pending", "processing"] },
      },
      select: { teamId: true, status: true, netAmount: true },
    });
    const pendingSettlementTotal = pendingSettlements.reduce(
      (acc, s) => acc + Number(s.netAmount ?? 0),
      0,
    );

    // 3) 팀별 수업 + 미납/완납 집계
    //  - feeType/billingTiming 은 ClassProduct 에 존재 (Class 모델엔 없음)
    const classes = await this.prisma.class.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        teamId: true,
        products: {
          select: { price: true, feeType: true, billingTiming: true },
          orderBy: { price: "asc" },
          take: 1,
        },
      },
    });
    const classIds = classes.map((c) => c.id);

    const registrations = classIds.length
      ? await this.prisma.classRegistration.findMany({
          where: { classId: { in: classIds } },
          select: { classId: true, userId: true, status: true },
        })
      : [];

    const enrollments = classIds.length
      ? await this.prisma.enrollment.findMany({
          where: { classId: { in: classIds } },
          orderBy: { updatedAt: "desc" },
          select: {
            classId: true,
            childId: true,
            status: true,
            product: { select: { price: true } },
            payment: { select: { amount: true, paymentStatus: true } },
          },
        })
      : [];

    // childId 기반 최신 enrollment 매핑
    const enrollMap = new Map<string, (typeof enrollments)[number]>();
    for (const e of enrollments) {
      const key = `${e.classId}:${e.childId}`;
      if (!enrollMap.has(key)) enrollMap.set(key, e);
    }

    const isPaid = (e: (typeof enrollments)[number] | undefined): boolean => {
      if (!e) return false;
      return e.payment?.paymentStatus === "completed" || e.status === "paid";
    };

    const classByTeam = new Map<string, typeof classes>();
    for (const c of classes) {
      if (!c.teamId) continue;
      const arr = classByTeam.get(c.teamId) ?? [];
      arr.push(c);
      classByTeam.set(c.teamId, arr);
    }
    const regByClass = new Map<string, typeof registrations>();
    for (const r of registrations) {
      const arr = regByClass.get(r.classId) ?? [];
      arr.push(r);
      regByClass.set(r.classId, arr);
    }

    const teamResults = teams.map((team) => {
      const teamClasses = classByTeam.get(team.id) ?? [];
      let paidAmount = 0;
      let unpaidAmount = 0;
      let paidMembers = 0;
      let unpaidMembers = 0;
      // 팀의 대표 feeType/billingTiming 은 첫 수업의 최저가 상품 기준 (없으면 기본값)
      const firstClass = teamClasses[0];
      const firstProduct = firstClass?.products[0];
      const feeType =
        (firstProduct?.feeType as "MONTHLY_FIXED" | "PER_SESSION") ??
        "MONTHLY_FIXED";
      const billingTiming =
        (firstProduct?.billingTiming as "PREPAID" | "POSTPAID") ??
        (team.defaultBillingTiming as "PREPAID" | "POSTPAID") ??
        "PREPAID";

      for (const c of teamClasses) {
        const fallbackPrice = c.products[0]?.price
          ? Number(c.products[0].price)
          : 0;
        const regs = regByClass.get(c.id) ?? [];
        for (const reg of regs) {
          const e = enrollMap.get(`${c.id}:${reg.userId}`);
          const paid = reg.status !== "inactive" && isPaid(e);
          if (paid) {
            paidMembers += 1;
            paidAmount +=
              e?.payment?.amount ??
              (e?.product?.price ? Number(e.product.price) : fallbackPrice);
          } else {
            unpaidMembers += 1;
            unpaidAmount += e?.product?.price
              ? Number(e.product.price)
              : fallbackPrice;
          }
        }
      }
      return {
        id: team.id,
        teamName: team.name,
        totalMembers: paidMembers + unpaidMembers,
        paidMembers,
        unpaidMembers,
        totalAmount: paidAmount + unpaidAmount,
        paidAmount,
        unpaidAmount,
        feeType,
        billingTiming,
      };
    });

    const totalRevenue = teamResults.reduce((acc, t) => acc + t.paidAmount, 0);
    const unpaid = teamResults.reduce((acc, t) => acc + t.unpaidAmount, 0);
    const completedCount = teamResults.reduce(
      (acc, t) => acc + t.paidMembers,
      0,
    );
    const unpaidCount = teamResults.reduce(
      (acc, t) => acc + t.unpaidMembers,
      0,
    );

    return {
      summary: {
        totalRevenue,
        unpaid,
        pendingSettlement: pendingSettlementTotal,
        completedCount,
        unpaidCount,
      },
      teams: teamResults,
    };
  }

  /**
   * [신규 2026-05-15] 코치 상세 조회 (RBAC 인지)
   *
   * - ADMIN/SYSTEM/OPER: 전체 코치 조회 가능
   * - DIRECTOR/ACADEMY_DIRECTOR: 자신이 운영하는 팀(teams.coachId=self)에
   *   소속된 코치만 조회 가능 (다른 팀 코치 접근 시 403)
   *
   * 응답에는 `note` JSON(specialty/career), `avatarUrl`, `phone` 등
   * 수정 화면에서 사용하는 모든 필드를 포함한다.
   */
  async getCoach(
    coachId: string,
    currentUser: { id: string; userType: string },
  ) {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        userType: true,
        status: true,
        avatarUrl: true,
        coachProfile: {
          select: {
            id: true,
            teamId: true,
            team: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!coach || coach.userType !== "COACH") {
      throw new NotFoundException("코치를 찾을 수 없습니다.");
    }

    // DIRECTOR/ACADEMY_DIRECTOR는 자신이 운영하는 팀의 코치만 조회 가능
    if (
      currentUser.userType === "DIRECTOR" ||
      currentUser.userType === "ACADEMY_DIRECTOR"
    ) {
      await this.assertDirectorOwnsCoach(currentUser.id, coachId);
    }

    return {
      id: coach.id,
      email: coach.email,
      firstName: coach.firstName,
      lastName: coach.lastName,
      name: `${coach.lastName ?? ""}${coach.firstName ?? ""}`.trim(),
      phone: coach.phone,
      userType: coach.userType,
      status: coach.status === "ACTIVE" ? "active" : "inactive",
      avatarUrl: coach.avatarUrl,
      teamId: coach.coachProfile?.teamId ?? null,
      team: coach.coachProfile?.team ?? null,
      specialty: "",
      career: "",
    };
  }

  /**
   * [신규 2026-05-15] 코치 정보 수정 (RBAC 인지)
   *
   * 보안:
   *  - ADMIN: 전체 코치 수정 가능
   *  - DIRECTOR/ACADEMY_DIRECTOR: 자신이 운영하는 팀의 코치 한정
   *  - userType 변경 불가 (이 메서드는 COACH 만 다룬다)
   *
   * 트랜잭션:
   *  - User.firstName/lastName/phone/status/avatarUrl 갱신
   *  - 전화번호 충돌 시 P2002 → ConflictException
   */
  async updateCoach(
    coachId: string,
    dto: {
      name?: string;
      specialty?: string;
      phone?: string;
      career?: string;
      status?: "active" | "inactive";
      avatarUrl?: string;
    },
    currentUser: { id: string; userType: string },
  ) {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { id: true, userType: true },
    });
    if (!coach) {
      throw new NotFoundException("코치를 찾을 수 없습니다.");
    }
    if (coach.userType !== "COACH") {
      throw new BadRequestException("코치 계정이 아닙니다.");
    }

    // DIRECTOR/ACADEMY_DIRECTOR 권한 검증
    if (
      currentUser.userType === "DIRECTOR" ||
      currentUser.userType === "ACADEMY_DIRECTOR"
    ) {
      await this.assertDirectorOwnsCoach(currentUser.id, coachId);
    }

    const updateData: Prisma.UserUpdateInput = {};

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (trimmed.length > 0) {
        // 한국어 이름 분리: 첫 글자 = 성, 나머지 = 이름
        updateData.lastName = trimmed.charAt(0);
        updateData.firstName = trimmed.length > 1 ? trimmed.slice(1) : trimmed;
      }
    }

    if (dto.phone !== undefined) {
      // 전화번호 정규화: 국가코드 82 → 0
      let normalized = dto.phone.replace(/[^0-9]/g, "");
      if (normalized.startsWith("82")) {
        normalized = "0" + normalized.slice(2);
      }
      updateData.phone = normalized;
    }

    if (dto.status !== undefined) {
      updateData.status = dto.status === "active" ? "ACTIVE" : "INACTIVE";
    }

    if (dto.avatarUrl !== undefined && !dto.avatarUrl.startsWith("data:")) {
      // data: URL은 별도 업로드 처리가 필요 — 우선 외부 URL만 저장
      updateData.avatarUrl = dto.avatarUrl;
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: coachId },
        data: updateData,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          status: true,
          avatarUrl: true,
        },
      });
      return {
        ...updated,
        name: `${updated.lastName ?? ""}${updated.firstName ?? ""}`.trim(),
        status: updated.status === "ACTIVE" ? "active" : "inactive",
        // specialty/career 는 별도 모델 미구현 — 입력값 echo
        specialty: dto.specialty ?? "",
        career: dto.career ?? "",
      };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("이미 사용 중인 전화번호입니다.");
      }
      throw e;
    }
  }

  /**
   * [신규 2026-05-15] 코치 삭제 (RBAC 인지)
   *
   * - ADMIN: 전체 코치 삭제 가능
   * - DIRECTOR/ACADEMY_DIRECTOR: 자신이 운영하는 팀의 코치 한정
   * - 실제 삭제 로직은 기존 deleteUser() 위임 — cascade 차단 검사 포함
   */
  async deleteCoach(
    coachId: string,
    currentUser: { id: string; userType: string },
  ) {
    const coach = await this.prisma.user.findUnique({
      where: { id: coachId },
      select: { id: true, userType: true },
    });
    if (!coach) {
      throw new NotFoundException("코치를 찾을 수 없습니다.");
    }
    if (coach.userType !== "COACH") {
      throw new BadRequestException("코치 계정이 아닙니다.");
    }

    if (
      currentUser.userType === "DIRECTOR" ||
      currentUser.userType === "ACADEMY_DIRECTOR"
    ) {
      await this.assertDirectorOwnsCoach(currentUser.id, coachId);
    }

    return this.deleteUser(coachId);
  }

  /**
   * [신규 2026-05-15] DIRECTOR 가 해당 코치를 관리할 권한이 있는지 확인.
   *
   * 다중 경로 화이트리스트:
   *  1) coachProfile.teamId 가 directorId 가 소유한 팀(teams.coachId=directorId) 에 속함
   *  2) coach 가 teamMember 로 등록된 팀이 directorId 소유 팀에 속함
   *
   * 어느 경로도 매칭되지 않으면 ForbiddenException — 다른 팀 코치 접근 차단.
   */
  private async assertDirectorOwnsCoach(
    directorId: string,
    coachId: string,
  ): Promise<void> {
    const directorTeams = await this.prisma.team.findMany({
      where: { coachId: directorId },
      select: { id: true },
    });
    if (directorTeams.length === 0) {
      throw new BadRequestException(
        "운영 중인 팀이 없어 코치를 관리할 수 없습니다.",
      );
    }
    const teamIds = directorTeams.map((t) => t.id);

    const [coachProfile, teamMember] = await Promise.all([
      this.prisma.coachProfile.findFirst({
        where: { userId: coachId, teamId: { in: teamIds } },
        select: { id: true },
      }),
      this.prisma.teamMember.findFirst({
        where: {
          userId: coachId,
          teamId: { in: teamIds },
          leftAt: null,
        },
        select: { id: true },
      }),
    ]);

    if (!coachProfile && !teamMember) {
      throw new ForbiddenException(
        "이 코치를 관리할 권한이 없습니다. 운영 중인 팀의 코치만 수정/삭제할 수 있습니다.",
      );
    }
  }

  /**
   * 사용자 권한(타입) 변경
   */
  async updateUserPermissions(
    userId: string,
    userType: UserType,
    adminId: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("사용자를 찾을 수 없습니다.");

    // 관리자 계정(ADMIN/SYSTEM/OPER) 의 역할은 변경 불가
    if (isAdminRole(user.userType)) {
      throw new BadRequestException(
        "시스템 관리자 계정의 역할은 변경할 수 없습니다.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { userType },
        select: {
          id: true,
          userType: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "USER_PERMISSION_CHANGED",
          resource: "users",
          newValue: {
            targetUserId: userId,
            oldType: user.userType,
            newType: userType,
          },
        },
      });

      return updated;
    });
  }

  // ==================== 벌크 임포트 ====================

  /**
   * 엑셀 파일 파싱 유틸리티
   * Buffer → JSON 배열 변환, 헤더 매핑 포함
   */
  private parseExcelFile(
    buffer: Buffer,
    headerMap: Record<string, string>,
  ): { rows: Record<string, unknown>[]; totalRows: number } {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new BadRequestException("엑셀 파일에 시트가 없습니다.");
    }

    const sheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    if (rawRows.length === 0) {
      throw new BadRequestException(
        "엑셀 파일에 데이터가 없습니다. 헤더 행 다음에 데이터를 입력해주세요.",
      );
    }

    if (rawRows.length > 5000) {
      throw new BadRequestException(
        "한 번에 최대 5,000행까지 처리할 수 있습니다.",
      );
    }

    // 헤더 매핑: 한글 헤더 → 영문 키
    const mappedRows = rawRows.map((row: Record<string, unknown>) => {
      const mapped: Record<string, unknown> = {};
      for (const [korHeader, engKey] of Object.entries(headerMap)) {
        if (row[korHeader] !== undefined) {
          mapped[engKey] = row[korHeader];
        } else if (row[engKey] !== undefined) {
          mapped[engKey] = row[engKey];
        }
      }
      return mapped;
    });

    return { rows: mappedRows, totalRows: mappedRows.length };
  }

  /**
   * 회원 일괄 등록 (엑셀 파일)
   * xlsx 파싱 → 검증 → $transaction 벌크 생성
   */
  async importMembers(
    file: Express.Multer.File,
    adminId: string,
  ): Promise<{
    success: boolean;
    totalRows: number;
    successCount: number;
    failCount: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    // 한글 헤더 → 영문 키 매핑
    const headerMap: Record<string, string> = {
      성: "lastName",
      이름: "firstName",
      이메일: "email",
      전화번호: "phone",
      회원유형: "userType",
      "클럽 ID": "teamId",
      생년월일: "birthDate",
      성별: "gender",
      메모: "note",
    };

    const { rows, totalRows } = this.parseExcelFile(file.buffer, headerMap);

    const errors: Array<{ row: number; message: string }> = [];
    const validRows: Array<{
      rowNum: number;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      userType: UserType;
      teamId?: string;
      birthDate?: string;
      gender?: string;
      note?: string;
    }> = [];

    // 사전 검증: 이메일/전화번호 형식 + 유효한 회원유형
    const validUserTypes = ["PARENT", "TEEN", "CHILD", "COACH", "DIRECTOR"];
    const phoneRegex = /^01[016789]\d{7,8}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 엑셀 행 번호 (1행: 헤더)

      const firstName = String(row.firstName ?? "").trim();
      const lastName = String(row.lastName ?? "").trim();
      const email = String(row.email ?? "")
        .trim()
        .toLowerCase();
      const phone = String(row.phone ?? "")
        .trim()
        .replace(/[^0-9]/g, "");
      const userType = String(row.userType ?? "")
        .trim()
        .toUpperCase();
      const teamId = String(row.teamId ?? "").trim() || undefined;
      const birthDate = String(row.birthDate ?? "").trim() || undefined;
      const gender =
        String(row.gender ?? "")
          .trim()
          .toUpperCase() || undefined;
      const note = String(row.note ?? "").trim() || undefined;

      // 필수 필드 검증
      if (!firstName) {
        errors.push({ row: rowNum, message: "이름이 비어 있습니다." });
        continue;
      }
      if (!lastName) {
        errors.push({ row: rowNum, message: "성이 비어 있습니다." });
        continue;
      }
      if (!email || !emailRegex.test(email)) {
        errors.push({
          row: rowNum,
          message: "이메일 형식이 올바르지 않습니다.",
        });
        continue;
      }
      if (!phone || !phoneRegex.test(phone)) {
        errors.push({
          row: rowNum,
          message: "전화번호 형식이 올바르지 않습니다. (예: 01012345678)",
        });
        continue;
      }
      if (!validUserTypes.includes(userType)) {
        errors.push({
          row: rowNum,
          message: `회원유형이 올바르지 않습니다. (${validUserTypes.join(", ")})`,
        });
        continue;
      }

      // 생년월일 검증
      if (birthDate) {
        const dateVal = new Date(birthDate);
        if (isNaN(dateVal.getTime())) {
          errors.push({
            row: rowNum,
            message: "생년월일 형식이 올바르지 않습니다. (YYYY-MM-DD)",
          });
          continue;
        }
      }

      // 성별 검증
      if (gender && !["M", "F"].includes(gender)) {
        errors.push({
          row: rowNum,
          message: "성별은 M 또는 F여야 합니다.",
        });
        continue;
      }

      validRows.push({
        rowNum,
        firstName,
        lastName,
        email,
        phone,
        userType: userType as UserType,
        teamId,
        birthDate,
        gender,
        note,
      });
    }

    if (validRows.length === 0) {
      return {
        success: false,
        totalRows,
        successCount: 0,
        failCount: totalRows,
        errors:
          errors.length > 0
            ? errors
            : [{ row: 0, message: "유효한 데이터가 없습니다." }],
      };
    }

    // 기존 이메일/전화번호 중복 확인
    const existingEmails = new Set(
      (
        await this.prisma.user.findMany({
          where: { email: { in: validRows.map((r) => r.email) } },
          select: { email: true },
        })
      ).map((u) => u.email),
    );

    const existingPhones = new Set(
      (
        await this.prisma.user.findMany({
          where: { phone: { in: validRows.map((r) => r.phone) } },
          select: { phone: true },
        })
      ).map((u) => u.phone),
    );

    // 파일 내 중복 감지용
    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    const toCreate = validRows.filter((row) => {
      if (existingEmails.has(row.email)) {
        errors.push({
          row: row.rowNum,
          message: `이미 등록된 이메일입니다: ${row.email}`,
        });
        return false;
      }
      if (existingPhones.has(row.phone)) {
        errors.push({
          row: row.rowNum,
          message: `이미 등록된 전화번호입니다: ${row.phone}`,
        });
        return false;
      }
      if (seenEmails.has(row.email)) {
        errors.push({
          row: row.rowNum,
          message: `파일 내 중복 이메일입니다: ${row.email}`,
        });
        return false;
      }
      if (seenPhones.has(row.phone)) {
        errors.push({
          row: row.rowNum,
          message: `파일 내 중복 전화번호입니다: ${row.phone}`,
        });
        return false;
      }
      seenEmails.add(row.email);
      seenPhones.add(row.phone);
      return true;
    });

    if (toCreate.length === 0) {
      return {
        success: false,
        totalRows,
        successCount: 0,
        failCount: totalRows,
        errors,
      };
    }

    // 기본 비밀번호 해시 (일괄 등록용)
    // NOTE: 브랜드 리네이밍(2026-05-16) 시에도 기존 admin 비밀번호 시드 호환성 유지를 위해 의도적으로 보존.
    //       시드 변경 시 기존 일괄 등록 사용자의 비밀번호 호환성 깨질 수 있어 운영 정책상 변경 금지.
    const defaultPasswordHash = await bcrypt.hash("teamplus1234!", 10);

    // $transaction으로 원자적 일괄 생성
    let successCount = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const row of toCreate) {
        try {
          const userData: Prisma.UserCreateInput = {
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            phone: row.phone,
            passwordHash: defaultPasswordHash,
            userType: row.userType,
            isVerified: true, // 관리자 등록이므로 자동 인증
            birthDate: row.birthDate ? new Date(row.birthDate) : undefined,
            // gender/note: User 모델 미존재 필드 — 제외
          };

          const user = await tx.user.create({ data: userData });

          // 클럽 ID가 있으면 ClubMember도 생성
          if (row.teamId) {
            const club = await tx.team.findUnique({
              where: { id: row.teamId },
            });
            if (club) {
              // 한국나이 계산
              const birthYear = row.birthDate
                ? new Date(row.birthDate).getFullYear()
                : 2000;
              const koreanAge = new Date().getFullYear() - birthYear + 1;

              await tx.teamMember.create({
                data: {
                  userId: user.id,
                  teamId: row.teamId,
                  playerName: `${row.lastName}${row.firstName}`,
                  playerAge: koreanAge,
                  approvalStatus: "approved",
                },
              });
            }
          }

          successCount++;
        } catch (e) {
          errors.push({
            row: row.rowNum,
            message:
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === "P2002"
                ? "이메일 또는 전화번호가 이미 등록되어 있습니다."
                : "회원 등록 중 오류가 발생했습니다.",
          });
          // 트랜잭션 내부이므로 에러 시 전체 롤백.
          // 개별 실패를 허용하지 않고 전체 원자성 보장
          throw e;
        }
      }

      // 감사 로그
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "BULK_MEMBER_IMPORT",
          resource: "users",
          newValue: {
            totalRows,
            successCount,
            failCount: errors.length,
          },
        },
      });
    });

    return {
      success: successCount > 0,
      totalRows,
      successCount,
      failCount: totalRows - successCount,
      errors,
    };
  }

  /**
   * 크레딧 일괄 충전 (엑셀 파일)
   * xlsx 파싱 → 검증 → $transaction 벌크 크레딧 발급
   */
  async importCredits(
    file: Express.Multer.File,
    adminId: string,
  ): Promise<{
    success: boolean;
    totalRows: number;
    successCount: number;
    failCount: number;
    errors: Array<{ row: number; message: string }>;
  }> {
    // 2026-04-27 (N-9): "클럽 ID" → "수업 ID" 로 헤더 정정 (수업권 = 수업 단위).
    const headerMap: Record<string, string> = {
      이메일: "email",
      "수업 ID": "classId",
      회차: "sessions",
      만료일: "expiresAt",
      사유: "reason",
    };

    const { rows, totalRows } = this.parseExcelFile(file.buffer, headerMap);

    const errors: Array<{ row: number; message: string }> = [];
    const validRows: Array<{
      rowNum: number;
      email: string;
      classId: string;
      sessions: number;
      expiresAt?: string;
      reason?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      const email = String(row.email ?? "")
        .trim()
        .toLowerCase();
      const classId = String(row.classId ?? "").trim();
      const sessionsRaw = Number(row.sessions);
      const expiresAt = String(row.expiresAt ?? "").trim() || undefined;
      const reason = String(row.reason ?? "").trim() || undefined;

      if (!email) {
        errors.push({ row: rowNum, message: "이메일이 비어 있습니다." });
        continue;
      }
      if (!classId) {
        errors.push({ row: rowNum, message: "수업 ID가 비어 있습니다." });
        continue;
      }
      if (isNaN(sessionsRaw) || sessionsRaw < 1 || sessionsRaw > 999) {
        errors.push({
          row: rowNum,
          message: "회차는 1~999 사이의 정수여야 합니다.",
        });
        continue;
      }
      if (expiresAt) {
        const dateVal = new Date(expiresAt);
        if (isNaN(dateVal.getTime())) {
          errors.push({
            row: rowNum,
            message: "만료일 형식이 올바르지 않습니다. (YYYY-MM-DD)",
          });
          continue;
        }
        if (dateVal <= new Date()) {
          errors.push({
            row: rowNum,
            message: "만료일은 현재 날짜 이후여야 합니다.",
          });
          continue;
        }
      }

      validRows.push({
        rowNum,
        email,
        classId,
        sessions: Math.floor(sessionsRaw),
        expiresAt,
        reason,
      });
    }

    if (validRows.length === 0) {
      return {
        success: false,
        totalRows,
        successCount: 0,
        failCount: totalRows,
        errors:
          errors.length > 0
            ? errors
            : [{ row: 0, message: "유효한 데이터가 없습니다." }],
      };
    }

    // 사용자 이메일 → ID 조회
    const emailList = validRows.map((r) => r.email);
    const users = await this.prisma.user.findMany({
      where: { email: { in: emailList } },
      select: { id: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.email, u.id]));

    // 2026-04-27 (N-9): "수업 ID" 유효성 확인 (Class 단위)
    const classIds = [...new Set(validRows.map((r) => r.classId))];
    const classes = await this.prisma.class.findMany({
      where: { id: { in: classIds } },
      select: { id: true },
    });
    const validClassIds = new Set(classes.map((c) => c.id));

    let successCount = 0;
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + 90);

    await this.prisma.$transaction(async (tx) => {
      for (const row of validRows) {
        const userId = userMap.get(row.email);
        if (!userId) {
          errors.push({
            row: row.rowNum,
            message: `등록되지 않은 이메일입니다: ${row.email}`,
          });
          continue;
        }

        if (!validClassIds.has(row.classId)) {
          errors.push({
            row: row.rowNum,
            message: `유효하지 않은 수업 ID입니다: ${row.classId}`,
          });
          continue;
        }

        const expiresAt = row.expiresAt
          ? new Date(row.expiresAt)
          : defaultExpiry;

        // PR-B (v0.5): CreditDomainService.issueFromPayment 위임 (관리자 일괄 발급)
        await this.creditDomain.issueFromPayment(tx, {
          paymentId: null, // 관리자 발급은 결제 없음
          userId,
          classId: row.classId,
          sessions: row.sessions,
          expiresAt,
          sourceLabel: row.reason || "관리자 일괄 충전",
        });

        successCount++;
      }

      // 감사 로그
      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "BULK_CREDIT_IMPORT",
          resource: "member_credits",
          newValue: {
            totalRows,
            successCount,
            failCount: errors.length,
          },
        },
      });
    });

    return {
      success: successCount > 0,
      totalRows,
      successCount,
      failCount: totalRows - successCount,
      errors,
    };
  }

  // ==================== 시스템 모니터링 ====================

  private pingService(
    port: number,
    timeout = 3000,
  ): Promise<{ status: "normal" | "error"; responseTime: number | null }> {
    return new Promise((resolve) => {
      const start = Date.now();
      const req = http.get(`http://localhost:${port}`, { timeout }, (res) => {
        res.resume();
        resolve({ status: "normal", responseTime: Date.now() - start });
      });
      req.on("error", () => resolve({ status: "error", responseTime: null }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ status: "error", responseTime: null });
      });
    });
  }

  async getSystemStatus() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100);
    const processMemMB = Math.round(process.memoryUsage().rss / 1024 / 1024);

    // [수정 2026-05-19] 사용자 요청 — 전체 포트 마이그레이션 web 5001 · admin 5002 · backend 5003
    // 서비스 헬스체크 병렬 실행
    const [webCheck, adminCheck, dbCheck, redisCheck] = await Promise.all([
      this.pingService(5001),
      this.pingService(5002),
      (async () => {
        const start = Date.now();
        try {
          await this.prisma.$queryRaw`SELECT 1`;
          return {
            status: "normal" as const,
            responseTime: Date.now() - start,
          };
        } catch {
          return { status: "error" as const, responseTime: null };
        }
      })(),
      (async () => {
        const start = Date.now();
        try {
          const client = new Redis({
            host: process.env.REDIS_HOST || "localhost",
            port: parseInt(process.env.REDIS_PORT || "6379"),
            connectTimeout: 3000,
            lazyConnect: true,
          });
          await client.connect();
          await client.ping();
          const rt = Date.now() - start;
          await client.quit();
          return { status: "normal" as const, responseTime: rt };
        } catch {
          return { status: "error" as const, responseTime: null };
        }
      })(),
    ]);

    // 활성 사용자 수 (최근 15분 내 감사 로그 기록이 있는 유저)
    let activeUsers = 0;
    try {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const result = await this.prisma.auditLog.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: fifteenMinutesAgo }, userId: { not: null } },
      });
      activeUsers = result.length;
    } catch {
      activeUsers = 0;
    }

    // [수정 2026-04-30] 사용자 요청 — 서버 정보 실시간 OS 데이터로 일원화.
    // 1) ip: 하드코딩 211.236.174.115 → 네트워크 인터페이스의 첫 외부 IPv4 (실서버 IP 자동 반영)
    // 2) uptime: process.uptime() (Node 프로세스 시간) → os.uptime() (OS 가동시간) — 실 서버 가동시간
    // 3) hostname: os.hostname() 그대로 — 실서버에선 'kcs-claw' 자동 반환
    let serverIp = "127.0.0.1";
    try {
      const ifaces = os.networkInterfaces();
      for (const name of Object.keys(ifaces)) {
        for (const info of ifaces[name] || []) {
          if (info.family === "IPv4" && !info.internal) {
            serverIp = info.address;
            break;
          }
        }
        if (serverIp !== "127.0.0.1") break;
      }
    } catch {
      // 인터페이스 조회 실패 시 기본값 유지
    }

    return {
      server: {
        ip: serverIp,
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        uptime: Math.floor(os.uptime()),
        memoryUsage: {
          total: totalMem,
          free: freeMem,
          usedPercent,
        },
        cpuLoad: os.loadavg(),
      },
      services: [
        {
          id: "backend",
          name: "Backend",
          label: "NestJS API 서버",
          // [수정 2026-05-19] backend 표준 포트 5003 (전체 마이그레이션 web 5001·admin 5002·backend 5003)
          port: 5003,
          status: "normal",
          responseTime: Math.floor(process.uptime() * 1000) > 0 ? 1 : null,
          memoryUsage: processMemMB,
        },
        {
          id: "web",
          name: "Web",
          label: "Next.js 웹 클라이언트",
          port: 5001,
          status: webCheck.status,
          responseTime: webCheck.responseTime,
          memoryUsage: null,
        },
        {
          id: "admin",
          name: "Admin",
          label: "Next.js 어드민",
          port: 5002,
          status: adminCheck.status,
          responseTime: adminCheck.responseTime,
          memoryUsage: null,
        },
        {
          id: "db",
          name: "Database",
          label: "PostgreSQL",
          status: dbCheck.status,
          responseTime: dbCheck.responseTime,
          memoryUsage: null,
        },
        {
          id: "redis",
          name: "Redis",
          label: "Redis 캐시 서버",
          status: redisCheck.status,
          responseTime: redisCheck.responseTime,
          memoryUsage: null,
        },
      ],
      activeUsers,
      timestamp: new Date().toISOString(),
    };
  }

  async getSystemLogs(params: {
    level?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const { level, search, page = 1, limit = 50 } = params;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (search) {
      where.OR = [
        { action: { contains: search, mode: "insensitive" } },
        { resource: { contains: search, mode: "insensitive" } },
      ];
    }

    // level 필터: action 기반 매핑
    if (level && level !== "ALL") {
      if (level === "ERROR") {
        where.action = { contains: "ERROR", mode: "insensitive" };
      } else if (level === "WARN") {
        where.action = { in: ["DELETE", "REJECT", "BLOCK", "LOCK"] };
      } else if (level === "DEBUG") {
        where.action = { in: ["READ", "VIEW", "GET", "LIST"] };
      }
      // INFO = 나머지 (CREATE, UPDATE, APPROVE 등) — 필터 없이 전체에서 매핑
    }

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          action: true,
          resource: true,
          oldValue: true,
          newValue: true,
          ipAddress: true,
          createdAt: true,
          userId: true,
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const mapLevel = (action: string): string => {
      const upper = action.toUpperCase();
      if (upper.includes("ERROR") || upper.includes("FAIL")) return "ERROR";
      if (["DELETE", "REJECT", "BLOCK", "LOCK"].some((k) => upper.includes(k)))
        return "WARN";
      if (["READ", "VIEW", "GET", "LIST"].some((k) => upper.includes(k)))
        return "DEBUG";
      return "INFO";
    };

    return {
      data: logs.map((log) => ({
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        level: mapLevel(log.action),
        module: log.resource || log.action,
        message: `[${log.action}] ${log.resource || ""}${log.ipAddress ? ` (IP: ${log.ipAddress})` : ""}`,
        userId: log.userId,
      })),
      total,
      page,
      limit,
    };
  }

  // ==================== 벌크 임포트 (Teams / Players / Schedules) ====================

  /**
   * 팀 일괄 등록 — Phase 2.5 (2026-04-29) 정식 구현
   *
   * Phase 2 모델 통합 후 Team = Club 단일화. 입력 dto.teamId 는 무시되며
   * (자체가 곧 클럽), 새 clubs row 를 INSERT 하는 형태로 변경됨.
   * 기존 호출자가 teamId 를 보내도 무시되고 신규 club 이 생성됨.
   */
  async importTeams(
    teams: {
      teamId: string; // 무시 (Phase 2 후 의미 없음)
      name: string;
      shortName?: string;
      division?: string;
      primaryColor?: string;
      secondaryColor?: string;
      isActive?: boolean;
    }[],
    adminId: string,
  ) {
    const results = await this.prisma.$transaction(async (tx) => {
      const created: { id: string; name: string }[] = [];
      const errors: { index: number; message: string }[] = [];

      for (let i = 0; i < teams.length; i++) {
        const item = teams[i];
        try {
          // 동일 이름 중복 검증
          const duplicate = await tx.team.findFirst({
            where: { name: item.name, isActive: true },
            select: { id: true },
          });
          if (duplicate) {
            errors.push({
              index: i,
              message: `같은 이름의 팀이 이미 존재합니다: ${item.name}`,
            });
            continue;
          }

          const club = await tx.team.create({
            data: {
              teamCode: `TEAM-${Date.now().toString(36).toUpperCase()}-${i}`,
              name: item.name,
              coachId: adminId, // 일괄 등록 시 관리자를 임시 감독으로
              shortName: item.shortName,
              division: item.division,
              primaryColor: item.primaryColor,
              secondaryColor: item.secondaryColor,
              isActive: item.isActive ?? true,
            },
            select: { id: true, name: true },
          });
          created.push({ id: club.id, name: club.name });
        } catch (error) {
          errors.push({ index: i, message: (error as Error).message });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "BULK_IMPORT_TEAMS",
          resource: "clubs",
          newValue: {
            totalRequested: teams.length,
            successCount: created.length,
            failCount: errors.length,
          },
        },
      });

      return { created, errors };
    });

    return {
      success: true,
      totalRequested: teams.length,
      successCount: results.created.length,
      failCount: results.errors.length,
      created: results.created,
      errors: results.errors,
    };
  }

  /**
   * 선수(로스터) 일괄 등록
   */
  async importPlayers(
    players: {
      teamId: string;
      memberId: string;
      position?: string;
      jerseyNumber?: number;
      role?: string;
    }[],
    adminId: string,
  ) {
    // Phase 2.5 (2026-04-29) — TeamRoster → TeamGroupMember 단일화 후 정식 구현.
    //  - teamId == clubs.id (Phase 2 통합)
    //  - "기본" 그룹 자동 생성 후 team_group_members 에 등록
    //  - 등번호 중복 검증 (group 통한 1단계 lookup)
    const results = await this.prisma.$transaction(async (tx) => {
      const created: { id: string; teamId: string; memberId: string }[] = [];
      const errors: { index: number; message: string }[] = [];

      // teamId 별 "기본" 그룹 캐시 (반복 lookup 방지)
      const defaultGroupCache = new Map<string, string>();

      for (let i = 0; i < players.length; i++) {
        const item = players[i];
        try {
          // 팀(=club) 존재 확인
          const club = await tx.team.findUnique({
            where: { id: item.teamId },
            select: { id: true },
          });
          if (!club) {
            errors.push({
              index: i,
              message: `팀을 찾을 수 없습니다: ${item.teamId}`,
            });
            continue;
          }

          // ClubMember 존재 + 동일 클럽 + approved 검증
          const member = await tx.teamMember.findUnique({
            where: { id: item.memberId },
            select: { id: true, teamId: true, approvalStatus: true },
          });
          if (!member) {
            errors.push({
              index: i,
              message: `회원을 찾을 수 없습니다: ${item.memberId}`,
            });
            continue;
          }
          if (member.teamId !== item.teamId) {
            errors.push({
              index: i,
              message: `회원이 해당 팀 소속이 아닙니다: memberId=${item.memberId}`,
            });
            continue;
          }
          if (member.approvalStatus !== "approved") {
            errors.push({
              index: i,
              message: `승인되지 않은 회원입니다: ${item.memberId}`,
            });
            continue;
          }

          // 등번호 중복 검증 (팀 전체 그룹 합산)
          if (item.jerseyNumber !== undefined) {
            const dup = await tx.teamGroupMember.findFirst({
              where: {
                group: { teamId: item.teamId },
                jerseyNumber: item.jerseyNumber,
                leftAt: null,
              },
              select: { id: true },
            });
            if (dup) {
              errors.push({
                index: i,
                message: `등번호 ${item.jerseyNumber} 가 이미 사용 중입니다 (teamId=${item.teamId})`,
              });
              continue;
            }
          }

          // "기본" 그룹 확보 (캐시 활용)
          let defaultGroupId = defaultGroupCache.get(item.teamId);
          if (!defaultGroupId) {
            const existing = await tx.teamGroup.findFirst({
              where: { teamId: item.teamId, name: "기본" },
              select: { id: true },
            });
            if (existing) {
              defaultGroupId = existing.id;
            } else {
              const newGroup = await tx.teamGroup.create({
                data: { teamId: item.teamId, name: "기본", isActive: true },
                select: { id: true },
              });
              defaultGroupId = newGroup.id;
            }
            defaultGroupCache.set(item.teamId, defaultGroupId);
          }

          // 동일 그룹 내 멤버 중복 검증 (unique 제약)
          const existingMember = await tx.teamGroupMember.findUnique({
            where: {
              groupId_memberId: {
                groupId: defaultGroupId,
                memberId: item.memberId,
              },
            },
            select: { id: true },
          });
          if (existingMember) {
            errors.push({
              index: i,
              message: `이미 등록된 선수입니다: teamId=${item.teamId}, memberId=${item.memberId}`,
            });
            continue;
          }

          const tgm = await tx.teamGroupMember.create({
            data: {
              groupId: defaultGroupId,
              memberId: item.memberId,
              position: item.position,
              jerseyNumber: item.jerseyNumber,
              isCaptain: item.role === "captain",
              isAltCaptain: item.role === "alternate_captain",
              status: "active",
            },
            select: { id: true, memberId: true },
          });
          created.push({
            id: tgm.id,
            teamId: item.teamId,
            memberId: tgm.memberId,
          });
        } catch (error) {
          errors.push({ index: i, message: (error as Error).message });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "BULK_IMPORT_PLAYERS",
          resource: "team_group_members",
          newValue: {
            totalRequested: players.length,
            successCount: created.length,
            failCount: errors.length,
          },
        },
      });

      return { created, errors };
    });

    return {
      success: true,
      totalRequested: players.length,
      successCount: results.created.length,
      failCount: results.errors.length,
      created: results.created,
      errors: results.errors,
    };
  }

  /**
   * 일정 일괄 등록
   */
  async importSchedules(
    schedules: {
      classId: string;
      scheduledDate: string;
    }[],
    adminId: string,
  ) {
    const results = await this.prisma.$transaction(async (tx) => {
      const created: { id: string; classId: string; scheduledDate: Date }[] =
        [];
      const errors: { index: number; message: string }[] = [];

      for (let i = 0; i < schedules.length; i++) {
        const item = schedules[i];
        try {
          const cls = await tx.class.findUnique({
            where: { id: item.classId },
            select: { id: true },
          });
          if (!cls) {
            errors.push({
              index: i,
              message: `수업을 찾을 수 없습니다: ${item.classId}`,
            });
            continue;
          }

          const scheduledDate = new Date(item.scheduledDate);
          if (isNaN(scheduledDate.getTime())) {
            errors.push({
              index: i,
              message: `유효하지 않은 날짜입니다: ${item.scheduledDate}`,
            });
            continue;
          }

          const schedule = await tx.classSchedule.create({
            data: {
              classId: item.classId,
              scheduledDate,
            },
          });
          created.push({
            id: schedule.id,
            classId: schedule.classId,
            scheduledDate: schedule.scheduledDate,
          });
        } catch (error) {
          errors.push({ index: i, message: (error as Error).message });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: "BULK_IMPORT_SCHEDULES",
          resource: "class_schedules",
          newValue: {
            totalRequested: schedules.length,
            successCount: created.length,
            failCount: errors.length,
          },
        },
      });

      return { created, errors };
    });

    return {
      success: true,
      totalRequested: schedules.length,
      successCount: results.created.length,
      failCount: results.errors.length,
      created: results.created,
      errors: results.errors,
    };
  }

  // ==================== 사용자 목록 (역할별) ====================

  async getUsersByType(query: {
    userType?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { status: "ACTIVE" };
    if (query.userType) {
      // 콤마로 구분된 다중 타입 지원 (예: TEEN,CHILD)
      const types = query.userType.split(",").map((t) => t.trim());
      where.userType = types.length === 1 ? types[0] : { in: types };
    }
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: "insensitive" } },
        { lastName: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          userType: true,
          createdAt: true,
          coachProfile: {
            select: {
              teamId: true,
              team: { select: { name: true, teamCode: true } },
            },
          },
          parentChildren: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      name: `${u.lastName ?? ""}${u.firstName ?? ""}`.trim(),
      email: u.email,
      phone: u.phone,
      userType: u.userType,
      coachTeamName: u.coachProfile?.team?.teamCode?.includes("ACADEMY")
        ? ""
        : (u.coachProfile?.team?.name ?? ""),
      academyName: u.coachProfile?.team?.teamCode?.includes("ACADEMY")
        ? (u.coachProfile?.team?.name ?? "")
        : "",
      childrenCount: u.parentChildren?.length ?? 0,
      createdAt: u.createdAt,
    }));

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ==================== 클럽/아카데미 목록 ====================

  async getClubs(type?: string) {
    const where: Record<string, unknown> = {};
    if (type === "academy") {
      where.teamCode = { contains: "ACADEMY" };
    } else if (type === "club") {
      where.NOT = { teamCode: { contains: "ACADEMY" } };
    }

    const clubs = await this.prisma.team.findMany({
      where,
      select: {
        id: true,
        teamCode: true,
        name: true,
        location: true,
        phone: true,
        createdAt: true,
        coach: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        _count: { select: { members: true, classes: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return clubs.map((c) => ({
      id: c.id,
      teamCode: c.teamCode,
      name: c.name,
      location: c.location,
      phone: c.phone,
      directorName: c.coach
        ? `${c.coach.lastName ?? ""}${c.coach.firstName ?? ""}`.trim()
        : "",
      directorEmail: c.coach?.email ?? "",
      memberCount: c._count.members,
      classCount: c._count.classes,
      createdAt: c.createdAt,
    }));
  }

  // ==================== 수업 승인 관리 ====================

  async getClassApprovals(query: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.status) {
      where.approvalStatus = query.status;
    }

    const [classes, total] = await this.prisma.$transaction([
      this.prisma.class.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          className: true,
          approvalStatus: true,
          approvedAt: true,
          approvedBy: true,
          rejectionReason: true,
          capacity: true,
          startTime: true,
          endTime: true,
          classDays: true,
          trainingType: true,
          category: true,
          createdAt: true,
          team: { select: { id: true, name: true } },
          coach: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              userType: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.class.count({ where }),
    ]);

    const data = classes.map((c) => ({
      id: c.id,
      className: c.className,
      approvalStatus: c.approvalStatus,
      approvedAt: c.approvedAt,
      rejectionReason: c.rejectionReason,
      capacity: c.capacity,
      startTime: c.startTime,
      endTime: c.endTime,
      classDays: c.classDays,
      trainingType: c.trainingType,
      category: c.category,
      name: c.team?.name ?? "",
      applicant: c.coach
        ? `${c.coach.lastName ?? ""}${c.coach.firstName ?? ""}`.trim()
        : "",
      applicantRole: c.coach?.userType ?? "",
      createdAt: c.createdAt,
    }));

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async approveClass(classId: string, adminUserId: string) {
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classRecord) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: {
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: adminUserId,
        isActive: true,
      },
      select: {
        id: true,
        className: true,
        approvalStatus: true,
        approvedAt: true,
        coachId: true,
      },
    });

    // 수업 담당 코치에게 "승인 완료 + 스케줄 등록 유도" 알림 발송
    // - 딥링크: /classes-manage/:id/schedules (스케줄 등록 페이지로 즉시 이동)
    // - 알림 실패는 승인 성공에 영향을 주지 않도록 catch 처리 (주 흐름 차단 방지)
    // - 실패 시에도 운영 추적 가능하도록 console.warn 로그 기록
    if (updated.coachId) {
      this.notificationsService
        .createNotification({
          userId: updated.coachId,
          notificationType: "class_approved",
          title: "수업이 승인되었습니다",
          message: `${updated.className} 수업이 승인되었습니다. 일정을 등록해주세요.`,
          linkUrl: `/classes-manage/${updated.id}/schedules`,
        })
        .catch((err: unknown) => {
          // eslint-disable-next-line no-console
          console.warn(
            `[AdminService.approveClass] 승인 알림 발송 실패: classId=${updated.id}, coachId=${updated.coachId}`,
            err instanceof Error ? err.message : err,
          );
        });
    }

    return updated;
  }

  async rejectClass(classId: string, adminUserId: string, reason?: string) {
    const classRecord = await this.prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classRecord) {
      throw new NotFoundException("수업을 찾을 수 없습니다.");
    }

    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: {
        approvalStatus: "REJECTED",
        approvedAt: new Date(),
        approvedBy: adminUserId,
        rejectionReason: reason ?? null,
        isActive: false,
      },
      select: {
        id: true,
        className: true,
        approvalStatus: true,
        rejectionReason: true,
      },
    });

    return updated;
  }
}
