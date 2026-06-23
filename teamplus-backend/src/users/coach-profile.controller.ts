import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import {
  CoachProfileService,
  CreateCoachProfileDto,
  UpdateCoachProfileDto,
} from "./coach-profile.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Coach Profile")
@Controller("api/v1/coach-profile")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("COACH", "DIRECTOR")
@ApiBearerAuth()
export class CoachProfileController {
  constructor(private readonly coachProfileService: CoachProfileService) {}

  /**
   * 감독 프로필 생성
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "감독 프로필 생성",
    description: "COACH 타입 사용자만 프로필을 생성할 수 있습니다.",
  })
  @ApiResponse({
    status: 201,
    description: "프로필이 성공적으로 생성되었습니다.",
    schema: {
      example: {
        id: "profile-uuid",
        firstName: "이순신",
        lastName: "감독",
        teamId: "club-uuid",
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "이미 프로필이 존재하거나 클럽이 없습니다.",
  })
  @ApiResponse({
    status: 403,
    description: "감독 사용자만 프로필을 생성할 수 있습니다.",
  })
  async createCoachProfile(
    @Request() req: AuthenticatedRequest,
    @Body() createDto: CreateCoachProfileDto,
  ) {
    return this.coachProfileService.createCoachProfile(req.user.id, createDto);
  }

  /**
   * 감독 프로필 조회
   */
  @Get()
  @ApiOperation({
    summary: "감독 프로필 조회",
    description: "현재 감독의 프로필과 클럽 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "프로필 조회 성공",
    schema: {
      example: {
        id: "profile-uuid",
        userId: "user-uuid",
        firstName: "이순신",
        lastName: "감독",
        teamId: "club-uuid",
        team: {
          id: "club-uuid",
          teamCode: "ACE-hockey",
          name: "서울 아이스 클럽",
          coachName: "이순신",
          location: "서울시 강남구",
          phone: "010-1234-5678",
        },
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async getCoachProfile(@Request() req: AuthenticatedRequest) {
    return this.coachProfileService.getCoachProfile(req.user.id);
  }

  /**
   * 감독 프로필 수정
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "감독 프로필 수정",
    description: "감독 프로필의 이름을 수정합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "프로필이 수정되었습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async updateCoachProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateDto: UpdateCoachProfileDto,
  ) {
    return this.coachProfileService.updateCoachProfile(req.user.id, updateDto);
  }

  /**
   * 감독의 클럽 조회
   */
  @Get("club")
  @ApiOperation({
    summary: "감독의 클럽 정보",
    description: "감독이 관리하는 클럽 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "클럽 정보 조회 성공",
    schema: {
      example: {
        id: "club-uuid",
        teamCode: "ACE-hockey",
        name: "서울 아이스 클럽",
        coachName: "이순신",
        phone: "010-1234-5678",
        location: "서울시 강남구",
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async getCoachClub(@Request() req: AuthenticatedRequest) {
    return this.coachProfileService.getCoachClub(req.user.id);
  }

  /**
   * 클럽 멤버 통계
   */
  @Get("club/statistics")
  @ApiOperation({
    summary: "클럽 멤버 통계",
    description:
      "클럽의 총 멤버 수, 승인된 멤버 수, 대기 중인 멤버 수를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "통계 조회 성공",
    schema: {
      example: {
        teamId: "club-uuid",
        totalMembers: 25,
        approvedMembers: 22,
        pendingMembers: 3,
        approvalRate: "88.0",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async getClubStatistics(@Request() req: AuthenticatedRequest) {
    return this.coachProfileService.getClubStatistics(req.user.id);
  }

  /**
   * 클럽 수업 목록
   */
  @Get("club/classes")
  @ApiOperation({
    summary: "클럽 수업 목록",
    description: "감독의 클럽에 등록된 모든 수업 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "수업 목록 조회 성공",
    schema: {
      example: [
        {
          id: "class-uuid",
          className: "신규 수강생반",
          instructorName: "김철수",
          capacity: 15,
          startTime: "16:00",
          endTime: "17:00",
          isActive: true,
          createdAt: "2026-01-04T10:00:00Z",
        },
      ],
    },
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async getCoachClasses(@Request() req: AuthenticatedRequest) {
    return this.coachProfileService.getCoachClasses(req.user.id);
  }
}
