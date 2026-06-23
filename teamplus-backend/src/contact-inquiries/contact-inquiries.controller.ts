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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "@/auth/public.decorator";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";
import { extractClientIp } from "@/common/utils/extract-client-ip.util";
import { ContactInquiriesService } from "./contact-inquiries.service";
import { CreateContactInquiryDto } from "./dto/create-contact-inquiry.dto";
import { UpdateContactInquiryDto } from "./dto/update-contact-inquiry.dto";
import { QueryContactInquiriesDto } from "./dto/query-contact-inquiries.dto";

/**
 * 도입 상담 신청(ContactInquiry) — 공개 제출 + 관리(SYSTEM/OPER) CRUD.
 *
 * - 공개 제출 POST 는 @Public — 전역 JwtAuthGuard 가 @Public 을 인식해 바이패스한다.
 * - 관리 5종은 **메서드 레벨** @UseGuards(AuthGuard("jwt"), RolesGuard) + @Roles 로 보호.
 *
 * ⚠️ 컨트롤러 레벨 @UseGuards(AuthGuard("jwt")) 를 쓰지 않는 이유:
 *   raw Passport AuthGuard("jwt") 는 @Public() 메타데이터를 보지 않으므로, 컨트롤러
 *   레벨에 걸면 @Public 인 공개 POST 까지 무조건 인증을 요구해 401("로그인이 필요합니다")
 *   이 된다(teamplus-home 상담 폼 차단 회귀). @Public 바이패스는 **전역 JwtAuthGuard**
 *   만 지원하므로, 공개/관리가 한 컨트롤러에 공존할 땐 가드를 메서드 레벨로 내린다.
 *   (참고: main-popups 는 공개/관리 컨트롤러를 분리해 동일 문제를 회피)
 */
@ApiTags("ContactInquiries")
@Controller("api/v1/contact-inquiries")
export class ContactInquiriesController {
  constructor(
    private readonly contactInquiriesService: ContactInquiriesService,
  ) {}

  /**
   * 공개 상담 신청 제출.
   * - teamplus-home 폼이 호출. JWT 불필요(@Public), 분당 5회 제한.
   * - ip/userAgent 는 서버에서 기록(스팸 추적).
   */
  @Post()
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "도입 상담 신청 (공개)",
    description:
      "비로그인 사용자가 도입 상담을 신청합니다. 개인정보 수집·이용 동의(privacyAgreed=true) 필수. 분당 5회 제한.",
  })
  @ApiResponse({
    status: 201,
    description: "상담 신청 접수 성공",
    schema: {
      example: {
        success: true,
        id: "clxyz...",
        createdAt: "2026-06-18T10:00:00.000Z",
      },
    },
  })
  @ApiResponse({ status: 400, description: "필수 항목 누락 또는 동의 미체크" })
  async create(
    @Body() dto: CreateContactInquiryDto,
    @Req() req: Request,
  ) {
    const userAgent = req.headers["user-agent"];
    return this.contactInquiriesService.create(dto, {
      ipAddress: extractClientIp(req),
      userAgent: typeof userAgent === "string" ? userAgent : undefined,
    });
  }

  /**
   * 관리자 목록 조회.
   */
  @Get()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @ApiOperation({
    summary: "상담 신청 목록 (관리자)",
    description:
      "도입 상담 신청 목록을 조회합니다. page/pageSize/status/search 필터 지원. 삭제되지 않은 항목만, 최신순.",
  })
  @ApiResponse({
    status: 200,
    description: "목록 조회 성공",
    schema: {
      example: {
        items: [
          {
            id: "clxyz...",
            organizationName: "강남 아이스하키 클럽",
            managerName: "홍길동",
            email: "manager@example.com",
            phone: "010-1234-5678",
            interestedPlan: "business",
            clubSize: "50-150명",
            message: "도입 문의드립니다.",
            privacyAgreed: true,
            status: "NEW",
            adminMemo: null,
            source: "home_contact",
            createdAt: "2026-06-18T10:00:00.000Z",
            updatedAt: "2026-06-18T10:00:00.000Z",
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    },
  })
  async findAll(@Query() query: QueryContactInquiriesDto) {
    return this.contactInquiriesService.findAll(query);
  }

  /**
   * 상태별 카운트 — `/:id` 보다 먼저 선언(경로 충돌 방지).
   */
  @Get("stats")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @ApiOperation({
    summary: "상담 신청 상태별 카운트 (관리자)",
    description: "삭제되지 않은 상담 신청을 상태별로 집계합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "통계 조회 성공",
    schema: {
      example: { total: 10, NEW: 4, IN_PROGRESS: 3, DONE: 2, ARCHIVED: 1 },
    },
  })
  async getStats() {
    return this.contactInquiriesService.getStats();
  }

  /**
   * 상세 조회.
   */
  @Get(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @ApiOperation({
    summary: "상담 신청 상세 (관리자)",
    description: "특정 상담 신청의 상세 내용을 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "상세 조회 성공" })
  @ApiResponse({ status: 404, description: "상담 신청 내역을 찾을 수 없습니다." })
  async findOne(@Param("id") id: string) {
    return this.contactInquiriesService.findOne(id);
  }

  /**
   * 상태/메모 수정.
   */
  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "상담 신청 수정 (관리자)",
    description: "처리 상태(status) 또는 관리자 메모(adminMemo)를 수정합니다.",
  })
  @ApiResponse({ status: 200, description: "수정 성공" })
  @ApiResponse({ status: 404, description: "상담 신청 내역을 찾을 수 없습니다." })
  async update(
    @Param("id") id: string,
    @Body() dto: UpdateContactInquiryDto,
  ) {
    return this.contactInquiriesService.update(id, dto);
  }

  /**
   * soft delete.
   */
  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "상담 신청 삭제 (관리자)",
    description: "상담 신청을 soft delete 처리합니다(deletedAt=now).",
  })
  @ApiResponse({
    status: 200,
    description: "삭제 성공",
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: "상담 신청 내역을 찾을 수 없습니다." })
  async remove(@Param("id") id: string) {
    return this.contactInquiriesService.remove(id);
  }
}
