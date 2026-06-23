import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsIn,
  Min,
  Max,
  MaxLength,
  IsArray,
} from "class-validator";

// ==================== League DTOs ====================

export class CreateLeagueDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(20)
  season!: string;

  @IsInt()
  year!: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(["U9", "U12", "U15", "U18"])
  ageGroup?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "active", "completed"])
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  teamId?: string;
}

export class UpdateLeagueDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  season?: string;

  @IsOptional()
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(["U9", "U12", "U15", "U18"])
  ageGroup?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  @IsIn(["draft", "active", "completed"])
  status?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  teamId?: string;
}

// ==================== Division DTOs ====================

export class CreateDivisionDto {
  @IsString()
  leagueId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  level?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTeams?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateDivisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  level?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTeams?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

// ==================== TeamDivision DTOs ====================

export class CreateTeamDivisionDto {
  @IsString()
  teamId!: string;

  @IsString()
  divisionId!: string;

  @IsString()
  @MaxLength(20)
  season!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seed?: number;
}

export class BulkCreateTeamDivisionDto {
  @IsString()
  divisionId!: string;

  @IsString()
  @MaxLength(20)
  season!: string;

  @IsArray()
  @IsString({ each: true })
  teamIds!: string[];
}

// ==================== TournamentMatch DTOs ====================

export class CreateTournamentMatchDto {
  @IsString()
  tournamentId!: string;

  @IsOptional()
  @IsString()
  divisionId?: string;

  @IsString()
  homeTeamId!: string;

  @IsString()
  awayTeamId!: string;

  @IsDateString()
  matchDate!: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsString()
  round?: string;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  referee?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class UpdateTournamentMatchDto {
  @IsOptional()
  @IsDateString()
  matchDate?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsString()
  round?: string;

  @IsOptional()
  @IsString()
  @IsIn(["scheduled", "ongoing", "completed", "cancelled"])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  homeScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayScore?: number;

  @IsOptional()
  @IsString()
  period?: string;

  @IsOptional()
  @IsString()
  referee?: string;

  @IsOptional()
  @IsString()
  memo?: string;
}

export class GenerateRoundRobinDto {
  @IsString()
  tournamentId!: string;

  @IsString()
  divisionId!: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  matchDurationMinutes?: number;

  @IsOptional()
  @IsString()
  venueId?: string;
}
