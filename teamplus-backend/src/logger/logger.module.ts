import { Global, Module } from "@nestjs/common";
import { LoggerService } from "./logger.service";
import { LogRotationScheduler } from "./log-rotation.scheduler";

@Global()
@Module({
  providers: [LoggerService, LogRotationScheduler],
  exports: [LoggerService],
})
export class LoggerModule {}
