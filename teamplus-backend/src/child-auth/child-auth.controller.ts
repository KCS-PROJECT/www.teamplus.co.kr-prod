import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  Request,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from "@nestjs/swagger";
import { ChildAuthService } from "./child-auth.service";
import { SetPinDto, VerifyPinDto } from "./dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

/**
 * ChildAuth Controller
 *
 * 자녀 PIN 인증 관리 API:
 * - PIN 설정 (학부모 전용)
 * - PIN 검증 (학부모, 청소년, 아동)
 * - PIN 삭제/초기화 (학부모 전용)
 *
 * 보안:
 * - JWT + RBAC 인증/인가
 * - PIN은 bcrypt(salt=10) 해싱 저장
 * - 5회 실패 시 10분 잠금
 */
@ApiTags("Child Auth")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("api/v1/child-auth")
export class ChildAuthController {
  private readonly logger = new Logger(ChildAuthController.name);

  constructor(private readonly childAuthService: ChildAuthService) {}

  /**
   * PIN 설정
   *
   * 학부모가 자녀의 보안 PIN을 설정합니다.
   * - 6자리 숫자만 허용
   * - 연속 숫자(123456), 동일 숫자(111111) 거부
   * - 기존 PIN이 있으면 덮어씀 (upsert)
   */
  @Post("pin")
  @Roles("PARENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 PIN 설정",
    description:
      "학부모가 자녀의 보안 PIN을 설정합니다. 기존 PIN이 있으면 덮어씁니다.",
  })
  @ApiResponse({
    status: 200,
    description: "PIN 설정 성공",
    schema: {
      example: { success: true, message: "자녀 PIN이 설정되었습니다." },
    },
  })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 PIN 형식 또는 보안 패턴 위반",
  })
  @ApiResponse({
    status: 403,
    description: "권한 없음 (학부모가 아니거나 소유권 없음)",
  })
  @ApiResponse({ status: 404, description: "자녀 프로필을 찾을 수 없음" })
  async setPin(
    @Request() req: AuthenticatedRequest,
    @Body() dto: SetPinDto,
  ): Promise<{ success: true; message: string }> {
    const parentUserId = req.user.id;
    this.logger.log(
      `PIN 설정 요청: parentUserId=${parentUserId}, childProfileId=${dto.childProfileId}`,
    );

    return this.childAuthService.setPin(
      parentUserId,
      dto.childProfileId,
      dto.pin,
    );
  }

  /**
   * PIN 검증
   *
   * 자녀 PIN을 검증합니다.
   * - 학부모, 청소년, 아동 사용 가능
   * - 5회 실패 시 10분 잠금
   * - 성공 시 실패 횟수 초기화
   */
  @Post("verify")
  @Roles("PARENT", "TEEN", "CHILD")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 PIN 검증",
    description:
      "자녀 PIN을 검증합니다. 5회 실패 시 10분간 잠금됩니다. Rate limit: 5회/분",
  })
  @ApiResponse({
    status: 200,
    description: "PIN 검증 결과",
    schema: {
      example: {
        success: true,
        data: { verified: true },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: "잠금 상태 또는 입력 횟수 초과",
    schema: {
      example: {
        success: false,
        message: "잠금 상태입니다. 10분 후 다시 시도해주세요.",
      },
    },
  })
  @ApiResponse({ status: 404, description: "설정된 PIN이 없음" })
  async verifyPin(
    @Request() req: AuthenticatedRequest,
    @Body() dto: VerifyPinDto,
  ): Promise<{
    success: true;
    data: { verified: boolean; remainingAttempts?: number };
  }> {
    this.logger.log(
      `PIN 검증 요청: userId=${req.user.id}, childProfileId=${dto.childProfileId}`,
    );

    return this.childAuthService.verifyPin(
      dto.childProfileId,
      dto.pin,
      req.user.id,
    );
  }

  /**
   * PIN 삭제 (초기화)
   *
   * 학부모가 자녀의 PIN을 삭제합니다.
   * - 소유권 확인 후 삭제
   */
  @Delete("pin/:childProfileId")
  @Roles("PARENT")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "자녀 PIN 삭제 (초기화)",
    description: "학부모가 자녀의 PIN을 초기화합니다.",
  })
  @ApiParam({
    name: "childProfileId",
    description: "자녀 프로필 ID",
    example: "clxyz1234567890",
  })
  @ApiResponse({
    status: 200,
    description: "PIN 삭제 성공",
    schema: {
      example: { success: true, message: "PIN이 초기화되었습니다." },
    },
  })
  @ApiResponse({ status: 403, description: "권한 없음 (소유권 없음)" })
  @ApiResponse({
    status: 404,
    description: "자녀 프로필 또는 PIN을 찾을 수 없음",
  })
  async deletePin(
    @Request() req: AuthenticatedRequest,
    @Param("childProfileId") childProfileId: string,
  ): Promise<{ success: true; message: string }> {
    const parentUserId = req.user.id;
    this.logger.log(
      `PIN 삭제 요청: parentUserId=${parentUserId}, childProfileId=${childProfileId}`,
    );

    return this.childAuthService.deletePin(parentUserId, childProfileId);
  }
}
