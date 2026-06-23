import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ViewCounterService } from "./view-counter.service";

/**
 * ViewCounterModule
 *
 * - @Global: 한 번 등록하면 모든 피처 모듈에서 import 없이 ViewCounterService 주입 가능
 * - PrismaModule 은 이 프로젝트에서 글로벌이 아니므로 명시적으로 import 필요
 *   (PrismaService 의존성 해결을 위해 필수)
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ViewCounterService],
  exports: [ViewCounterService],
})
export class ViewCounterModule {}
