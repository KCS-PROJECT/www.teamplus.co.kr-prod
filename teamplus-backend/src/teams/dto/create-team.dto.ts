import {
  IsString,
  IsNotEmpty,
  IsPhoneNumber,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from "class-validator";

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty({ message: "팀명은 필수입니다." })
  @MinLength(2, { message: "팀명은 최소 2글자 이상이어야 합니다." })
  @MaxLength(50, { message: "팀명은 최대 50글자 이하여야 합니다." })
  clubName!: string;

  // 팀 초대 코드 (선택) — 가입 시엔 미설정, 감독이 팀 관리에서 등록·변경. 고유값.
  @IsOptional()
  @IsString()
  @MinLength(3, { message: "팀 코드는 최소 3자 이상이어야 합니다." })
  @MaxLength(32, { message: "팀 코드는 32자 이하이어야 합니다." })
  @Matches(/^[A-Za-z0-9_\-]+$/, {
    message: "팀 코드는 영문, 숫자, -, _ 만 사용 가능합니다.",
  })
  teamCode?: string;

  @IsOptional()
  @IsPhoneNumber("KR", { message: "올바른 한국 전화번호를 입력해주세요." })
  phoneNumber?: string;

  @IsString()
  @IsOptional()
  location?: string;

  // 홈 링크장 (Venue FK · 2026-05-22) — 등록/수정 시 DB 링크장 마스터에서 선택.
  @IsString()
  @IsOptional()
  venueId?: string;

  // 팀 로고 URL — POST /files/upload?category=IMAGE&refType=team_logo 결과의 `url` 또는 절대 URL.
  //   - 상대 경로(`/uploads/image/...`) 와 외부 URL 모두 허용.
  //   - PUT /teams/:teamId 호출 시 함께 전달하면 Team.logoUrl 갱신.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  // ─── [추가 2026-05-23] 팀 정보 폼 필드 — 프론트 edit page 의 slogan/description/foundingDate 등 SoT 정합화 ───
  //   기존: CreateTeamDto 에 누락되어 ValidationPipe(whitelist) 가 strip → DB 미저장.
  //   조치: schema.prisma 의 Team 모델 컬럼과 일치하도록 추가. updateTeam/createTeam data 매핑도 동반 갱신.

  /** 한 줄 슬로건 (선택) */
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "슬로건은 최대 200자 이내로 입력해 주세요." })
  slogan?: string;

  /** 팀 소개 (자유 서술, 선택) */
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: "팀 소개는 최대 1000자 이내로 입력해 주세요." })
  description?: string;

  /** 창단일 (ISO date string, YYYY-MM-DD) */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}(T.*)?$/, {
    message: "창단일은 YYYY-MM-DD 형식으로 입력해 주세요.",
  })
  foundingDate?: string;

  /** 부문 (U8/U9/U10/U11/U12 등) */
  @IsOptional()
  @IsString()
  division?: string;

  /** 메인 컬러 (HEX, #RRGGBB) */
  @IsOptional()
  @IsString()
  @Matches(/^#?[0-9A-Fa-f]{6}$/, {
    message: "메인 컬러는 HEX 형식(#RRGGBB)으로 입력해 주세요.",
  })
  primaryColor?: string;

  /** 보조 컬러 (HEX, #RRGGBB) */
  @IsOptional()
  @IsString()
  @Matches(/^#?[0-9A-Fa-f]{6}$/, {
    message: "보조 컬러는 HEX 형식(#RRGGBB)으로 입력해 주세요.",
  })
  secondaryColor?: string;

  /** 홈 경기장 (legacy 자유 텍스트 — venueId 있으면 자동 sync) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  homeArena?: string;
}
