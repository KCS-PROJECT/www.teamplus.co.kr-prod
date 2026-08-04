import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/public.decorator";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { AuthenticatedRequest } from "@/common/interfaces/authenticated-request.interface";
import { ClassesExploreService } from "./classes-explore.service";
import { ExploreClassesQueryDto } from "./dto/explore-classes-query.dto";

/**
 * 전국 수업 탐색 — 비로그인 접근 가능한 발견(discovery) 엔드포인트.
 *
 * ⚠️ 별도 컨트롤러로 분리한 이유:
 *   `ClassesListController` 는 클래스 레벨에 `@UseGuards(AuthGuard("jwt"))` 가 걸려 있어
 *   raw Passport 가드가 `@Public()` 을 인식하지 못한다 — 공개 GET 까지 401 이 된다.
 *   (`blog.controller.ts` 에 문서화된 프로젝트 공통 함정, contact-inquiries 동일 사례)
 *   `@Public` 바이패스는 전역 JwtAuthGuard 만 지원하므로 가드를 메서드 레벨로 내린다.
 *
 * ⚠️ 모듈 등록 순서 주의:
 *   `ClassesListController` 에 `@Get(":classId")` 가 있어 `/classes/explore` 가
 *   classId="explore" 로 잡힐 수 있다. NestJS 는 컨트롤러 등록 순서대로 매칭하므로
 *   `classes.module.ts` 의 controllers 배열에서 이 컨트롤러가 반드시 먼저 와야 한다.
 *
 * SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md §5-2
 */
@ApiTags("Classes")
@Controller("api/v1/classes")
export class ClassesExploreController {
  constructor(private readonly exploreService: ClassesExploreService) {}

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get("explore")
  @ApiOperation({
    summary: "전국 수업 탐색",
    description:
      "감독/코치가 공개한 수업을 지역·요일·시간대·연령·가격으로 찾습니다. " +
      "인증 없이 호출 가능하며, 노출 범위는 서버가 뷰어 기준으로 강제합니다 — " +
      "비로그인은 전체공개(PUBLIC) 수업만, 로그인 사용자는 학부모공개(PARENTS_ONLY)까지, " +
      "소속 팀이 있으면 그 팀의 비공개(TEAM_ONLY)·지정 팀(SELECTED_TEAMS) 수업이 추가됩니다.",
  })
  @ApiResponse({
    status: 200,
    description: "탐색 성공",
    schema: {
      example: {
        items: [
          {
            id: "class-uuid",
            className: "U12 정규반",
            description: "주 3회 정규 훈련",
            category: "KIDS",
            trainingType: "regular",
            visibility: "PARENTS_ONLY",
            owner: {
              type: "team",
              id: "team-uuid",
              name: "강남아이스하키클럽",
              logoUrl: null,
            },
            venue: {
              id: "venue-uuid",
              name: "목동아이스링크",
              city: "서울",
              address: "서울특별시 양천구 안양천로 939",
            },
            daySchedules: [
              { dayOfWeek: "월", startTime: "17:00", endTime: "18:30" },
              { dayOfWeek: "수", startTime: "17:00", endTime: "18:30" },
            ],
            price: {
              min: 35000,
              feeType: "PER_SESSION",
              billingTiming: "PREPAID",
            },
            capacity: 20,
            enrolledCount: 16,
            remainingSeats: 4,
            targetBirthYears: [2014, 2015],
            ageMin: 11,
            ageMax: 12,
            levelRequired: null,
            coachName: "김코치",
            createdAt: "2026-08-01T09:00:00.000Z",
          },
        ],
        total: 37,
        page: 1,
        pageSize: 20,
      },
    },
  })
  async explore(
    @Query() query: ExploreClassesQueryDto,
    @Request() req: AuthenticatedRequest,
  ) {
    // @Public + OptionalJwtAuthGuard — 비로그인 요청은 req.user 가 undefined 다.
    return this.exploreService.exploreClasses(query, req.user);
  }
}
