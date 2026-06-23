import { PartialType } from "@nestjs/swagger";
import { CreateTeamGroupDto } from "./create-team-group.dto";

export class UpdateTeamGroupDto extends PartialType(CreateTeamGroupDto) {}
