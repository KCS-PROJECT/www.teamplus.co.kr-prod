import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { VenuesService } from "./venues.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { RejectBookingDto } from "./dto/reject-booking.dto";
import { CreateVenueDto } from "./dto/create-venue.dto";
import { UpdateVenueDto } from "./dto/update-venue.dto";
import { UpdateVenueStatusDto } from "./dto/update-venue-status.dto";
import { Public } from "../auth/public.decorator";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";

@ApiTags("Venues")
@Controller("api/v1/venues")
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  // ==================== 구장 조회 (공개) ====================

  @Get()
  @Public()
  @ApiOperation({ summary: "구장 목록 조회 (공개)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiQuery({ name: "city", required: false, type: String })
  async getVenues(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("search") search?: string,
    @Query("city") city?: string,
  ) {
    return this.venuesService.getPublicVenues({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      search,
      city,
    });
  }

  // ==================== 내 예약 목록 (경로 충돌 방지 위해 :id 보다 앞에 배치) ====================

  @Get("my-bookings")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @ApiOperation({ summary: "내 대관 예약 목록 조회" })
  @ApiQuery({
    name: "status",
    required: false,
    type: String,
    description: "예약 상태 필터 (pending|confirmed|cancelled|completed)",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getMyBookings(
    @Request() req: { user: { id: string } },
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.venuesService.getMyBookings(req.user.id, {
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  // ==================== 예약 승인/거절 ====================

  @Patch("bookings/:bookingId/approve")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "대관 예약 승인 (관리자/감독)" })
  @ApiResponse({ status: 200, description: "예약 승인 성공" })
  @ApiResponse({ status: 404, description: "예약을 찾을 수 없습니다." })
  @ApiResponse({ status: 409, description: "시간대 충돌로 승인 불가" })
  async approveBooking(
    @Param("bookingId") bookingId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.venuesService.approveBooking(bookingId, req.user.id);
  }

  @Patch("bookings/:bookingId/reject")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "대관 예약 거절 (관리자/감독)" })
  @ApiResponse({ status: 200, description: "예약 거절 성공" })
  @ApiResponse({ status: 404, description: "예약을 찾을 수 없습니다." })
  async rejectBooking(
    @Param("bookingId") bookingId: string,
    @Body() dto: RejectBookingDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.venuesService.rejectBooking(bookingId, req.user.id, dto.reason);
  }

  // ==================== 예약 취소 ====================

  @Delete("bookings/:bookingId")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "대관 예약 취소 (본인만)" })
  @ApiResponse({ status: 200, description: "예약 취소 성공" })
  @ApiResponse({
    status: 403,
    description: "본인의 예약만 취소할 수 있습니다.",
  })
  @ApiResponse({ status: 404, description: "예약을 찾을 수 없습니다." })
  async cancelBooking(
    @Param("bookingId") bookingId: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.venuesService.cancelBooking(bookingId, req.user.id);
  }

  // ==================== 구장 상세 조회 (공개) ====================

  @Get(":id")
  @Public()
  @ApiOperation({ summary: "구장 상세 조회 (공개)" })
  async getVenue(@Param("id") id: string) {
    return this.venuesService.getVenueDetail(id);
  }

  // ==================== 구장별 예약 ====================

  @Post(":venueId/bookings")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "대관 예약 신청" })
  @ApiResponse({ status: 201, description: "예약 생성 성공" })
  @ApiResponse({ status: 404, description: "구장을 찾을 수 없습니다." })
  @ApiResponse({
    status: 409,
    description: "해당 시간대에 이미 예약이 있습니다.",
  })
  async createBooking(
    @Param("venueId") venueId: string,
    @Body() dto: CreateBookingDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.venuesService.createBooking(req.user.id, venueId, dto);
  }

  @Get(":venueId/bookings")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @ApiOperation({ summary: "구장별 대관 예약 목록 조회" })
  @ApiQuery({
    name: "date",
    required: false,
    type: String,
    description: "날짜 필터 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "status",
    required: false,
    type: String,
    description: "상태 필터 (pending|confirmed|cancelled|completed)",
  })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  async getBookingsByVenue(
    @Param("venueId") venueId: string,
    @Query("date") date?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.venuesService.getBookingsByVenue(venueId, {
      date,
      status,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
    });
  }

  @Get(":venueId/availability")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("ADMIN", "DIRECTOR", "COACH", "PARENT", "TEEN")
  @ApiOperation({ summary: "구장 가용 시간 조회" })
  @ApiQuery({
    name: "date",
    required: true,
    type: String,
    description: "조회 날짜 (YYYY-MM-DD)",
  })
  @ApiQuery({
    name: "startTime",
    required: false,
    type: String,
    description: "시작 시간 (HH:mm) - 특정 시간대 확인 시",
  })
  @ApiQuery({
    name: "endTime",
    required: false,
    type: String,
    description: "종료 시간 (HH:mm) - 특정 시간대 확인 시",
  })
  async checkAvailability(
    @Param("venueId") venueId: string,
    @Query("date") date: string,
    @Query("startTime") startTime?: string,
    @Query("endTime") endTime?: string,
  ) {
    return this.venuesService.checkAvailability(
      venueId,
      date,
      startTime,
      endTime,
    );
  }

  // ==================== 구장 관리 CRUD (ADMIN / DIRECTOR / COACH) ====================

  @Post()
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "구장 등록 (관리자/감독/코치)" })
  @ApiResponse({ status: 201, description: "구장 생성 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  async createVenue(
    @Body() dto: CreateVenueDto,
    @Request() req: { user: { id: string; userType: string } },
  ) {
    return this.venuesService.createVenue(req.user.id, req.user.userType, dto);
  }

  @Patch(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "구장 수정 (관리자/감독/코치)" })
  @ApiResponse({ status: 200, description: "구장 수정 성공" })
  @ApiResponse({ status: 403, description: "권한이 없습니다." })
  @ApiResponse({ status: 404, description: "구장을 찾을 수 없습니다." })
  async updateVenue(
    @Param("id") id: string,
    @Body() dto: UpdateVenueDto,
    @Request() req: { user: { id: string; userType: string } },
  ) {
    return this.venuesService.updateVenue(
      id,
      req.user.id,
      req.user.userType,
      dto,
    );
  }

  @Delete(":id")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "구장 삭제 (관리자/감독 전용)" })
  @ApiResponse({ status: 200, description: "구장 삭제 성공" })
  @ApiResponse({
    status: 409,
    description: "진행 중인 예약/대관 계약이 있어 삭제할 수 없습니다.",
  })
  async deleteVenue(
    @Param("id") id: string,
    @Request() req: { user: { userType: string } },
  ) {
    return this.venuesService.deleteVenue(id, req.user.userType);
  }

  @Patch(":id/status")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "구장 운영 상태 변경" })
  @ApiResponse({ status: 200, description: "상태 변경 성공" })
  async updateVenueStatus(
    @Param("id") id: string,
    @Body() dto: UpdateVenueStatusDto,
    @Request() req: { user: { id: string; userType: string } },
  ) {
    return this.venuesService.updateVenueStatus(
      id,
      req.user.id,
      req.user.userType,
      dto.status,
    );
  }

  @Patch(":id/image")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "구장 대표 이미지 URL 갱신",
    description:
      "이미지 바이너리는 별도 업로드 엔드포인트를 사용하고, 이 API는 업로드 후 반환된 URL을 구장에 연결합니다.",
  })
  async updateVenueImage(
    @Param("id") id: string,
    @Body() body: { imageUrl: string },
    @Request() req: { user: { id: string; userType: string } },
  ) {
    return this.venuesService.updateVenueImage(
      id,
      req.user.id,
      req.user.userType,
      body.imageUrl,
    );
  }

  @Post(":id/upload-image")
  @UseGuards(AuthGuard("jwt"), RolesGuard)
  @ApiBearerAuth()
  @Roles("SYSTEM", "OPER", "ADMIN", "DIRECTOR", "ACADEMY_DIRECTOR", "COACH")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "구장 대표 이미지 업로드 (멀티파트)",
    description:
      "이미지 파일을 업로드하고 구장 `imageUrl` 필드에 즉시 반영합니다. " +
      "허용: image/jpeg · image/png · image/webp · 최대 5MB. " +
      "업로드 저장소: `uploads/venues/`. 반환 URL: `/uploads/venues/<filename>`.",
  })
  @ApiResponse({ status: 200, description: "업로드 성공 + 구장 반영" })
  @ApiResponse({
    status: 400,
    description: "파일 없음 또는 허용되지 않는 형식/크기",
  })
  async uploadVenueImage(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req: { user: { id: string; userType: string } },
  ) {
    if (!file) {
      throw new BadRequestException("업로드된 파일이 없습니다.");
    }
    // 허용 MIME 이중 검증 (multer fileFilter 실패 분기 대비)
    const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        "지원하지 않는 이미지 형식입니다. (jpeg/png/webp 만 허용)",
      );
    }
    // 크기 이중 검증 (Multer limits 실패 분기 대비)
    const MAX_BYTES = 5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      throw new BadRequestException("이미지 크기는 5MB 이내여야 합니다.");
    }

    const publicUrl = `/uploads/venues/${file.filename}`;
    return this.venuesService.updateVenueImage(
      id,
      req.user.id,
      req.user.userType,
      publicUrl,
    );
  }
}
