import { Module, forwardRef } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BullModule } from "@nestjs/bull";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { AlimtalkGateway } from "./alimtalk.gateway";
import { AlimtalkProcessor } from "./alimtalk.processor";
import { AlimtalkTemplateController } from "./alimtalk-template.controller";
import { AlimtalkTemplateService } from "./alimtalk-template.service";
import { NotificationQueue } from "./notification.queue";
import { FcmService } from "./fcm.service";
import { PushPolicyService } from "./push-policy.service";
import { PushProcessor } from "./push.processor";
import { DeviceCleanupScheduler } from "./device-cleanup.scheduler";
import { PrismaModule } from "@/prisma/prisma.module";
import { WebsocketModule } from "@/websocket/websocket.module";
import { SmsModule } from "@/sms/sms.module";
import kakaoConfig from "@/config/kakao.config";
import firebaseConfig from "@/config/firebase.config";

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forFeature(kakaoConfig),
    ConfigModule.forFeature(firebaseConfig),
    forwardRef(() => WebsocketModule),
    SmsModule,
    BullModule.registerQueue({ name: "alimtalk" }),
    BullModule.registerQueue({ name: "push" }),
  ],
  controllers: [NotificationsController, AlimtalkTemplateController],
  providers: [
    NotificationsService,
    AlimtalkGateway,
    AlimtalkProcessor,
    NotificationQueue,
    FcmService,
    PushPolicyService,
    PushProcessor,
    DeviceCleanupScheduler,
    AlimtalkTemplateService,
  ],
  exports: [NotificationsService, FcmService, AlimtalkTemplateService],
})
export class NotificationsModule {}
