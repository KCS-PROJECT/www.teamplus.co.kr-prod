import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { SmsService, SmsSendRequest } from "./sms.service";
import { SendOtpDto, VerifyOtpDto } from "./dto/sms.dto";

@ApiTags("SMS/OTP")
@Controller("api/v1/sms")
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  /**
   * 인증번호 발송
   */
  @Public()
  @Post("send")
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 1분에 5회 제한
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "인증번호 발송" })
  @ApiResponse({
    status: 200,
    description: "인증번호 발송 성공",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        message: { type: "string", example: "인증번호가 발송되었습니다." },
        remainingTime: { type: "number", example: 180 },
      },
    },
  })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  @ApiResponse({ status: 429, description: "요청 제한 초과" })
  async sendOtp(@Body() dto: SendOtpDto) {
    const request: SmsSendRequest = {
      phone: dto.phone,
      purpose: dto.purpose,
    };
    return this.smsService.sendVerificationCode(request);
  }

  /**
   * 인증번호 확인
   */
  @Public()
  @Post("verify")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 1분에 10회 제한
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "인증번호 확인" })
  @ApiResponse({
    status: 200,
    description: "인증번호 확인 결과",
    schema: {
      type: "object",
      properties: {
        valid: { type: "boolean", example: true },
        message: { type: "string", example: "인증이 완료되었습니다." },
      },
    },
  })
  @ApiResponse({ status: 400, description: "잘못된 요청" })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.smsService.verifyCode(dto.phone, dto.purpose, dto.code);
  }

  /**
   * 재발송 가능 여부 확인
   */
  @Public()
  @Get("resend-status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "재발송 가능 여부 확인" })
  @ApiQuery({
    name: "phone",
    description: "휴대폰 번호",
    example: "01012345678",
  })
  @ApiResponse({
    status: 200,
    description: "재발송 가능 여부",
    schema: {
      type: "object",
      properties: {
        canResend: { type: "boolean", example: true },
        waitSeconds: { type: "number", example: 0 },
      },
    },
  })
  async getResendStatus(@Query("phone") phone: string) {
    return this.smsService.canResend(phone);
  }
}
