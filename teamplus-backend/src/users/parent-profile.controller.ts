import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
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
  ParentProfileService,
  CreateParentProfileDto,
  UpdateParentProfileDto,
} from "./parent-profile.service";
import { AddChildDto } from "./dto/add-child.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Parent Profile")
@Controller("api/v1/parent-profile")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Roles("PARENT")
@ApiBearerAuth()
export class ParentProfileController {
  constructor(private readonly parentProfileService: ParentProfileService) {}

  /**
   * 학부모 프로필 생성
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "학부모 프로필 생성",
    description: "PARENT 타입 사용자만 프로필을 생성할 수 있습니다.",
  })
  @ApiResponse({
    status: 201,
    description: "프로필이 성공적으로 생성되었습니다.",
    schema: {
      example: {
        id: "profile-uuid",
        firstName: "순신",
        lastName: "이",
        createdAt: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "이미 프로필이 존재합니다.",
  })
  @ApiResponse({
    status: 403,
    description: "학부모 사용자만 프로필을 생성할 수 있습니다.",
  })
  async createParentProfile(
    @Request() req: AuthenticatedRequest,
    @Body() createDto: CreateParentProfileDto,
  ) {
    return this.parentProfileService.createParentProfile(
      req.user.id,
      createDto,
    );
  }

  /**
   * 학부모 프로필 조회
   */
  @Get()
  @ApiOperation({
    summary: "학부모 프로필 조회",
    description: "현재 사용자의 학부모 프로필을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "프로필 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async getParentProfile(@Request() req: AuthenticatedRequest) {
    return this.parentProfileService.getParentProfile(req.user.id);
  }

  /**
   * 학부모 프로필 수정
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "학부모 프로필 수정",
    description: "학부모 프로필의 이름을 수정합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "프로필이 수정되었습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  async updateParentProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateDto: UpdateParentProfileDto,
  ) {
    return this.parentProfileService.updateParentProfile(
      req.user.id,
      updateDto,
    );
  }

  /**
   * 자녀 목록 조회
   */
  @Get("children")
  @ApiOperation({
    summary: "자녀 목록 조회",
    description: "학부모가 관리하는 자녀 목록을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "자녀 목록 조회 성공",
  })
  async getChildren(@Request() req: AuthenticatedRequest) {
    return this.parentProfileService.getChildren(req.user.id);
  }

  /**
   * 자녀 추가
   */
  @Post("children/:childUserId")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "자녀 추가",
    description:
      "학부모 계정에 기존 자녀를 연결합니다. 자녀 생년월일 대조를 통과해야 하며, 이미 다른 보호자에 연결된 자녀는 추가할 수 없습니다.",
  })
  @ApiResponse({
    status: 201,
    description: "자녀가 추가되었습니다.",
  })
  @ApiResponse({
    status: 400,
    description: "이미 추가된 자녀입니다.",
  })
  @ApiResponse({
    status: 403,
    description:
      "생년월일 불일치 또는 이미 다른 보호자에 연결된 자녀입니다.",
  })
  @ApiResponse({
    status: 404,
    description: "자녀 또는 프로필을 찾을 수 없습니다.",
  })
  async addChild(
    @Request() req: AuthenticatedRequest,
    @Param("childUserId") childUserId: string,
    @Body() addChildDto: AddChildDto,
  ) {
    return this.parentProfileService.addChild(
      req.user.id,
      childUserId,
      addChildDto.birthDate,
    );
  }

  /**
   * 자녀 제거
   */
  @Delete("children/:childUserId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 제거",
    description: "학부모 계정에서 자녀를 제거합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "자녀가 제거되었습니다.",
  })
  @ApiResponse({
    status: 404,
    description: "프로필을 찾을 수 없습니다.",
  })
  @ApiResponse({
    status: 400,
    description: "해당 자녀를 찾을 수 없습니다.",
  })
  async removeChild(
    @Request() req: AuthenticatedRequest,
    @Param("childUserId") childUserId: string,
  ) {
    return this.parentProfileService.removeChild(req.user.id, childUserId);
  }
}
