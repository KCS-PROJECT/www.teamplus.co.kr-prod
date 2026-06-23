import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CareersService } from "./careers.service";
import { CreatePlayerCareerDto } from "./dto/create-player-career.dto";
import { UpdatePlayerCareerDto } from "./dto/update-player-career.dto";
import { CreateStaffCareerDto } from "./dto/create-staff-career.dto";
import { UpdateStaffCareerDto } from "./dto/update-staff-career.dto";

@ApiTags("Careers (경력 관리)")
@Controller("api/v1/careers")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. mutation 은 메서드 레벨 @Roles.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class CareersController {
  constructor(private readonly careersService: CareersService) {}

  // ==================== Player Career ====================

  @Get("player")
  @ApiOperation({ summary: "선수 경력 목록 조회" })
  @ApiQuery({ name: "memberId", required: false, description: "ClubMember ID" })
  @ApiQuery({
    name: "isCurrent",
    required: false,
    description: "현재 소속 여부",
    enum: ["true", "false"],
  })
  @ApiResponse({ status: 200, description: "선수 경력 목록" })
  async findAllPlayerCareers(
    @Query("memberId") memberId?: string,
    @Query("isCurrent") isCurrent?: string,
  ) {
    const current =
      isCurrent === "true" ? true : isCurrent === "false" ? false : undefined;
    return this.careersService.findAllPlayerCareers(memberId, current);
  }

  @Get("player/:id")
  @ApiOperation({ summary: "선수 경력 상세 조회" })
  @ApiParam({ name: "id", description: "PlayerCareer ID" })
  @ApiResponse({ status: 200, description: "선수 경력 상세" })
  @ApiResponse({ status: 404, description: "선수 경력을 찾을 수 없습니다." })
  async findPlayerCareerById(@Param("id") id: string) {
    return this.careersService.findPlayerCareerById(id);
  }

  @Post("player")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "선수 경력 등록" })
  @ApiResponse({ status: 201, description: "선수 경력이 등록되었습니다." })
  @ApiResponse({ status: 404, description: "클럽 회원을 찾을 수 없습니다." })
  async createPlayerCareer(@Body() dto: CreatePlayerCareerDto) {
    return this.careersService.createPlayerCareer(dto);
  }

  @Patch("player/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({ summary: "선수 경력 수정" })
  @ApiParam({ name: "id", description: "PlayerCareer ID" })
  @ApiResponse({ status: 200, description: "선수 경력이 수정되었습니다." })
  @ApiResponse({ status: 404, description: "선수 경력을 찾을 수 없습니다." })
  async updatePlayerCareer(
    @Param("id") id: string,
    @Body() dto: UpdatePlayerCareerDto,
  ) {
    return this.careersService.updatePlayerCareer(id, dto);
  }

  @Delete("player/:id")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({ summary: "선수 경력 삭제" })
  @ApiParam({ name: "id", description: "PlayerCareer ID" })
  @ApiResponse({ status: 200, description: "선수 경력이 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "선수 경력을 찾을 수 없습니다." })
  async deletePlayerCareer(@Param("id") id: string) {
    return this.careersService.deletePlayerCareer(id);
  }

  @Get("player/summary/:memberId")
  @ApiOperation({ summary: "선수 경력 요약 (포트폴리오용)" })
  @ApiParam({ name: "memberId", description: "ClubMember ID" })
  @ApiResponse({ status: 200, description: "선수 경력 요약" })
  @ApiResponse({ status: 404, description: "클럽 회원을 찾을 수 없습니다." })
  async getPlayerCareerSummary(@Param("memberId") memberId: string) {
    return this.careersService.getPlayerCareerSummary(memberId);
  }

  // ==================== Staff Career ====================

  @Get("staff")
  @ApiOperation({ summary: "스태프 경력 목록 조회" })
  @ApiQuery({ name: "userId", required: false, description: "User ID" })
  @ApiQuery({
    name: "role",
    required: false,
    description: "역할",
    enum: [
      "head_coach",
      "assistant_coach",
      "goalie_coach",
      "director",
      "manager",
      "trainer",
      "referee",
      "analyst",
    ],
  })
  @ApiQuery({
    name: "isCurrent",
    required: false,
    description: "현재 재직 여부",
    enum: ["true", "false"],
  })
  @ApiResponse({ status: 200, description: "스태프 경력 목록" })
  async findAllStaffCareers(
    @Query("userId") userId?: string,
    @Query("role") role?: string,
    @Query("isCurrent") isCurrent?: string,
  ) {
    const current =
      isCurrent === "true" ? true : isCurrent === "false" ? false : undefined;
    return this.careersService.findAllStaffCareers(userId, role, current);
  }

  @Get("staff/:id")
  @ApiOperation({ summary: "스태프 경력 상세 조회" })
  @ApiParam({ name: "id", description: "StaffCareer ID" })
  @ApiResponse({ status: 200, description: "스태프 경력 상세" })
  @ApiResponse({ status: 404, description: "스태프 경력을 찾을 수 없습니다." })
  async findStaffCareerById(@Param("id") id: string) {
    return this.careersService.findStaffCareerById(id);
  }

  @Post("staff")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "스태프 경력 등록" })
  @ApiResponse({ status: 201, description: "스태프 경력이 등록되었습니다." })
  @ApiResponse({
    status: 404,
    description: "사용자를 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 403,
    description: "감독, 코치, 관리자만 경력 등록 가능",
  })
  async createStaffCareer(@Body() dto: CreateStaffCareerDto) {
    return this.careersService.createStaffCareer(dto);
  }

  @Patch("staff/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({ summary: "스태프 경력 수정" })
  @ApiParam({ name: "id", description: "StaffCareer ID" })
  @ApiResponse({ status: 200, description: "스태프 경력이 수정되었습니다." })
  @ApiResponse({ status: 404, description: "스태프 경력을 찾을 수 없습니다." })
  async updateStaffCareer(
    @Param("id") id: string,
    @Body() dto: UpdateStaffCareerDto,
  ) {
    return this.careersService.updateStaffCareer(id, dto);
  }

  @Delete("staff/:id")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({ summary: "스태프 경력 삭제" })
  @ApiParam({ name: "id", description: "StaffCareer ID" })
  @ApiResponse({ status: 200, description: "스태프 경력이 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "스태프 경력을 찾을 수 없습니다." })
  async deleteStaffCareer(@Param("id") id: string) {
    return this.careersService.deleteStaffCareer(id);
  }

  @Get("staff/profile/:userId")
  @ApiOperation({ summary: "스태프 경력 프로필 (전체 경력 + 요약)" })
  @ApiParam({ name: "userId", description: "User ID" })
  @ApiResponse({ status: 200, description: "스태프 경력 프로필" })
  @ApiResponse({ status: 404, description: "사용자를 찾을 수 없습니다." })
  async getStaffCareerProfile(@Param("userId") userId: string) {
    return this.careersService.getStaffCareerProfile(userId);
  }
}
