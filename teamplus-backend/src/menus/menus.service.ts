import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { Prisma, UserType } from "@prisma/client";
import {
  CreateAppMenuDto,
  ResetMenuTreeGroupDto,
  UpdateAppMenuDto,
} from "./dto/app-menu.dto";

/** 폴백 raw 쿼리 반환 행 */
interface AppMenuRow {
  id: string;
  parent_id: string | null;
  user_type: string;
  order: number;
  [key: string]: unknown;
}

/** Redis 캐시 TTL: 1시간 */
const MENU_CACHE_TTL = 3600;

@Injectable()
export class MenusService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * 사용자 유형별 메뉴 목록 조회 (Redis 캐싱 적용)
   * DB user_type 컬럼이 VARCHAR/enum 어느 쪽이든 동작하도록 $queryRawUnsafe 폴백
   */
  async getMenusByUserType(userType: UserType) {
    const cacheKey = `menus:${userType}`;

    // Redis 캐시 확인 (RedisService.get은 내부에서 JSON.parse 처리)
    const cached = await this.redis.get<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    let result: any;
    try {
      result = await this.prisma.appMenu.findMany({
        where: { userType, parentId: null },
        orderBy: { order: "asc" },
        include: {
          children: {
            orderBy: { order: "asc" },
            include: {
              children: {
                orderBy: { order: "asc" },
              },
            },
          },
        },
      });
    } catch {
      // enum 타입 불일치 폴백: 단일 쿼리로 전체 메뉴 로드 후 JS에서 트리 구성 (N+1 회피)
      const userTypeStr = String(userType);

      // Prisma.sql 태그드 템플릿으로 매개변수 바인딩 — SQL Injection 방어
      const allMenus = await this.prisma.$queryRaw<AppMenuRow[]>(
        Prisma.sql`SELECT * FROM app_menus WHERE user_type = ${userTypeStr} ORDER BY "order" ASC`,
      );

      const byParent = new Map<string | null, any[]>();
      for (const row of allMenus) {
        const key = row.parent_id ?? null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key)!.push({ ...row, children: [] });
      }

      const attachChildren = (node: any): any => {
        const kids = byParent.get(node.id) ?? [];
        node.children = kids.map(attachChildren);
        return node;
      };

      result = (byParent.get(null) ?? []).map(attachChildren);
    }

    // 결과 캐싱 (RedisService.set은 내부에서 JSON.stringify 처리)
    await this.redis.set(cacheKey, result, MENU_CACHE_TTL);
    return result;
  }

  /**
   * 모든 메뉴 조회
   */
  async getAllMenus() {
    try {
      return await this.prisma.appMenu.findMany({
        orderBy: [{ userType: "asc" }, { order: "asc" }],
      });
    } catch {
      // 정적 쿼리이나 Prisma.sql 로 일관성 유지 및 타입 안전
      return this.prisma.$queryRaw<AppMenuRow[]>(
        Prisma.sql`SELECT * FROM app_menus ORDER BY user_type ASC, "order" ASC`,
      );
    }
  }

  /**
   * 메뉴 상세 조회
   */
  async getMenuById(id: string) {
    const menu = await this.prisma.appMenu.findUnique({
      where: { id },
      include: { children: true },
    });
    if (!menu) throw new NotFoundException("메뉴를 찾을 수 없습니다.");
    return menu;
  }

  /**
   * 메뉴 생성
   */
  async createMenu(dto: CreateAppMenuDto) {
    const result = await this.prisma.appMenu.create({
      data: dto,
    });
    await this.redis.del(`menus:${dto.userType}`);
    return result;
  }

  /**
   * 메뉴 수정
   */
  async updateMenu(id: string, dto: UpdateAppMenuDto) {
    // 캐시 무효화를 위해 변경 전 userType 조회
    const existing = await this.prisma.appMenu.findUnique({
      where: { id },
      select: { userType: true },
    });
    const result = await this.prisma.appMenu.update({
      where: { id },
      data: dto,
    });
    if (existing) {
      await this.redis.del(`menus:${existing.userType}`);
    }
    if (dto.userType && dto.userType !== existing?.userType) {
      await this.redis.del(`menus:${dto.userType}`);
    }
    return result;
  }

  /**
   * 메뉴 삭제
   */
  async deleteMenu(id: string) {
    // 캐시 무효화를 위해 삭제 전 userType 조회
    const existing = await this.prisma.appMenu.findUnique({
      where: { id },
      select: { userType: true },
    });
    const result = await this.prisma.appMenu.delete({
      where: { id },
    });
    if (existing) {
      await this.redis.del(`menus:${existing.userType}`);
    }
    return result;
  }

  /**
   * 특정 사용자 유형의 메뉴를 트리 구조로 재설정.
   * client (admin)가 spec 트리를 보내면 parent → children 순서로 트랜잭션 안에서 생성.
   * createMany 로는 batch 내 parentId 참조가 불가하므로 create 반복 사용.
   */
  async resetTree(userType: UserType, groups: ResetMenuTreeGroupDto[]) {
    await this.prisma.$transaction(async (tx) => {
      try {
        await tx.appMenu.deleteMany({ where: { userType } });
      } catch {
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM app_menus WHERE user_type = ${String(userType)}`,
        );
      }

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const parent = await tx.appMenu.create({
          data: {
            userType,
            label: group.label,
            icon: group.icon,
            href: "#",
            order: i + 1,
            isActive: group.isActive ?? true,
          },
        });

        for (let j = 0; j < group.children.length; j++) {
          const child = group.children[j];
          await tx.appMenu.create({
            data: {
              userType,
              label: child.label,
              icon: child.icon,
              href: child.href,
              order: j + 1,
              isActive: child.isActive ?? true,
              parentId: parent.id,
            },
          });
        }
      }
    });

    await this.redis.del(`menus:${userType}`);
    return this.getMenusByUserType(userType);
  }

  /**
   * 특정 사용자 유형의 메뉴를 일괄 저장 (createMany 벌크 처리)
   */
  async syncMenus(userType: UserType, menus: CreateAppMenuDto[]) {
    // 트랜잭션으로 기존 메뉴 삭제 후 재생성
    const result = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.appMenu.deleteMany({ where: { userType } });
      } catch {
        // enum 타입 불일치 폴백 — Prisma.sql 로 매개변수 바인딩
        await tx.$executeRaw(
          Prisma.sql`DELETE FROM app_menus WHERE user_type = ${String(userType)}`,
        );
      }

      await tx.appMenu.createMany({
        data: menus.map((menu) => ({ ...menu, userType })),
        skipDuplicates: false,
      });

      // createMany는 생성된 레코드를 반환하지 않으므로 조회하여 반환
      return tx.appMenu.findMany({
        where: { userType },
        orderBy: { order: "asc" },
      });
    });

    // 캐시 무효화
    await this.redis.del(`menus:${userType}`);
    return result;
  }
}
