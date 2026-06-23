import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ContactInquiriesController } from "./contact-inquiries.controller";
import { ContactInquiriesService } from "./contact-inquiries.service";

@Module({
  imports: [PrismaModule],
  controllers: [ContactInquiriesController],
  providers: [ContactInquiriesService],
  exports: [ContactInquiriesService],
})
export class ContactInquiriesModule {}
