import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { UploadCleanupService } from "./upload-cleanup.service";

/**
 * UploadCleanupModule
 *
 * - @Global: 한 번 등록하면 모든 피처 모듈에서 import 없이 UploadCleanupService 주입 가능.
 * - FilesModule ↔ TeamsModule 순환 의존을 피하기 위해 정리 유틸을 files 밖 공용 위치로 분리.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [UploadCleanupService],
  exports: [UploadCleanupService],
})
export class UploadCleanupModule {}
