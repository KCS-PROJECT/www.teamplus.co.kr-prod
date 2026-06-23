import { Module } from "@nestjs/common";
import { EquipmentChecklistController } from "./equipment-checklist.controller";
import { EquipmentChecklistService } from "./equipment-checklist.service";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [EquipmentChecklistController],
  providers: [EquipmentChecklistService],
  exports: [EquipmentChecklistService],
})
export class EquipmentChecklistModule {}
