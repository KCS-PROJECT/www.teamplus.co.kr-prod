import {
  IsString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsArray,
} from "class-validator";

export class SendAlimtalkDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  templateCode!: string;

  @IsObject()
  @IsNotEmpty()
  templateData!: Record<string, string>;

  @IsString()
  @IsOptional()
  userId?: string;
}

export class AlimtalkTemplateDto {
  @IsString()
  @IsNotEmpty()
  templateCode!: string;

  @IsString()
  @IsNotEmpty()
  templateName!: string;

  @IsString()
  @IsNotEmpty()
  templateContent!: string;

  @IsArray()
  @IsNotEmpty()
  requiredFields!: string[];
}

export enum AlimtalkStatus {
  PENDING = "pending",
  SENT = "sent",
  FAILED = "failed",
  DELIVERED = "delivered",
}

export class AlimtalkResultDto {
  id!: string;
  notificationId!: string;
  phone!: string;
  templateCode!: string;
  status!: AlimtalkStatus;
  sentAt?: Date;
  responseData?: any;
  createdAt!: Date;
}

export class SendPaymentConfirmationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @IsString()
  @IsNotEmpty()
  className!: string;

  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  startDate!: string;
}

export class SendMembershipApprovalDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  clubName!: string;

  @IsString()
  @IsNotEmpty()
  coachName!: string;
}

export class SendClassReminderDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  className!: string;

  @IsString()
  @IsNotEmpty()
  classDate!: string;

  @IsString()
  @IsNotEmpty()
  classTime!: string;
}

export class SendAttendanceConfirmationDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  className!: string;

  @IsString()
  @IsNotEmpty()
  attendanceDate!: string;

  @IsString()
  @IsNotEmpty()
  creditsRemaining!: string;
}

export class SendCreditExpiryDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsNotEmpty()
  creditsRemaining!: string;

  @IsString()
  @IsNotEmpty()
  expiryDate!: string;

  @IsString()
  @IsNotEmpty()
  className!: string;
}
