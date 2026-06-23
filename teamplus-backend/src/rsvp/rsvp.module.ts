import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { RsvpController } from "./rsvp.controller";
import { RsvpService } from "./rsvp.service";

@Module({
  imports: [PrismaModule],
  controllers: [RsvpController],
  providers: [RsvpService],
  exports: [RsvpService],
})
export class RsvpModule {}
