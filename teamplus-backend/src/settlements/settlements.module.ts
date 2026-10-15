import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ResourceAccessModule } from "@/common/access/resource-access.module";
import { SettlementsController } from "./settlements.controller";
import { SettlementsService } from "./settlements.service";
import { SettlementCloseService } from "./settlement-close.service";
import { TeamSettlementAccountService } from "./team-settlement-account.service";
import { TeamSettlementAccountController } from "./team-settlement-account.controller";
import { NicePayoutApiService } from "./nice-payout-api.service";
import { nicePayoutGatewayProvider } from "./gateway/nice-payout.provider";
import { SettlementPayoutRequestService } from "./settlement-payout-request.service";
import { SettlementPayoutResultService } from "./settlement-payout-result.service";

@Module({
  imports: [PrismaModule, ResourceAccessModule],
  controllers: [SettlementsController, TeamSettlementAccountController],
  providers: [
    SettlementsService,
    SettlementCloseService,
    TeamSettlementAccountService,
    NicePayoutApiService,
    nicePayoutGatewayProvider,
    SettlementPayoutRequestService,
    SettlementPayoutResultService,
  ],
  exports: [SettlementsService, SettlementCloseService],
})
export class SettlementsModule {}
