import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TransactionLogService } from "./transaction-log.service";
import { TransactionLogCleanupService } from "./transaction-log-cleanup.service";
import { TransactionLogQueryService } from "./transaction-log-query.service";
import { TransactionLogAdminController } from "./transaction-log-admin.controller";

/**
 * TransactionLogModule
 *
 * 거래로그 적재(TransactionLogService) + 90일 보관 배치(TransactionLogCleanupService)
 * + admin 조회 API(TransactionLogQueryService · TransactionLogAdminController).
 * @Global 로 export — 전역 ApiLifecycleInterceptor(InterceptorsModule provider)가
 * 별도 import 없이 TransactionLogService 를 주입받을 수 있도록 한다.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [TransactionLogAdminController],
  providers: [
    TransactionLogService,
    TransactionLogCleanupService,
    TransactionLogQueryService,
  ],
  exports: [TransactionLogService],
})
export class TransactionLogModule {}
