import { PartialType } from "@nestjs/swagger";
import { CreateClassDiaryDto } from "./create-class-diary.dto";

export class UpdateClassDiaryDto extends PartialType(CreateClassDiaryDto) {}
