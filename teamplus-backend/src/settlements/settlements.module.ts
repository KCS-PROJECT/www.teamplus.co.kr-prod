import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ResourceAccessModule } from "@/common/access/resource-access.module";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";
import { SettlementCloseService } from "./settlement-close.service";
import { TeamSettlementAccountService } from "./team-settlement-account.service";
import { TeamSettlementAccountController } from "./team-settlement-account.controller";

@Module({
  imports: [PrismaModule, ResourceAccessModule],
  controllers: [SettlementsController, TeamSettlementAccountController],
  providers: [
    SettlementsService,
    SettlementCloseService,
    TeamSettlementAccountService,
  ],
  exports: [SettlementsService, SettlementCloseService],
})
export class SettlementsModule {}
