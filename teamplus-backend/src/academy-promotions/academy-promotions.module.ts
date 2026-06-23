import { Module } from "@nestjs/common";
import { AcademyPromotionsController } from "./academy-promotions.controller";
import { AcademyPromotionsService } from "./academy-promotions.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [AcademyPromotionsController],
  providers: [AcademyPromotionsService],
  exports: [AcademyPromotionsService],
})
export class AcademyPromotionsModule {}
