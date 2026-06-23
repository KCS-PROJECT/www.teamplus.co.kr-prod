import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
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
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import { ClassDiaryService } from "./class-diary.service";
import { CreateClassDiaryDto } from "./dto/create-class-diary.dto";
import { UpdateClassDiaryDto } from "./dto/update-class-diary.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Class Diary")
@Controller("api/v1/class-diary")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class ClassDiaryController {
  constructor(private readonly classDiaryService: ClassDiaryService) {}

  /**
   * 수업 일지 작성
   */
  @Post()
  @Roles("COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "수업 일지 작성",
    description: "코치가 수업 일지를 작성합니다.",
  })
  @ApiResponse({ status: 201, description: "수업 일지가 작성되었습니다." })
  async create(
    @Body() dto: CreateClassDiaryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.classDiaryService.create(dto, req.user.id);
  }

  /**
   * 수업별 일지 목록
   */
  @Get("class/:classId")
  @Roles("COACH", "DIRECTOR", "PARENT")
  @ApiOperation({
    summary: "수업별 일지 목록",
    description: "특정 수업의 일지를 페이지네이션으로 조회합니다.",
  })
  @ApiParam({ name: "classId", description: "수업 ID" })
  @ApiQuery({ name: "page", required: false })
  @ApiQuery({ name: "limit", required: false })
  @ApiQuery({
    name: "startDate",
    required: false,
    description: "시작일 (ISO 8601)",
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    description: "종료일 (ISO 8601)",
  })
  @ApiResponse({ status: 200, description: "수업 일지 목록 조회 성공" })
  async getByClass(
    @Param("classId") classId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    return this.classDiaryService.getByClass(classId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      startDate,
      endDate,
    });
  }

  /**
   * 일지 상세
   */
  @Get(":id")
  @Roles("COACH", "DIRECTOR", "PARENT")
  @ApiOperation({
    summary: "수업 일지 상세",
    description: "수업 일지의 상세 정보를 조회합니다.",
  })
  @ApiParam({ name: "id", description: "ClassDiary ID" })
  @ApiResponse({ status: 200, description: "수업 일지 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "수업 일지를 찾을 수 없습니다." })
  async getById(@Param("id") id: string) {
    return this.classDiaryService.getById(id);
  }

  /**
   * 일지 수정
   */
  @Patch(":id")
  @Roles("COACH")
  @ApiOperation({
    summary: "수업 일지 수정",
    description: "수업 일지 내용을 수정합니다.",
  })
  @ApiParam({ name: "id", description: "ClassDiary ID" })
  @ApiResponse({ status: 200, description: "수업 일지가 수정되었습니다." })
  @ApiResponse({ status: 404, description: "수업 일지를 찾을 수 없습니다." })
  async update(@Param("id") id: string, @Body() dto: UpdateClassDiaryDto) {
    return this.classDiaryService.update(id, dto);
  }

  /**
   * 일지 공개 처리
   */
  @Patch(":id/publish")
  @Roles("COACH")
  @ApiOperation({
    summary: "수업 일지 공개",
    description: "수업 일지를 학부모에게 공개합니다.",
  })
  @ApiParam({ name: "id", description: "ClassDiary ID" })
  @ApiResponse({ status: 200, description: "수업 일지가 공개되었습니다." })
  @ApiResponse({ status: 404, description: "수업 일지를 찾을 수 없습니다." })
  async publish(@Param("id") id: string) {
    return this.classDiaryService.publish(id);
  }

  /**
   * 일지 삭제
   */
  @Delete(":id")
  @Roles("COACH", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "수업 일지 삭제",
    description: "수업 일지를 삭제합니다.",
  })
  @ApiParam({ name: "id", description: "ClassDiary ID" })
  @ApiResponse({ status: 200, description: "수업 일지가 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "수업 일지를 찾을 수 없습니다." })
  async delete(@Param("id") id: string) {
    return this.classDiaryService.delete(id);
  }
}
