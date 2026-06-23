import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";

export interface TransferRequest {
  userId: string;
  reason?: string;
}

export interface TransferResult {
  oldMemberId: string;
  newMemberId: string;
  oldTeamId: string;
  newTeamId: string;
  transferredAt: string;
}

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 회원 이적 처리 ($transaction 원자성 보장)
   *
   * 1. 기존 ClubMember → approvalStatus='transferred'
   * 2. 신규 ClubMember 생성 (approvalStatus='approved')
   * 3. PlayerCareer 이력 생성 (이전 클럽 종료 기록)
   * 4. PlayerClassHistory 는 보존 (삭제 금지)
   */
  async transferMember(
    _requesterId: string,
    requesterType: string,
    newTeamId: string,
    oldTeamId: string,
    dto: TransferRequest,
  ): Promise<TransferResult> {
    const { userId, reason } = dto;

    // 권한 검증: DIRECTOR/ADMIN만 이적 처리 가능
    if (!["DIRECTOR", "ADMIN", "ACADEMY_DIRECTOR"].includes(requesterType)) {
      throw new ForbiddenException(
        "감독 또는 관리자만 이적 처리를 할 수 있습니다.",
      );
    }

    // 대상 팀 존재 여부
    const [oldClub, newClub] = await Promise.all([
      this.prisma.team.findUnique({
        where: { id: oldTeamId },
        select: { id: true, name: true },
      }),
      this.prisma.team.findUnique({
        where: { id: newTeamId },
        select: { id: true, name: true },
      }),
    ]);

    if (!oldClub) throw new NotFoundException("이전 팀을 찾을 수 없습니다.");
    if (!newClub) throw new NotFoundException("신규 팀을 찾을 수 없습니다.");
    if (oldTeamId === newTeamId) {
      throw new BadRequestException("이전 팀과 신규 팀이 동일합니다.");
    }

    // 이전 TeamMember 확인
    const oldMember = await this.prisma.teamMember.findFirst({
      where: { userId, teamId: oldTeamId, approvalStatus: "approved" },
      select: {
        id: true,
        playerName: true,
        playerAge: true,
        playerLevel: true,
        joinedAt: true,
      },
    });
    if (!oldMember) {
      throw new NotFoundException(
        "이전 클럽에서 승인된 회원을 찾을 수 없습니다.",
      );
    }

    // 신규 팀 중복 가입 여부
    const existing = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: newTeamId,
        approvalStatus: { not: "transferred" },
      },
      select: { id: true, approvalStatus: true },
    });
    if (existing) {
      throw new ConflictException("신규 팀에 이미 회원으로 등록되어 있습니다.");
    }

    const transferredAt = new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. 기존 TeamMember → transferred
      await tx.teamMember.update({
        where: { id: oldMember.id },
        data: { approvalStatus: "transferred", leftAt: transferredAt },
      });

      // 2. 신규 TeamMember 생성
      const newMember = await tx.teamMember.create({
        data: {
          userId,
          teamId: newTeamId,
          playerName: oldMember.playerName,
          playerAge: oldMember.playerAge,
          playerLevel: oldMember.playerLevel ?? undefined,
          approvalStatus: "approved",
          joinedAt: transferredAt,
        },
        select: { id: true },
      });

      // 3. PlayerCareer 이력 생성 (이전 클럽 종료 기록)
      await tx.playerCareer.create({
        data: {
          memberId: oldMember.id,
          teamName: oldClub.name,
          startDate: oldMember.joinedAt,
          endDate: transferredAt,
          isCurrent: false,
          description: reason
            ? `이적 (${newClub.name}으로): ${reason}`
            : `이적 (${newClub.name}으로)`,
        },
      });

      return {
        oldMemberId: oldMember.id,
        newMemberId: newMember.id,
        oldTeamId,
        newTeamId,
        transferredAt: transferredAt.toISOString(),
      };
    });

    this.logger.log(
      `[Transfer] 이적 완료: userId=${userId}, ${oldClub.name} → ${newClub.name}`,
    );

    return result;
  }
}
