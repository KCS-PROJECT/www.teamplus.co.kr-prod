/**
 * ClassProductsController (2026-05-22 신규)
 *
 * 통합 패키지 CRUD 엔드포인트. teamId/academyId 강제 path param 없이
 * classId 만으로 owner 자동 판별 (Class.teamId 우선 → academyId).
 *
 * 기존 `/api/v1/teams/:teamId/classes/:classId/products` 는 deprecated.
 * 신규 작업은 본 경로 사용.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Request,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ClassesService } from "./classes.service";
import { CreateClassProductDto } from "./dto/create-product.dto";
import { UpdateClassProductDto } from "./dto/update-product.dto";
import { BulkClassProductsDto } from "./dto/bulk-products.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";

@ApiTags("Class Products")
@Controller("api/v1/classes/:classId/products")
@UseGuards(AuthGuard("jwt"), RolesGuard)
export class ClassProductsController {
  constructor(private readonly classesService: ClassesService) {}

  @Get()
  @ApiOperation({
    summary: "수업 패키지 목록 (통합)",
    description:
      "classId 만으로 패키지 목록을 조회합니다. teamId/academyId 무관. 응답에는 PACKAGE_END_GUARD 계산 필드(isPurchasable, classEndDate, expectedExpiresAt, disabledReason)가 포함됩니다. PARENT/CHILD/TEEN 은 비활성 패키지가 응답에서 제외됩니다 (학부모·학생 시점 UX 일관성).",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  @ApiResponse({ status: 200, description: "패키지 목록 조회 성공" })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async list(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
  ) {
    return this.classesService.getClassProducts(classId, req.user);
  }

  @Post()
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "수업 패키지 생성 (통합)",
    description:
      "팀 수업이면 감독/코치, 오픈클래스면 아카데미 원장 권한을 자동 검증합니다.",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  @ApiResponse({ status: 201, description: "패키지가 생성되었습니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "수업을 찾을 수 없습니다." })
  async create(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
    @Body() dto: CreateClassProductDto,
  ) {
    return this.classesService.createClassProductByClassId(
      req.user.id,
      req.user.userType,
      classId,
      dto,
    );
  }

  @Put("bulk")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 패키지 일괄 반영",
    description:
      "추가(id 없음)·수정(id 있음)·삭제(deleteIds)를 단일 트랜잭션으로 원자적으로 반영합니다. 부분 실패는 전부 롤백됩니다. 응답은 갱신 후 패키지 목록입니다.",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  @ApiResponse({ status: 200, description: "패키지가 일괄 반영되었습니다." })
  @ApiResponse({ status: 400, description: "정기권 회수 검증 실패." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "수업 또는 패키지를 찾을 수 없습니다." })
  async bulkUpsert(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
    @Body() dto: BulkClassProductsDto,
  ) {
    return this.classesService.bulkUpsertClassProducts(
      req.user.id,
      req.user.userType,
      classId,
      dto,
    );
  }

  @Patch(":productId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 패키지 수정 (통합)",
    description:
      "isActive=false 전환은 본 엔드포인트로 처리(soft delete 호환).",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  @ApiParam({ name: "productId", description: "패키지 ID" })
  @ApiResponse({ status: 200, description: "패키지가 수정되었습니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "패키지를 찾을 수 없습니다." })
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
    @Param("productId") productId: string,
    @Body() dto: UpdateClassProductDto,
  ) {
    return this.classesService.updateClassProductByClassId(
      req.user.id,
      req.user.userType,
      classId,
      productId,
      dto,
    );
  }

  @Delete(":productId")
  @Roles("COACH", "DIRECTOR", "ACADEMY_DIRECTOR", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 패키지 삭제 (통합)",
    description:
      "결제·수강 이력이 있으면 자동으로 soft delete(isActive=false).",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  @ApiParam({ name: "productId", description: "패키지 ID" })
  @ApiResponse({ status: 200, description: "패키지가 삭제되었습니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "패키지를 찾을 수 없습니다." })
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param("classId") classId: string,
    @Param("productId") productId: string,
  ) {
    return this.classesService.deleteClassProductByClassId(
      req.user.id,
      req.user.userType,
      classId,
      productId,
    );
  }
}
