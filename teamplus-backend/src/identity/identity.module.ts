import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { IdentityService } from "./identity.service";
import { IdentityController } from "./identity.controller";
import { PrismaModule } from "@/prisma/prisma.module";
import { RedisModule } from "@/redis/redis.module";
import identityConfig from "@/config/identity.config";

// Identity Gateways
import { KgInicisIdentityGateway } from "./gateways/kg-inicis-identity.gateway";
import { KakaoIdentityGateway } from "./gateways/kakao-identity.gateway";
import { NiceIdentityGateway } from "./gateways/nice-identity.gateway";
import { PassIdentityGateway } from "./gateways/pass-identity.gateway";
import { PortOneIdentityGateway } from "./gateways/portone-identity.gateway";
import { IIdentityGateway } from "./gateways/identity-gateway.interface";
import { IDENTITY_GATEWAYS } from "./identity.tokens";

/**
 * 본인인증 모듈
 *
 * 지원 제공자:
 * - KG이니시스 (직계약)
 * - 카카오
 * - NICE평가정보
 * - PASS 앱
 * - 포트원(PortOne) — KG이니시스 통합인증 경유 (2026-05-26 신규)
 *
 * 주의: CHILD/TEEN 은 본인인증 대상이 아님 (학부모가 자녀로 등록 대행)
 * PARENT/COACH/DIRECTOR/ACADEMY_DIRECTOR 만 본인인증 강제 (NEW-02, auth.service.ts:202)
 */
@Module({
  imports: [PrismaModule, RedisModule, ConfigModule.forFeature(identityConfig)],
  controllers: [IdentityController],
  providers: [
    IdentityService,
    // 5개 Gateway 인스턴스 (DI 컨테이너에 등록)
    KgInicisIdentityGateway,
    KakaoIdentityGateway,
    NiceIdentityGateway,
    PassIdentityGateway,
    PortOneIdentityGateway,
    // Gateway 배열을 IdentityService 에 일괄 주입 (등록 메커니즘)
    {
      provide: IDENTITY_GATEWAYS,
      useFactory: (
        kgInicis: KgInicisIdentityGateway,
        kakao: KakaoIdentityGateway,
        nice: NiceIdentityGateway,
        pass: PassIdentityGateway,
        portone: PortOneIdentityGateway,
      ): IIdentityGateway[] => [kgInicis, kakao, nice, pass, portone],
      inject: [
        KgInicisIdentityGateway,
        KakaoIdentityGateway,
        NiceIdentityGateway,
        PassIdentityGateway,
        PortOneIdentityGateway,
      ],
    },
  ],
  exports: [IdentityService],
})
export class IdentityModule {}
