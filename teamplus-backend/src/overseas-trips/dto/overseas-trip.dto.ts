import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsDecimal,
  IsBoolean,
  IsEmail,
  MaxLength,
  Min,
  IsIn,
} from "class-validator";

// ==================== OverseasTrip DTOs ====================

export class CreateOverseasTripDto {
  /**
   * 원정을 운영할 팀 ID.
   * `teamId` 가 표준 필드명이며, 레거시 프론트엔드 호환을 위해 `clubId` 별칭도 허용.
   * 서비스 레이어에서 `dto.teamId ?? dto.clubId` 로 정규화한다.
   */
  @IsOptional()
  @IsString()
  teamId?: string;

  /**
   * @deprecated `teamId` 사용 권장 — 프론트엔드 호환용 alias.
   */
  @IsOptional()
  @IsString()
  clubId?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(100)
  country!: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsDateString()
  registrationDeadline!: string;

  @IsInt()
  @Min(1)
  maxParticipants!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ageGroup?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  estimatedCost?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  depositAmount?: string;

  @IsOptional()
  @IsDateString()
  depositDeadline?: string;

  @IsOptional()
  @IsString()
  flightInfo?: string;

  @IsOptional()
  @IsString()
  hotelInfo?: string;

  @IsOptional()
  @IsString()
  transportInfo?: string;

  @IsOptional()
  @IsString()
  itinerary?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "open", "closed", "ongoing", "completed", "cancelled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

export class UpdateOverseasTripDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  registrationDeadline?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxParticipants?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ageGroup?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  estimatedCost?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  depositAmount?: string;

  @IsOptional()
  @IsDateString()
  depositDeadline?: string;

  @IsOptional()
  @IsString()
  flightInfo?: string;

  @IsOptional()
  @IsString()
  hotelInfo?: string;

  @IsOptional()
  @IsString()
  transportInfo?: string;

  @IsOptional()
  @IsString()
  itinerary?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "open", "closed", "ongoing", "completed", "cancelled"])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;
}

// ==================== OverseasTripRegistration DTOs ====================

export class CreateTripRegistrationDto {
  @IsString()
  memberId!: string;

  @IsOptional()
  @IsString()
  childId?: string;

  @IsString()
  parentId!: string;

  @IsOptional()
  @IsString()
  specialRequirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyPhone?: string;
}

export class UpdateTripRegistrationDto {
  @IsOptional()
  @IsString()
  @IsIn(["pending", "confirmed", "deposit_paid", "cancelled", "waitlisted"])
  status?: string;

  @IsOptional()
  @IsBoolean()
  passportVerified?: boolean;

  @IsOptional()
  @IsDateString()
  passportExpiryDate?: string;

  @IsOptional()
  @IsString()
  specialRequirements?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  emergencyPhone?: string;

  @IsOptional()
  @IsString()
  cancelReason?: string;
}
