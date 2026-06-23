import {
  Controller,
  Get,
  Param,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { PrismaService } from "@/prisma/prisma.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

/**
 * 공개 코치 상세 조회 — 로그인한 모든 회원(COACH/DIRECTOR/PARENT/TEEN/CHILD/ADMIN)이
 * 코치의 공개 프로필·경력·자격을 조회할 수 있습니다.
 *
 * - GET /api/v1/coaches/:id — User.userType='COACH' 확인 + StaffCareer 조인
 * - 카드 결제 등 민감 정보는 포함하지 않습니다
 */
@ApiTags("Coaches")
@Controller("api/v1/coaches")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles(
  "SYSTEM",
  "OPER",
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
@ApiBearerAuth()
export class CoachesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id")
  @ApiOperation({
    summary: "공개 코치 상세 조회",
    description:
      "코치의 공개 프로필·경력·자격을 조회합니다. CoachDetailPage에서 사용합니다.",
  })
  @ApiParam({ name: "id", description: "코치 User ID (cuid)" })
  @ApiResponse({ status: 200, description: "코치 상세 조회 성공" })
  @ApiResponse({ status: 400, description: "잘못된 코치 ID 형식" })
  @ApiResponse({ status: 404, description: "코치를 찾을 수 없음" })
  async getCoachDetail(@Param("id") id: string) {
    // cuid 형식 검증 (c + 24글자 영숫자) — 'menu' 같은 잘못된 경로 조기 차단
    if (!/^c[a-z0-9]{20,30}$/.test(id)) {
      throw new BadRequestException("잘못된 코치 ID 형식입니다.");
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id,
        userType: "COACH",
        status: "ACTIVE",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        coachProfile: {
          select: {
            id: true,
            teamId: true,
          },
        },
        staffCareers: {
          orderBy: { displayOrder: "asc" },
          select: {
            id: true,
            role: true,
            organizationName: true,
            leagueName: true,
            startDate: true,
            endDate: true,
            isCurrent: true,
            description: true,
            certifications: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("코치를 찾을 수 없습니다.");
    }

    // StaffCareer → careers 매핑
    const careers = user.staffCareers.map((c) => ({
      id: c.id,
      title: c.organizationName,
      subtitle: c.role,
    }));

    // 자격증 JSON 파싱 (certifications 필드에 JSON 배열 저장)
    const certifications: { id: string; name: string }[] = [];
    for (const career of user.staffCareers) {
      if (!career.certifications) continue;
      try {
        const parsed = JSON.parse(career.certifications);
        if (Array.isArray(parsed)) {
          parsed.forEach((name: unknown, idx: number) => {
            if (typeof name === "string") {
              certifications.push({ id: `${career.id}-${idx}`, name });
            }
          });
        }
      } catch {
        // 파싱 실패 시 무시
      }
    }

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.lastName ?? ""}${user.firstName ?? ""}`,
      avatarUrl: user.avatarUrl,
      specialty: "",
      bio: "",
      careers,
      certifications,
      rating: 0,
      reviewCount: 0,
      reviews: [],
    };
  }
}
