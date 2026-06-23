import { Module, forwardRef } from "@nestjs/common";
import { UsersService } from "./users.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "@/auth/auth.module";
import { ParentProfileService } from "./parent-profile.service";
import { ParentProfileController } from "./parent-profile.controller";
import { ChildProfileService } from "./child-profile.service";
import { ChildProfileController } from "./child-profile.controller";
import { CoachProfileService } from "./coach-profile.service";
import { CoachProfileController } from "./coach-profile.controller";
import { CoachesController } from "./coaches.controller";
import { UsersMeController } from "./users-me.controller";
import { DormantScheduler } from "./dormant.scheduler";
import { DataExportService } from "./data-export.service";
import { TermsConsentService } from "./terms-consent.service";
import { NotificationsModule } from "@/notifications/notifications.module";
import { RedisModule } from "@/redis/redis.module";

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AuthModule),
    NotificationsModule,
    RedisModule,
  ],
  controllers: [
    ParentProfileController,
    ChildProfileController,
    CoachProfileController,
    CoachesController,
    UsersMeController,
  ],
  providers: [
    UsersService,
    ParentProfileService,
    ChildProfileService,
    CoachProfileService,
    DormantScheduler,
    DataExportService,
    TermsConsentService,
  ],
  exports: [
    UsersService,
    ParentProfileService,
    ChildProfileService,
    CoachProfileService,
  ],
})
export class UsersModule {}
