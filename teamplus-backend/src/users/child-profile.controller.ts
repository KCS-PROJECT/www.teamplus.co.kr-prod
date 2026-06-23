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
  ChildProfileService,
  CreateChildProfileDto,
  UpdateChildProfileDto,
} from "./child-profile.service";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Child Profile")
@Controller("api/v1/child-profile")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("CHILD")
@ApiBearerAuth()
export class ChildProfileController {
  constructor(private readonly childProfileService: ChildProfileService) {}

  /**
   * 자녀 프로필 생성
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "자녀 프로필 생성",
    description: "CHILD 타입 사용자만 프로필을 생성할 수 있습니다.",
  })
  @ApiResponse({
    status: 201,
    description: "프로필이 성공적으로 생성되었습니다.",
    schema: {
      example: {
        id: "profile-uuid",
        firstName: "철수",
        lastName: "김",
        birthDate: "2018-06-15T00:00:00Z",
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "이미 프로필이 존재하거나 나이가 유효하지 않습니다.",
  })
  @ApiResponse({
    status: 403,
    description: "자녀 사용자만 프로필을 생성할 수 있습니다.",
  })
  async createChildProfile(
    @Request() req: AuthenticatedRequest,
    @Body() createDto: CreateChildProfileDto,
  ) {
    return this.childProfileService.createChildProfile(req.user.id, createDto);
  }

  /**
   * 자녀 프로필 조회
   */
  @Get()
  @ApiOperation({
    summary: "자녀 프로필 조회",
    description: "현재 사용자의 자녀 프로필을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "프로필 조회 성공",
    schema: {
      example: {
        id: "profile-uuid",
        userId: "user-uuid",
        firstName: "철수",
        lastName: "김",
        birthDate: "2018-06-15T00:00:00Z",
        age: 7,
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async getChildProfile(@Request() req: AuthenticatedRequest) {
    return this.childProfileService.getChildProfile(req.user.id);
  }

  /**
   * 자녀 프로필 수정
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 프로필 수정",
    description: "자녀 프로필의 정보를 수정합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "프로필이 수정되었습니다.",
  })
  @ApiResponse({
    status: 400,
    description: "나이가 유효하지 않습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async updateChildProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateDto: UpdateChildProfileDto,
  ) {
    return this.childProfileService.updateChildProfile(req.user.id, updateDto);
  }

  /**
   * 자녀가 속한 클럽 목록 조회
   */
  @Get("clubs")
  @ApiOperation({
    summary: "자녀의 클럽 목록",
    description: "자녀가 가입한 클럽 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "클럽 목록 조회 성공",
    schema: {
      example: [
        {
          teamId: "club-uuid",
          teamCode: "ACE-hockey",
          name: "서울 아이스 클럽",
          coachName: "이순신 감독",
          location: "서울시 강남구",
          playerName: "김철수",
          playerAge: 7,
          joinedAt: "2026-01-04T10:00:00Z",
        },
      ],
    },
  })
  async getChildClubs(@Request() req: AuthenticatedRequest) {
    return this.childProfileService.getChildClubs(req.user.id);
  }
}
