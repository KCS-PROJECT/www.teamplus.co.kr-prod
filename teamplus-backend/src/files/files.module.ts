import { Module } from "@nestjs/common";
import { MulterModule } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { FilesController } from "./files.controller";
import { FilesService } from "./files.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { TeamsModule } from "@/teams/teams.module";
import { WebsocketModule } from "@/websocket/websocket.module";

/**
 * 통합 업로드 모듈
 *
 * - memoryStorage 사용: magic byte 검증 후 디스크 쓰기 (안전성 우선)
 * - 글로벌 상한: 단일 파일 100MB (영상 고려), 세부 제한은 FilesService에서 카테고리별 적용
 * - WebsocketModule 의존: 업로드 성공 시 NotificationsGateway 로 file:* 이벤트 emit (Phase 2.2)
 *   (의존 방향: FilesModule → WebsocketModule, 역방향 import 없음 — 순환 없음)
 * - TeamsModule 의존: team_logo refType 권한 체크를 TeamsService.assertTeamManagerPermission 에 위임
 *   (2026-05-23 — SoT 단일화. TeamsModule 은 FilesModule 을 import 하지 않음 — 순환 없음)
 */
@Module({
  imports: [
    PrismaModule,
    WebsocketModule,
    TeamsModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB (영상 최대치; 실제 제한은 Service에서 카테고리별 검증)
        files: 10,
      },
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
