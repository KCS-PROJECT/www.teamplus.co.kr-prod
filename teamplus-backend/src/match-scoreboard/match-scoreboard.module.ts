import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MatchScoreboardController } from "./match-scoreboard.controller";
import { MatchScoreboardService } from "./match-scoreboard.service";
import { MatchScoreboardGateway } from "./match-scoreboard.gateway";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: parseInt(
            configService.get<string>("JWT_EXPIRATION", "900"),
            10,
          ),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MatchScoreboardController],
  providers: [MatchScoreboardService, MatchScoreboardGateway],
  exports: [MatchScoreboardService, MatchScoreboardGateway],
})
export class MatchScoreboardModule {}
