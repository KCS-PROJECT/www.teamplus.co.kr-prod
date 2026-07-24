import { Global, Module } from "@nestjs/common";
import { LoggerService } from "./logger.service";
import { LogRotationScheduler } from "./log-rotation.scheduler";
import { SystemLogService } from "./system-log.service";

@Global()
@Module({
  providers: [LoggerService, LogRotationScheduler, SystemLogService],
  exports: [LoggerService, SystemLogService],
})
export class LoggerModule {}
