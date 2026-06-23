import { Module } from "@nestjs/common";
import { PrismaModule } from "@/prisma/prisma.module";
import { ClassesModule } from "@/classes/classes.module";
import { AcademyController } from "./academy.controller";
import { AcademyPublicController } from "./academy-public.controller";
import { AcademyService } from "./academy.service";

@Module({
  imports: [PrismaModule, ClassesModule],
  controllers: [AcademyPublicController, AcademyController],
  providers: [AcademyService],
  exports: [AcademyService],
})
export class AcademyModule {}
