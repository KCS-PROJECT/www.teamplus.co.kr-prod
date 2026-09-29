import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ResourceAccessModule } from "@/common/access/resource-access.module";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";
import { SettlementCloseService } from "./settlement-close.service";

@Module({
  imports: [PrismaModule, ResourceAccessModule],
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementCloseService],
  exports: [SettlementsService, SettlementCloseService],
})
export class SettlementsModule {}
