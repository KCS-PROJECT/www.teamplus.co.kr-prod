import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ApiOkResponse, ApiOperation } from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { OverseasTripsService } from "./overseas-trips.service";
import {
  CreateOverseasTripDto,
  UpdateOverseasTripDto,
  CreateTripRegistrationDto,
  UpdateTripRegistrationDto,
} from "./dto/overseas-trip.dto";
import { OverseasTripResponseDto } from "./dto/responses/overseas-trip-response.dto";

// ==================== OverseasTrip Controller ====================

@Controller("api/v1/overseas-trips")
@UseGuards(AuthGuard("jwt"), RolesGuard)
// [2026-05-13 roles-check] 기본 — 인증된 모든 사용자 조회. mutation 은 메서드 레벨.
@Roles(
  "ADMIN",
  "DIRECTOR",
  "ACADEMY_DIRECTOR",
  "COACH",
  "PARENT",
  "TEEN",
  "CHILD",
)
export class OverseasTripsController {
  constructor(private readonly overseasTripsService: OverseasTripsService) {}

  // -------------------- Trip CRUD --------------------

  @Get()
  async findAllTrips(
    @Query("teamId") teamId?: string,
    @Query("status") status?: string,
  ) {
    const data = await this.overseasTripsService.findAllTrips(teamId, status);
    return { success: true, data };
  }

  @Get("my")
  async findMyTrips(@Request() req: AuthenticatedRequest) {
    const data = await this.overseasTripsService.findMyTrips(req.user.id);
    return { success: true, data };
  }

  @Get(":id")
  @ApiOperation({
    summary: "해외 원정 상세 조회",
    description:
      "지정한 ID 의 해외 원정 상세 정보 조회 (팀/생성자/참가등록/집계 포함).",
  })
  @ApiOkResponse({
    description: "해외 원정 상세 (over-fetching 제거된 최적화 응답)",
    type: OverseasTripResponseDto,
  })
  async findOneTrip(@Param("id") id: string) {
    const data = await this.overseasTripsService.findOneTrip(id);
    return { success: true, data };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async createTrip(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreateOverseasTripDto,
  ) {
    const data = await this.overseasTripsService.createTrip(req.user.id, dto);
    return { success: true, data };
  }

  @Put(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async updateTrip(
    @Param("id") id: string,
    @Body() dto: UpdateOverseasTripDto,
  ) {
    const data = await this.overseasTripsService.updateTrip(id, dto);
    return { success: true, data };
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async removeTrip(@Param("id") id: string) {
    const data = await this.overseasTripsService.removeTrip(id);
    return { success: true, data };
  }

  // -------------------- Trip Statistics --------------------

  @Get(":id/statistics")
  async getTripStatistics(@Param("id") id: string) {
    const data = await this.overseasTripsService.getTripStatistics(id);
    return { success: true, data };
  }

  // -------------------- Registration CRUD --------------------

  @Get(":tripId/registrations")
  async findAllRegistrations(@Param("tripId") tripId: string) {
    const data = await this.overseasTripsService.findAllRegistrations(tripId);
    return { success: true, data };
  }

  @Get(":tripId/registrations/:registrationId")
  async findOneRegistration(
    @Param("tripId") tripId: string,
    @Param("registrationId") registrationId: string,
  ) {
    const data = await this.overseasTripsService.findOneRegistration(
      tripId,
      registrationId,
    );
    return { success: true, data };
  }

  @Post(":tripId/registrations")
  async createRegistration(
    @Param("tripId") tripId: string,
    @Body() dto: CreateTripRegistrationDto,
  ) {
    const data = await this.overseasTripsService.createRegistration(
      tripId,
      dto,
    );
    return { success: true, data };
  }

  @Put(":tripId/registrations/:registrationId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async updateRegistration(
    @Param("tripId") tripId: string,
    @Param("registrationId") registrationId: string,
    @Body() dto: UpdateTripRegistrationDto,
  ) {
    const data = await this.overseasTripsService.updateRegistration(
      tripId,
      registrationId,
      dto,
    );
    return { success: true, data };
  }

  @Post(":tripId/registrations/:registrationId/cancel")
  async cancelRegistration(
    @Request() req: AuthenticatedRequest,
    @Param("tripId") tripId: string,
    @Param("registrationId") registrationId: string,
    @Body() body: { reason?: string },
  ) {
    const data = await this.overseasTripsService.cancelRegistration(
      tripId,
      registrationId,
      body.reason,
      req.user.id,
      req.user.userType,
    );
    return { success: true, data };
  }

  @Patch(":tripId/registrations/:registrationId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async patchRegistration(
    @Param("tripId") tripId: string,
    @Param("registrationId") registrationId: string,
    @Body() dto: UpdateTripRegistrationDto,
  ) {
    const data = await this.overseasTripsService.updateRegistration(
      tripId,
      registrationId,
      dto,
    );
    return { success: true, data };
  }

  @Delete(":tripId/registrations/:registrationId")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR")
  async removeRegistration(
    @Param("tripId") tripId: string,
    @Param("registrationId") registrationId: string,
  ) {
    const data = await this.overseasTripsService.removeRegistration(
      tripId,
      registrationId,
    );
    return { success: true, data };
  }

  // -------------------- Deposit Processing --------------------

  @Post(":tripId/registrations/:registrationId/deposit")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "DIRECTOR", "PARENT")
  async processDeposit(
    @Param("tripId") tripId: string,
    @Param("registrationId") registrationId: string,
    @Body("amount") amount: string,
  ) {
    const data = await this.overseasTripsService.processDeposit(
      tripId,
      registrationId,
      amount,
    );
    return { success: true, data };
  }
}
