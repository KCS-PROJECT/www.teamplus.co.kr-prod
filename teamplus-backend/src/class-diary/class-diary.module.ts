import { Module } from "@nestjs/common";
import { ClassDiaryController } from "./class-diary.controller";
import { ClassDiaryService } from "./class-diary.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [ClassDiaryController],
  providers: [ClassDiaryService],
  exports: [ClassDiaryService],
})
export class ClassDiaryModule {}
