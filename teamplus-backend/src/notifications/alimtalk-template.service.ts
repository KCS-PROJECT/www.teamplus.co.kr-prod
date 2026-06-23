import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import {
  CreateAlimtalkTemplateDto,
  UpdateAlimtalkTemplateDto,
} from "./dto/alimtalk-template.dto";

/**
 * AlimtalkTemplate CRUD 서비스 (2026-05-14 Phase D-9 확장).
 *
 * AlimtalkGateway 의 5분 메모리 캐시와 별개로, 관리자가 운영 중 추가/수정
 * 가능한 템플릿 본문을 DB 에서 관리한다. Gateway 는 다음 호출부터 새 본문을
 * 캐시에 반영 (자동 invalidate 는 P3 follow-up).
 */
@Injectable()
export class AlimtalkTemplateService {
  private readonly logger = new Logger(AlimtalkTemplateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(opts: {
    category?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = opts.page && opts.page > 0 ? opts.page : 1;
    const limit =
      opts.limit && opts.limit > 0 && opts.limit <= 100 ? opts.limit : 20;
    const where: Prisma.AlimtalkTemplateWhereInput = {};
    if (opts.category) where.category = opts.category;
    if (typeof opts.isActive === "boolean") where.isActive = opts.isActive;

    const [items, total] = await Promise.all([
      this.prisma.alimtalkTemplate.findMany({
        where,
        orderBy: [{ category: "asc" }, { templateCode: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alimtalkTemplate.count({ where }),
    ]);

    return { total, page, limit, data: items };
  }

  async findOne(id: string) {
    const row = await this.prisma.alimtalkTemplate.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException("AlimtalkTemplate 을 찾을 수 없습니다.");
    }
    return row;
  }

  async create(dto: CreateAlimtalkTemplateDto) {
    const existing = await this.prisma.alimtalkTemplate.findUnique({
      where: { templateCode: dto.templateCode },
    });
    if (existing) {
      throw new ConflictException(
        `이미 존재하는 templateCode: ${dto.templateCode}`,
      );
    }
    this.logger.log(`AlimtalkTemplate 생성: ${dto.templateCode} (${dto.name})`);
    return this.prisma.alimtalkTemplate.create({
      data: {
        templateCode: dto.templateCode,
        name: dto.name,
        content: dto.content,
        variables: dto.variables ?? [],
        category: dto.category ?? null,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateAlimtalkTemplateDto) {
    // findOne 으로 존재 확인 (없으면 404)
    await this.findOne(id);
    this.logger.log(`AlimtalkTemplate 수정: id=${id}`);
    return this.prisma.alimtalkTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.variables !== undefined ? { variables: dto.variables } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    this.logger.log(`AlimtalkTemplate 삭제: id=${id}`);
    await this.prisma.alimtalkTemplate.delete({ where: { id } });
    return { success: true };
  }
}
