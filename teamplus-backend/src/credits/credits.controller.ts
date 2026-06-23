import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Post,
  Get,
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
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { CreditsService } from "./credits.service";
import { IssueCreditDto } from "./dto/issue-credit.dto";
import { AdjustCreditDto } from "./dto/adjust-credit.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Credits")
@Controller("api/v1/credits")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
export class CreditsController {
  constructor(private readonly creditsService: CreditsService) {}

  /**
   * 관리자 크레딧 수동 조정 (추가/차감)
   */
  @Post("adjust")
  @Roles("ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "크레딧 수동 조정",
    description:
      "관리자/감독/코치가 회원의 크레딧을 수동으로 조정합니다. 양수는 추가, 음수는 차감입니다. (회의록 line 36: 감독과 코치 동일 권한)",
  })
  @ApiResponse({
    status: 200,
    description: "크레딧 조정 성공",
    schema: {
      example: {
        memberCreditId: "credit-uuid",
        previousBalance: 8,
        adjustedAmount: 3,
        balanceAfter: 11,
        transactionId: "transaction-uuid",
        totalSessions: 11,
        usedSessions: 0,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: "크레딧 잔액이 부족합니다.",
  })
  @ApiResponse({
    status: 404,
    description: "회원 크레딧 정보를 찾을 수 없습니다.",
  })
  async adjustCredit(
    @Request() req: AuthenticatedRequest,
    @Body() adjustCreditDto: AdjustCreditDto,
  ) {
    return this.creditsService.adjustCredit(adjustCreditDto, req.user.id, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 크레딧 발급 (결제 완료 후)
   */
  @Post("issue")
  @Roles("ADMIN", "COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "크레딧 발급",
    description: "회원에게 새로운 크레딧을 발급합니다.",
  })
  @ApiResponse({
    status: 201,
    description: "크레딧 발급 성공",
    schema: {
      example: {
        id: "credit-uuid",
        memberId: "member-uuid",
        totalSessions: 8,
        usedSessions: 0,
        remainingCredits: 8,
        expiresAt: "2026-04-04T23:59:59Z",
        issuedDate: "2026-01-04T10:00:00Z",
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: "회원을 찾을 수 없습니다.",
  })
  async issueCredit(
    @Request() req: AuthenticatedRequest,
    @Body() issueCreditDto: IssueCreditDto,
  ) {
    return this.creditsService.issueCredit(
      issueCreditDto.userId,
      issueCreditDto.classId,
      issueCreditDto.totalSessions,
      issueCreditDto.paymentId,
      undefined,
      { id: req.user.id, userType: req.user.userType },
    );
  }

  /**
   * 가용 크레딧 조회
   */
  @Get("available/:memberId")
  @Roles("PARENT", "CHILD", "COACH", "ADMIN")
  @ApiOperation({
    summary: "가용 크레딧 조회",
    description: "회원의 사용 가능한 크레딧을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "크레딧 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "해당 수업 미결제 상태입니다.",
  })
  async getAvailableCredit(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
  ) {
    return this.creditsService.getAvailableCredit(memberId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 회원의 모든 크레딧 조회
   */
  @Get("member/:memberId")
  @Roles("PARENT", "CHILD", "COACH", "ADMIN")
  @ApiOperation({
    summary: "회원 크레딧 목록",
    description: "회원의 모든 유효한 크레딧을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "크레딧 목록 조회 성공",
    schema: {
      example: [
        {
          id: "credit-uuid",
          memberId: "member-uuid",
          totalSessions: 8,
          usedSessions: 2,
          remainingCredits: 6,
          expiresAt: "2026-04-04T23:59:59Z",
          issuedDate: "2026-01-04T10:00:00Z",
          paymentId: "payment-uuid",
        },
      ],
    },
  })
  async getMemberCredits(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
  ) {
    return this.creditsService.getMemberCredits(memberId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 크레딧 상세 조회
   */
  @Get(":creditId")
  @Roles("PARENT", "CHILD", "COACH", "ADMIN")
  @ApiOperation({
    summary: "크레딧 상세 조회",
    description: "특정 크레딧의 상세 정보를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "크레딧 조회 성공",
  })
  @ApiResponse({
    status: 404,
    description: "크레딧을 찾을 수 없습니다.",
  })
  async getCredit(
    @Request() req: AuthenticatedRequest,
    @Param("creditId") creditId: string,
  ) {
    return this.creditsService.getCredit(creditId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 회원 크레딧 거래 내역 조회
   *
   * 주의: 라우트 순서상 "member/:memberId/expired" 보다 먼저 선언해야 매칭된다.
   */
  @Get("member/:memberId/transactions")
  @Roles("PARENT", "CHILD", "COACH", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @ApiOperation({
    summary: "회원 크레딧 거래 내역",
    description:
      "회원의 크레딧 거래 내역(적립/차감/조정/이월 등)을 최신순으로 조회합니다.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    description: "조회 건수 (기본 50, 최대 200)",
    example: 50,
  })
  @ApiQuery({
    name: "offset",
    required: false,
    description: "건너뛸 건수 (페이지네이션)",
    example: 0,
  })
  @ApiResponse({
    status: 200,
    description: "거래 내역 조회 성공",
    schema: {
      example: [
        {
          id: "txn-uuid",
          memberCreditId: "credit-uuid",
          classId: "class-uuid",
          type: "earned",
          amount: 8,
          balanceAfter: 8,
          reason: "결제 완료 - 수업권 발급",
          adjustedBy: null,
          createdAt: "2026-05-01T00:00:00Z",
        },
      ],
    },
  })
  async getMemberCreditTransactions(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.creditsService.getMemberCreditTransactions(
      memberId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
      { id: req.user.id, userType: req.user.userType },
    );
  }

  /**
   * 만료된 크레딧 조회
   */
  @Get("member/:memberId/expired")
  @Roles("PARENT", "CHILD", "COACH", "ADMIN")
  @ApiOperation({
    summary: "만료된 크레딧 조회",
    description: "회원의 만료된 크레딧을 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "만료된 크레딧 조회 성공",
  })
  async getExpiredCredits(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
  ) {
    return this.creditsService.getExpiredCredits(memberId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 내 크레딧 통계 (현재 로그인 사용자)
   *
   * 주의: 라우트 순서상 ":memberId" 동적 세그먼트보다 먼저 선언해야 매칭된다.
   */
  @Get("stats/me")
  @Roles("PARENT", "CHILD", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "내 크레딧 통계",
    description: "현재 로그인한 사용자의 크레딧 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "내 크레딧 통계 조회 성공",
  })
  async getMyCreditStats(@Request() req: AuthenticatedRequest) {
    return this.creditsService.getCreditStats(req.user.id, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }

  /**
   * 크레딧 통계
   */
  @Get("stats/:memberId")
  @Roles("PARENT", "CHILD", "COACH", "ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "크레딧 통계",
    description: "회원의 크레딧 통계를 조회합니다.",
  })
  @ApiResponse({
    status: 200,
    description: "크레딧 통계 조회 성공",
    schema: {
      example: {
        memberId: "member-uuid",
        totalIssued: 16,
        totalUsed: 3,
        totalRemaining: 13,
        availableRemaining: 13,
        availableCreditCount: 2,
        expiredCreditCount: 0,
        allCredits: 2,
      },
    },
  })
  async getCreditStats(
    @Request() req: AuthenticatedRequest,
    @Param("memberId") memberId: string,
  ) {
    return this.creditsService.getCreditStats(memberId, {
      id: req.user.id,
      userType: req.user.userType,
    });
  }
}
