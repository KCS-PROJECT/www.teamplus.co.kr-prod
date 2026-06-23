import { Module } from "@nestjs/common";
import { DateTimeController } from "./datetime.controller";
import { DateTimeService } from "./datetime.service";

/**
 * DateTime 모듈
 *
 * Web/Admin/App 공통으로 호출하는 날짜/시간 포맷 API 제공
 * - GET /api/v1/datetime          (통합 8개 포맷)
 * - GET /api/v1/datetime/year
 * - GET /api/v1/datetime/month
 * - GET /api/v1/datetime/date
 * - GET /api/v1/datetime/datetime
 * - GET /api/v1/datetime/datetime-second
 * - GET /api/v1/datetime/datetime-millisecond
 * - GET /api/v1/datetime/weekly
 * - GET /api/v1/datetime/monthly
 */
@Module({
  controllers: [DateTimeController],
  providers: [DateTimeService],
  exports: [DateTimeService],
})
export class DateTimeModule {}
