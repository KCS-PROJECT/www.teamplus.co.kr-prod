import { Module } from "@nestjs/common";
import { UserSafetyService } from "./user-safety.service";
import { UserSafetyController } from "./user-safety.controller";
import { PrismaModule } from "@/prisma/prisma.module";
import { AuthModule } from "@/auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [UserSafetyController],
  providers: [UserSafetyService],
  exports: [UserSafetyService],
})
export class UserSafetyModule {}
