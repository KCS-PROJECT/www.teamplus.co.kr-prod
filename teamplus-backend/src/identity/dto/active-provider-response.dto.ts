import { ApiProperty } from "@nestjs/swagger";
import { IdentityProviderType } from "./initiate-identity.dto";

/**
 * 활성 본인인증 provider 조회 응답
 *
 * [R1 #3] 프론트가 KG 팝업을 열지 포트원 SDK 경로로 갈지 클릭 "이전"에 알아야
 * 팝업을 투기적으로 열지 않을 수 있다. identity.config.ts 의
 * common.activeProvider(IDENTITY_PROVIDER 환경변수)를 그대로 노출한다 —
 * "배포 없이 env 로 전환"이 목표이므로 빌드타임 상수로 굳히지 않는다.
 */
export class ActiveProviderResponseDto {
  @ApiProperty({
    enum: IdentityProviderType,
    description: "현재 활성화된 본인인증 provider (IDENTITY_PROVIDER 환경변수)",
    example: IdentityProviderType.PORTONE,
  })
  provider!: "portone" | "kg_inicis";
}
