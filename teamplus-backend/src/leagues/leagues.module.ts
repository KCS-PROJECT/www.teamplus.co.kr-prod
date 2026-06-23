import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { LeaguesService } from "./leagues.service";
import {
  LeagueController,
  DivisionController,
  TournamentMatchController,
} from "./leagues.controller";

@Module({
  imports: [PrismaModule],
  controllers: [
    LeagueController,
    DivisionController,
    TournamentMatchController,
  ],
  providers: [LeaguesService],
  exports: [LeaguesService],
})
export class LeaguesModule {}
