import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { AppService } from "./app.service";
import { Public } from "./auth/public.decorator";

@ApiTags("Health & Status")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get("health")
  @ApiOperation({ summary: "Health check endpoint" })
  @ApiResponse({
    status: 200,
    description: "Server is running",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        timestamp: { type: "string", example: "2026-01-04T10:00:00Z" },
        uptime: { type: "number", example: 1234.56 },
      },
    },
  })
  getHealth() {
    return this.appService.getHealth();
  }

  @Public()
  @Get("welcome")
  @ApiOperation({ summary: "API Welcome message" })
  @ApiResponse({
    status: 200,
    description: "Welcome message",
    schema: {
      type: "object",
      properties: {
        message: { type: "string", example: "Welcome to TEAMPLUS API" },
        version: { type: "string", example: "1.0.0" },
        docs: { type: "string", example: "/api/docs" },
      },
    },
  })
  getHello() {
    return this.appService.getHello();
  }

  // [SECURITY] db-migrate-temp, db-seed-users 엔드포인트 삭제 (2026-04-12)
  // $executeRawUnsafe 보안 위험 제거, 개발용 임시 엔드포인트 완전 제거
}
