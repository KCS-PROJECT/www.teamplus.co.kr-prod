import { Logger, Provider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NicePayoutFakeGateway } from "./nice-payout-fake.gateway";
import { NicePayoutHttpGateway } from "./nice-payout-http.gateway";
import { NICE_PAYOUT_GATEWAY, NicePayoutGateway } from "./nice-payout.types";
import {
  requestsFakePayoutGateway,
  resolvePayoutGatewayKind,
} from "../constants/payout-mode.constant";

export function createNicePayoutGateway(
  config: ConfigService,
): NicePayoutGateway {
  if (resolvePayoutGatewayKind(config) === "fake") {
    return new NicePayoutFakeGateway();
  }
  if (requestsFakePayoutGateway(config)) {
    // 운영에서 fake 가 켜지면 실제 지급 없이 성공으로 기록되므로 무시하고 실제 구현으로 간다.
    new Logger("NicePayoutGateway").error(
      "NICE_PAYOUT_GATEWAY=fake 는 production 에서 허용되지 않습니다. 실제 게이트웨이를 사용합니다.",
    );
  }
  return new NicePayoutHttpGateway(config);
}

export const nicePayoutGatewayProvider: Provider = {
  provide: NICE_PAYOUT_GATEWAY,
  inject: [ConfigService],
  useFactory: createNicePayoutGateway,
};
