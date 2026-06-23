import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  BadRequestException,
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import {
  ApiOperation,
  ApiTags,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from "@nestjs/swagger";
import { TournamentsService } from "./tournaments.service";
import {
  CreateTournamentDto,
  UpdateTournamentDto,
  ChangeTournamentStatusDto,
  ConfirmTournamentSettlementDto,
  CreateMatchDto,
  UpdateMatchDto,
  RegisterTournamentDto,
  CreateMatchEventDto,
  UpdateMatchEventDto,
  UpsertMatchPeriodDto,
  UpdateMatchScoreDto,
  UpdateMatchLiveStateDto,
} from "./tournaments.dto";
import { Roles } from "@/auth/roles.decorator";
import { RolesGuard } from "@/auth/roles.guard";

@ApiTags("Tournaments")
@Controller("api/v1/tournaments")
@UseGuards(AuthGuard("jwt"), RolesGuard)
@ApiBearerAuth()
// [2026-05-13 roles-check] 기본 권한 — 인증된 모든 사용자 조회 허용.
//   mutation/admin-only 메서드는 메서드 레벨 @Roles 로 더 좁게 명시 (위 우선).
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  // ==================== Tournament Endpoints ====================

  /**
   * 토너먼트 목록 조회
   */
  @Get()
  @ApiOperation({
    summary: "대회 목록 조회",
    description: "모든 대회 목록을 조회합니다. clubId로 필터링 가능합니다.",
  })
  @ApiQuery({
    name: "teamId",
    required: false,
    description: "특정 클럽의 대회만 조회",
  })
  @ApiQuery({
    name: "childId",
    required: false,
    description:
      "학부모 자녀 선택 스코프 — 지정 시 해당 자녀 노출 대회만 (PARENT 전용)",
  })
  @ApiResponse({ status: 200, description: "대회 목록 조회 성공" })
  async getTournaments(
    @Request() req: AuthenticatedRequest,
    @Query("teamId") teamId?: string,
    @Query("childId") childId?: string,
  ) {
    // [수정 2026-05-11] 사용자 컨텍스트 기반 가시성 필터 (관리자 권한 팀 / 자녀 선택 여부).
    return this.tournamentsService.getTournaments(teamId, req.user.id, childId);
  }

  /**
   * 학생용 대회 목록 조회
   */
  @Get("available")
  @ApiOperation({
    summary: "학생용 대회 목록 조회",
    description:
      "현재 로그인한 학생 기준으로 참가 가능한 대회와 신청 상태를 함께 조회합니다.",
  })
  @ApiResponse({ status: 200, description: "학생용 대회 목록 조회 성공" })
  async getAvailableTournaments(@Request() req: AuthenticatedRequest) {
    return this.tournamentsService.getAvailableTournaments(req.user.id);
  }

  /**
   * 선수별 대회 참가 이력 및 통계 조회
   */
  @Get("player-stats/:memberId")
  @ApiOperation({
    summary: "선수별 대회 참가 이력 및 통계 조회",
    description:
      "특정 선수(ClubMember)의 대회 참가 이력과 골/어시스트/페널티 등 통계를 조회합니다.",
  })
  @ApiParam({ name: "memberId", description: "선수(ClubMember) ID" })
  @ApiResponse({
    status: 200,
    description: "선수 대회 통계 조회 성공",
  })
  @ApiResponse({ status: 404, description: "선수를 찾을 수 없습니다." })
  async getPlayerTournamentStats(@Param("memberId") memberId: string) {
    return this.tournamentsService.getPlayerTournamentStats(memberId);
  }

  /**
   * 토너먼트 상세 조회
   */
  @Get(":id")
  @ApiOperation({
    summary: "대회 상세 조회",
    description: "대회의 상세 정보와 경기 목록을 조회합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "대회 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async getTournamentById(
    @Param("id") id: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tournamentsService.getTournamentById(id, req.user?.id);
  }

  /**
   * 토너먼트 생성
   */
  @Post()
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "대회 생성",
    description: "새로운 대회를 생성합니다. 관리자 또는 감독만 가능합니다.",
  })
  @ApiResponse({ status: 201, description: "대회가 생성되었습니다." })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력입니다." })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  async createTournament(
    @Body() dto: CreateTournamentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    // [수정 2026-05-11] teamId 비어 있을 때 호출자의 첫 관리 팀으로 자동 보강.
    return this.tournamentsService.createTournament(dto, req.user.id);
  }

  /**
   * 토너먼트 수정
   */
  @Patch(":id")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "대회 수정",
    description: "대회 정보를 수정합니다. 관리자 또는 감독만 가능합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "대회 정보가 수정되었습니다." })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async updateTournament(
    @Param("id") id: string,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournamentsService.updateTournament(id, dto);
  }

  /**
   * 토너먼트 삭제
   * [수정 2026-05-11] DIRECTOR/COACH 도 본인 관리 팀의 대회를 삭제 가능.
   */
  @Delete(":id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "대회 삭제",
    description: "대회를 삭제합니다. 관리자/감독/코치 가능.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "대회가 삭제되었습니다." })
  @ApiResponse({
    status: 400,
    description: "경기가 등록된 대회는 삭제할 수 없습니다.",
  })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async deleteTournament(@Param("id") id: string) {
    return this.tournamentsService.deleteTournament(id);
  }

  /**
   * 토너먼트 상태 변경
   */
  @Patch(":id/status")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "대회 상태 변경",
    description:
      "대회의 상태를 변경합니다. scheduled -> ongoing -> finished 순서, 또는 cancelled로 변경 가능합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "대회 상태가 변경되었습니다." })
  @ApiResponse({ status: 400, description: "유효하지 않은 상태 변경입니다." })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async changeTournamentStatus(
    @Param("id") id: string,
    @Body() dto: ChangeTournamentStatusDto,
  ) {
    return this.tournamentsService.changeTournamentStatus(id, dto.status);
  }

  /**
   * 토너먼트 요약 통계
   */
  @Get(":id/summary")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "대회 요약 통계",
    description:
      "대회의 참가자 수, 결제 현황, 경기 진행률 등 요약 통계를 조회합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "대회 요약 통계 조회 성공" })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async getTournamentSummary(@Param("id") id: string) {
    return this.tournamentsService.getTournamentSummary(id);
  }

  // ==================== Tournament Registration Endpoints ====================

  /**
   * 참가비 미리보기
   */
  @Get(":id/fee-preview")
  @ApiOperation({
    summary: "참가비 미리보기",
    description: "경기 수에 따른 참가비를 미리 계산합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiQuery({ name: "gamesCount", required: true, description: "참가 경기 수" })
  @ApiResponse({ status: 200, description: "참가비 미리보기 성공" })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async getFeePreview(
    @Param("id") id: string,
    @Query("gamesCount") gamesCount: string,
  ) {
    const count = parseInt(gamesCount, 10);
    if (!count || count < 1) {
      throw new BadRequestException("경기 수는 1 이상의 정수여야 합니다.");
    }
    return this.tournamentsService.getFeePreview(id, count);
  }

  /**
   * 자격 해당 선수 목록 조회
   */
  @Get(":id/eligible-players")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "자격 해당 선수 목록 조회",
    description: "출생연도 자격 조건에 해당하는 선수 목록을 조회합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "선수 목록 조회 성공" })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async getEligiblePlayers(@Param("id") id: string) {
    return this.tournamentsService.getEligiblePlayers(id);
  }

  /**
   * 대회 참가 등록
   */
  @Post(":id/register")
  @Roles(
    "PARENT",
    "TEEN",
    "CHILD",
    "COACH",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "ADMIN",
  )
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "대회 참가 등록",
    description:
      "대회에 참가 신청합니다. 출생연도 자격 검증 및 참가비 자동계산이 수행됩니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 201, description: "참가 등록 성공" })
  @ApiResponse({ status: 400, description: "자격 미달 또는 마감" })
  @ApiResponse({ status: 409, description: "이미 등록된 대회" })
  async registerTournament(
    @Param("id") id: string,
    @Body() dto: RegisterTournamentDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tournamentsService.registerTournament(id, req.user.id, dto);
  }

  /**
   * [추가 2026-05-15] 대회 참가 결제 시작 — 학부모(PARENT) 전용.
   *  · Payment row + TournamentRegistration 을 PENDING 으로 생성.
   *  · 응답의 orderNumber 를 토스 위젯 requestPayment(orderId=...) 에 전달.
   *  · 토스 confirm 성공 후 paymentsService 가 paymentStatus=PAID 갱신.
   */
  @Post(":id/payment/initiate")
  @Roles("PARENT", "ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "대회 참가 결제 시작",
    description:
      "대회 참가 신청에 대해 토스 결제용 Payment 와 TournamentRegistration(PENDING) 을 생성합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({
    status: 201,
    description: "결제 시작 성공 (orderNumber 발급)",
  })
  @ApiResponse({ status: 400, description: "금액 불일치 또는 무료 대회" })
  async initiateTournamentPayment(
    @Param("id") id: string,
    @Body() body: { childId: string; amount: number; gamesCount?: number },
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tournamentsService.initiateTournamentPayment(
      req.user.id,
      id,
      body,
    );
  }

  /**
   * [후불 대회 정산 확정] — 감독/코치/관리자 전용.
   *  · 종료된 후불(POSTPAID) 대회의 1인당 금액을 입력해 참가자 전원에게 일괄 청구.
   *  · 미결제(UNPAID/PENDING) 참가자만 대상, 멱등 upsert(orderNumber)로 중복 청구 방지.
   */
  @Post(":id/postpaid/confirm")
  @Roles("DIRECTOR", "COACH", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "후불 대회 정산 확정",
    description:
      "종료된 후불 대회의 1인당 참가비를 입력해 미결제 참가자 전원에게 일괄 청구합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "정산 확정 성공 (일괄 청구 발행)" })
  @ApiResponse({
    status: 400,
    description: "후불 대회 아님 / 종료 전 / 금액 오류",
  })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async confirmTournamentSettlement(
    @Param("id") id: string,
    @Body() dto: ConfirmTournamentSettlementDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tournamentsService.confirmTournamentSettlement(
      id,
      dto.feePerPerson,
      req.user.id,
    );
  }

  /**
   * [2026-06-17] 후불 대회 결제요청 취소 — 정산으로 청구한 미결제 건을 UNPAID 로 환원.
   */
  @Post(":id/postpaid/cancel")
  @Roles("DIRECTOR", "COACH", "ADMIN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "후불 대회 결제요청 취소",
    description:
      "정산(결제요청)으로 청구한 미결제 참가자를 UNPAID 로 되돌립니다. 결제완료 건은 제외됩니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "결제요청 취소 성공" })
  @ApiResponse({ status: 400, description: "후불 대회 아님 / 취소할 결제요청 없음" })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async cancelTournamentSettlement(@Param("id") id: string) {
    return this.tournamentsService.cancelTournamentSettlement(id);
  }

  /**
   * 대회 참가자 목록 조회
   */
  @Get(":id/registrations")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "대회 참가자 목록 조회",
    description: "대회에 등록된 참가자 목록을 조회합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiResponse({ status: 200, description: "참가자 목록 조회 성공" })
  @ApiResponse({ status: 404, description: "대회를 찾을 수 없습니다." })
  async getTournamentRegistrations(@Param("id") id: string) {
    return this.tournamentsService.getTournamentRegistrations(id);
  }

  /**
   * 대회 참가 취소
   */
  @Delete(":id/registrations/:regId")
  @Roles(
    "PARENT",
    "TEEN",
    "CHILD",
    "COACH",
    "DIRECTOR",
    "ACADEMY_DIRECTOR",
    "ADMIN",
  )
  @ApiOperation({
    summary: "대회 참가 취소",
    description: "본인의 대회 참가 신청을 취소합니다.",
  })
  @ApiParam({ name: "id", description: "대회 ID" })
  @ApiParam({ name: "regId", description: "등록 ID" })
  @ApiResponse({ status: 200, description: "참가 취소 성공" })
  @ApiResponse({ status: 400, description: "취소 불가 상태" })
  @ApiResponse({ status: 404, description: "등록 정보를 찾을 수 없습니다." })
  async cancelRegistration(
    @Param("id") id: string,
    @Param("regId") regId: string,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.tournamentsService.cancelRegistration(id, regId, req.user.id);
  }

  // ==================== Match Endpoints ====================

  /**
   * 매치 목록 조회
   */
  @Get("matches/list")
  @ApiOperation({
    summary: "경기 목록 조회",
    description:
      "모든 경기 목록을 조회합니다. tournamentId로 필터링 가능합니다.",
  })
  @ApiQuery({
    name: "tournamentId",
    required: false,
    description: "특정 대회의 경기만 조회",
  })
  @ApiResponse({ status: 200, description: "경기 목록 조회 성공" })
  async getMatches(@Query("tournamentId") tournamentId?: string) {
    return this.tournamentsService.getMatches(tournamentId);
  }

  /**
   * 매치 상세 조회
   */
  @Get("matches/:id")
  @ApiOperation({
    summary: "경기 상세 조회",
    description: "경기의 상세 정보, 피리어드, 이벤트를 조회합니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "경기 상세 조회 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async getMatchById(@Param("id") id: string) {
    return this.tournamentsService.getMatchById(id);
  }

  /**
   * 매치 생성
   */
  @Post("matches")
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "경기 생성",
    description: "새로운 경기를 생성합니다. 관리자 또는 감독만 가능합니다.",
  })
  @ApiResponse({ status: 201, description: "경기가 생성되었습니다." })
  @ApiResponse({ status: 400, description: "유효하지 않은 입력입니다." })
  async createMatch(@Body() dto: CreateMatchDto) {
    return this.tournamentsService.createMatch(dto);
  }

  /**
   * 매치 수정
   */
  @Patch("matches/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "경기 수정",
    description: "경기 정보를 수정합니다. 관리자, 감독 또는 코치가 가능합니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "경기 정보가 수정되었습니다." })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async updateMatch(@Param("id") id: string, @Body() dto: UpdateMatchDto) {
    return this.tournamentsService.updateMatch(id, dto);
  }

  /**
   * 매치 삭제
   */
  @Delete("matches/:id")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "경기 삭제",
    description: "경기를 삭제합니다. 관리자/감독/코치 가능합니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "경기가 삭제되었습니다." })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async deleteMatch(@Param("id") id: string) {
    return this.tournamentsService.deleteMatch(id);
  }

  // ==================== Match Participants Endpoints ====================

  /**
   * 매치 참가 팀 조회
   */
  @Get("matches/:id/participants")
  @ApiOperation({
    summary: "경기 참가 팀 조회",
    description: "경기에 배정된 홈/어웨이 팀과 로스터를 조회합니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "참가 팀 조회 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async getMatchParticipants(@Param("id") id: string) {
    return this.tournamentsService.getMatchParticipants(id);
  }

  /**
   * 매치에 팀 배정
   */
  @Post("matches/:matchId/participants/:teamId")
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "경기에 팀 배정",
    description:
      "경기에 팀을 홈 또는 어웨이로 배정합니다. side 쿼리 파라미터로 지정합니다.",
  })
  @ApiParam({ name: "matchId", description: "경기 ID" })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiQuery({
    name: "side",
    enum: ["home", "away"],
    description: "홈/어웨이 지정",
  })
  @ApiResponse({ status: 200, description: "팀이 배정되었습니다." })
  @ApiResponse({ status: 400, description: "유효하지 않은 배정입니다." })
  @ApiResponse({ status: 404, description: "경기 또는 팀을 찾을 수 없습니다." })
  async addMatchParticipant(
    @Param("matchId") matchId: string,
    @Param("teamId") teamId: string,
    @Query("side") side: "home" | "away",
  ) {
    if (!side || !["home", "away"].includes(side)) {
      throw new BadRequestException(
        "side 파라미터는 'home' 또는 'away'여야 합니다.",
      );
    }
    return this.tournamentsService.addMatchParticipant(matchId, teamId, side);
  }

  /**
   * 매치에서 팀 제거
   */
  @Delete("matches/:matchId/participants/:teamId")
  @Roles("ADMIN", "DIRECTOR")
  @ApiOperation({
    summary: "경기에서 팀 제거",
    description: "경기에서 배정된 팀을 제거합니다.",
  })
  @ApiParam({ name: "matchId", description: "경기 ID" })
  @ApiParam({ name: "teamId", description: "팀 ID" })
  @ApiResponse({ status: 200, description: "팀이 제거되었습니다." })
  @ApiResponse({
    status: 400,
    description: "해당 팀은 이 경기에 배정되어 있지 않습니다.",
  })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async removeMatchParticipant(
    @Param("matchId") matchId: string,
    @Param("teamId") teamId: string,
  ) {
    return this.tournamentsService.removeMatchParticipant(matchId, teamId);
  }

  // ==================== Match Score & Live State ====================

  /**
   * 경기 스코어 즉시 업데이트
   */
  @Patch("matches/:id/score")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "경기 스코어 업데이트",
    description:
      "실시간 스코어보드용. 홈/어웨이 스코어를 즉시 덮어씁니다. 종료/취소 경기는 불가.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "스코어 업데이트 성공" })
  @ApiResponse({ status: 400, description: "종료된 경기" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async updateMatchScore(
    @Param("id") id: string,
    @Body() dto: UpdateMatchScoreDto,
  ) {
    return this.tournamentsService.updateMatchScore(id, dto);
  }

  /**
   * 경기 라이프사이클 상태 전환
   */
  @Patch("matches/:id/live-state")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "경기 상태 전환",
    description:
      "scheduled → warmup → in_progress → intermission → completed. 필요 시 currentPeriod, startedAt/endedAt 함께 업데이트.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "상태 전환 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async updateMatchLiveState(
    @Param("id") id: string,
    @Body() dto: UpdateMatchLiveStateDto,
  ) {
    return this.tournamentsService.updateMatchLiveState(id, dto);
  }

  // ==================== Match Periods ====================

  /**
   * 피리어드 목록 조회 (모든 인증 사용자 가능 - 조회)
   */
  @Get("matches/:id/periods")
  @ApiOperation({
    summary: "경기 피리어드 목록 조회",
    description: "경기의 피리어드별 스코어/페널티를 조회합니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "피리어드 목록 조회 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async getMatchPeriods(@Param("id") id: string) {
    return this.tournamentsService.getMatchPeriods(id);
  }

  /**
   * 피리어드 upsert
   */
  @Post("matches/:id/periods")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "피리어드 upsert",
    description:
      "같은 periodNumber가 존재하면 업데이트, 없으면 신규 생성합니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "피리어드 upsert 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async upsertMatchPeriod(
    @Param("id") id: string,
    @Body() dto: UpsertMatchPeriodDto,
  ) {
    return this.tournamentsService.upsertMatchPeriod(id, dto);
  }

  // ==================== Match Events ====================

  /**
   * 이벤트 목록 조회 (모든 인증 사용자 가능 - 조회)
   */
  @Get("matches/:id/events")
  @ApiOperation({
    summary: "경기 이벤트 목록 조회",
    description:
      "경기 중 발생한 골/어시스트/페널티 등 이벤트를 피리어드별 정렬하여 조회합니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 200, description: "이벤트 목록 조회 성공" })
  @ApiResponse({ status: 404, description: "경기를 찾을 수 없습니다." })
  async getMatchEvents(@Param("id") id: string) {
    return this.tournamentsService.getMatchEvents(id);
  }

  /**
   * 이벤트 생성 (실시간 입력)
   */
  @Post("matches/:id/events")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "경기 이벤트 생성",
    description:
      "골/페널티 등 이벤트 기록. goal 이벤트는 자동으로 스코어 +1, penalty는 피리어드 페널티 분 누적.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiResponse({ status: 201, description: "이벤트 생성 성공" })
  @ApiResponse({
    status: 400,
    description: "유효하지 않은 입력 또는 종료된 경기",
  })
  @ApiResponse({
    status: 404,
    description: "경기 또는 선수를 찾을 수 없습니다.",
  })
  async createMatchEvent(
    @Param("id") id: string,
    @Body() dto: CreateMatchEventDto,
  ) {
    return this.tournamentsService.createMatchEvent(id, dto);
  }

  /**
   * 이벤트 수정
   */
  @Patch("matches/:id/events/:eventId")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "경기 이벤트 수정",
    description:
      "오기입 이벤트를 정정합니다. 스코어 조정이 필요한 경우 별도 /score 엔드포인트 사용.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiParam({ name: "eventId", description: "이벤트 ID" })
  @ApiResponse({ status: 200, description: "이벤트 수정 성공" })
  @ApiResponse({ status: 404, description: "이벤트를 찾을 수 없습니다." })
  async updateMatchEvent(
    @Param("id") id: string,
    @Param("eventId") eventId: string,
    @Body() dto: UpdateMatchEventDto,
  ) {
    return this.tournamentsService.updateMatchEvent(id, eventId, dto);
  }

  /**
   * 이벤트 삭제 (goal 이벤트 삭제 시 스코어 -1 자동 롤백)
   */
  @Delete("matches/:id/events/:eventId")
  @Roles("ADMIN", "DIRECTOR", "COACH")
  @ApiOperation({
    summary: "경기 이벤트 삭제",
    description:
      "이벤트를 삭제합니다. goal 이벤트 삭제 시 해당 팀 스코어 -1, penalty 이벤트 삭제 시 피리어드 페널티 분 차감이 자동 적용됩니다.",
  })
  @ApiParam({ name: "id", description: "경기 ID" })
  @ApiParam({ name: "eventId", description: "이벤트 ID" })
  @ApiResponse({ status: 200, description: "이벤트 삭제 성공" })
  @ApiResponse({ status: 404, description: "이벤트를 찾을 수 없습니다." })
  async deleteMatchEvent(
    @Param("id") id: string,
    @Param("eventId") eventId: string,
  ) {
    return this.tournamentsService.deleteMatchEvent(id, eventId);
  }
}
