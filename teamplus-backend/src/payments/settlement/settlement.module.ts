import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ResourceAccessModule } from "@/common/access/resource-access.module";
import { SettlementSummaryService } from "./settlement-summary.service";

/**
 * SettlementModule — 정산 소계 배치 집계 코어(SettlementSummaryService) 제공.
 *  팀 소계(PaymentsController)·Academy 소계(AcademyController) 양쪽에서 재사용하도록
 *  독립 모듈로 분리(순환 의존 회피). 인가는 ResourceAccessService 재사용.
 */
@Module({
  imports: [PrismaModule, ResourceAccessModule],
  providers: [SettlementSummaryService],
  exports: [SettlementSummaryService],
})
export class SettlementModule {}
