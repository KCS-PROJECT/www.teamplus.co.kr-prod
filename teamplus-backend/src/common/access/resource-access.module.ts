import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ResourceAccessService } from "./resource-access.service";

/**
 * ResourceAccessModule
 *
 * - @Global: 정산·출석·수업·대회 등 여러 피처 모듈이 공통으로 주입받는 인가 서비스라
 *   한 번 등록으로 전역 사용 (ViewCounterModule 과 동일 패턴).
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ResourceAccessService],
  exports: [ResourceAccessService],
})
export class ResourceAccessModule {}
