import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { clampLimit, clampOffset } from "@/common/utils/pagination-clamp.util";
import {
  resolveViewerBirthYears,
  buildBirthYearWhere,
  type ViewerLike,
} from "@/common/utils/viewer-birth-years.util";
import { resolveViewerTeamIds } from "@/common/utils/team-scope.util";
import {
  CLASSES_DOMAIN_TRAINING_TYPES,
  CLASS_DAYS_OF_WEEK,
  CLASS_TIME_SLOTS,
} from "@/common/constants/class-domain.constant";
import { buildClassVisibilityWhere } from "./utils/class-visibility.util";
import {
  buildClassRegionWhere,
  formatRegionLabel,
} from "./utils/class-region.util";
import { ExploreClassesQueryDto } from "./dto/explore-classes-query.dto";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

/** 요일 정렬용 인덱스 — 한글 요일은 사전순이 실제 순서와 다르다(금·목·수…). */
const DAY_ORDER = new Map<string, number>(
  CLASS_DAYS_OF_WEEK.map((d, i) => [d, i]),
);

/**
 * 전국 수업 탐색 서비스 — `GET /api/v1/classes/explore`.
 *
 * [2026-08-04] 기존 `getAllClasses` 는 뷰어의 소속 팀 교집합을 강제해서
 *   팀에 가입하지 않은 학부모에게는 빈 배열을 반환한다(classes.service.ts §PARENT 분기).
 *   그 동작은 "내가 소속된 수업" 목록으로 그대로 두고, 발견(discovery) 경로를 이 서비스로 분리했다.
 *
 * 노출 규칙은 `buildClassVisibilityWhere` 단일 SoT 를 따른다.
 * SoT: docs/Planning/SPEC_CLASS_VISIBILITY.md
 */
@Injectable()
export class ClassesExploreService {
  constructor(private readonly prisma: PrismaService) {}

  async exploreClasses(query: ExploreClassesQueryDto, user?: ViewerLike) {
    const pageSize = clampLimit(query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    // page 는 1-base. clampOffset 은 0-base 상한(1000)을 재사용해 깊은 페이지네이션을 막는다.
    const page = Math.max(1, clampOffset(query.page, 1000) || 1);
    const skip = (page - 1) * pageSize;

    const viewerTeamIds = user
      ? await resolveViewerTeamIds(this.prisma, user.id, user.userType)
      : [];

    const where = await this.buildWhere(query, user, viewerTeamIds);

    const [rows, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        select: EXPLORE_CLASS_SELECT,
        orderBy:
          query.sort === "capacity"
            ? [{ capacity: "desc" }, { createdAt: "desc" }]
            : { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      this.prisma.class.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toCard(r)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 조회 조건 구성.
   *
   * 공통 강제 필터(클라이언트가 무엇을 보내든 고정):
   *   isActive · approvalStatus=APPROVED · endedAt=null · 소문자 trainingType.
   * 마지막 둘이 없으면 미승인 수업과 감독 내부 훈련(대문자)이 외부에 노출된다.
   */
  private async buildWhere(
    query: ExploreClassesQueryDto,
    user: ViewerLike | undefined,
    viewerTeamIds: string[],
  ): Promise<Prisma.ClassWhereInput> {
    const and: Prisma.ClassWhereInput[] = [
      buildClassVisibilityWhere(user, viewerTeamIds),
    ];

    // 연령 — 로그인 학부모/학생은 자녀·본인 출생연도로 자동 제한,
    //   비로그인/미해당 역할은 query.birthYear 로 수동 지정 가능.
    const viewerBirthYears = await resolveViewerBirthYears(this.prisma, user);
    const birthYears =
      viewerBirthYears.length > 0
        ? viewerBirthYears
        : query.birthYear
          ? [query.birthYear]
          : [];
    const ageWhere = buildBirthYearWhere(birthYears);
    if (ageWhere) and.push(ageWhere);

    if (query.q) {
      const q = query.q.trim();
      if (q.length > 0) {
        and.push({
          OR: [
            { className: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { instructorName: { contains: q, mode: "insensitive" } },
            { team: { name: { contains: q, mode: "insensitive" } } },
            { academy: { name: { contains: q, mode: "insensitive" } } },
          ],
        });
      }
    }

    // 지역 — [2026-08-04] 수업이 직접 가진 regionCity/regionDistrict 가 SoT 로 바뀌었다.
    //   구 데이터(regionCity=null)는 수업 장소 → 팀 홈링크장 시/도로 폴백한다.
    //   시군구까지 고른 경우 폴백 대상은 제외된다(구 미상 수업을 섞지 않는다).
    const regionWhere = buildClassRegionWhere(query.city, query.district);
    if (regionWhere) and.push(regionWhere);

    if (query.dayOfWeek && query.dayOfWeek.length > 0) {
      and.push({
        dayScheduleEntries: { some: { dayOfWeek: { in: query.dayOfWeek } } },
      });
    }

    if (query.timeSlot) {
      const slot = CLASS_TIME_SLOTS[query.timeSlot];
      and.push({
        dayScheduleEntries: {
          some: { startTime: { gte: slot.gte, lt: slot.lt } },
        },
      });
    }

    // 가격 — 판매 중(isActive) 상품 중 하나라도 상한 이하면 노출.
    if (query.priceMax !== undefined) {
      and.push({
        products: { some: { isActive: true, price: { lte: query.priceMax } } },
      });
    }

    return {
      isActive: true,
      approvalStatus: "APPROVED",
      endedAt: null,
      trainingType: { in: [...CLASSES_DOMAIN_TRAINING_TYPES] },
      ...(query.category ? { category: query.category } : {}),
      ...(query.trainingType ? { trainingType: query.trainingType } : {}),
      AND: and,
    };
  }

  /**
   * 카드 응답 매핑 — 학부모가 "등록할지" 판단하는 데 필요한 정보를 모두 싣는다.
   *
   * 기존 통합검색(`/search?type=classes`)은 가격·일정·장소가 빠져 있어
   * 수업을 발견해도 등록 판단을 할 수 없었다. 그 격차를 메우는 것이 이 매핑의 목적이다.
   *
   * ⚠️ 수강생 개인정보는 일절 포함하지 않는다(비로그인도 호출 가능한 경로).
   */
  private toCard(row: ExploreClassRow) {
    // [venueText] 장소 우선순위: 수업 링크장(FK) → 수업 텍스트 장소(venueId 없이 venueText) → 팀 홈링크장.
    //   텍스트 장소는 그 자체가 장소 전체라 홈링크장 이름과 결합하지 않는다(교차 조합 금지).
    //   지역 라벨의 시/도 폴백은 기존대로 링크장(수업 → 홈) 도시를 쓴다.
    const ownVenue = row.venue ?? null;
    const homeVenue = row.team?.homeVenue ?? null;
    const textOnlyVenue = !ownVenue && !!row.venueText;
    const venue = ownVenue ?? (textOnlyVenue ? null : homeVenue);
    const regionVenue = ownVenue ?? homeVenue;
    const cheapest = row.products[0] ?? null;
    const enrolledCount = row._count.registrations;
    // capacity 0 = 무제한(생성 폼에서 미입력 시 0). 잔여석 개념이 없으므로 null.
    const remainingSeats =
      row.capacity > 0 ? Math.max(0, row.capacity - enrolledCount) : null;

    return {
      id: row.id,
      className: row.className,
      description: row.description,
      category: row.category,
      trainingType: row.trainingType,
      visibility: row.visibility,
      owner: row.team
        ? {
            type: "team" as const,
            id: row.team.id,
            name: row.team.name,
            logoUrl: row.team.logoUrl,
          }
        : row.academy
          ? {
              type: "academy" as const,
              id: row.academy.id,
              name: row.academy.name,
              logoUrl: row.academy.imageUrl,
            }
          : null,
      venue: venue
        ? {
            id: venue.id,
            name: venue.name,
            city: venue.city,
            address: venue.address,
          }
        : null,
      // [venueText] venue 있으면 세부 구역, 없으면 장소 전체. 홈링크장 폴백 시엔 항상 null(수업 텍스트가 없을 때만 폴백).
      venueText: row.venueText ?? null,
      // [2026-08-04] 수업 지역 — 카드에 "서울 강남구" 로 노출해 타지역 오등록을 막는다.
      //   감독 선택값이 없으면(구 데이터) 장소 시/도로 폴백 — 이때 시군구는 표시되지 않는다.
      regionCity: row.regionCity,
      regionDistrict: row.regionDistrict,
      regionLabel:
        formatRegionLabel(row.regionCity, row.regionDistrict) ??
        regionVenue?.city ??
        null,
      daySchedules: [...row.dayScheduleEntries].sort(
        (a, b) =>
          (DAY_ORDER.get(a.dayOfWeek) ?? 99) -
          (DAY_ORDER.get(b.dayOfWeek) ?? 99),
      ),
      price: cheapest
        ? {
            min: cheapest.price,
            feeType: cheapest.feeType,
            billingTiming: cheapest.billingTiming,
          }
        : null,
      capacity: row.capacity,
      enrolledCount,
      remainingSeats,
      targetBirthYears: row.targetBirthYears,
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      levelRequired: row.levelRequired,
      coachName: row.instructorName,
      createdAt: row.createdAt,
    };
  }
}

const EXPLORE_CLASS_SELECT = {
  id: true,
  className: true,
  description: true,
  category: true,
  trainingType: true,
  visibility: true,
  capacity: true,
  ageMin: true,
  ageMax: true,
  targetBirthYears: true,
  levelRequired: true,
  instructorName: true,
  createdAt: true,
  regionCity: true,
  regionDistrict: true,
  team: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      // 홈 링크장 — 수업에 장소가 지정되지 않았을 때의 지역 폴백.
      homeVenue: {
        select: { id: true, name: true, city: true, address: true },
      },
    },
  },
  academy: { select: { id: true, name: true, imageUrl: true } },
  venue: { select: { id: true, name: true, city: true, address: true } },
  venueText: true,
  dayScheduleEntries: {
    select: { dayOfWeek: true, startTime: true, endTime: true },
  },
  // 최저가 1건 — 카드의 "회당 N원" 표기용.
  products: {
    where: { isActive: true },
    select: { price: true, feeType: true, billingTiming: true },
    orderBy: { price: "asc" },
    take: 1,
  },
  _count: { select: { registrations: { where: { status: "active" } } } },
} satisfies Prisma.ClassSelect;

type ExploreClassRow = Prisma.ClassGetPayload<{
  select: typeof EXPLORE_CLASS_SELECT;
}>;
