import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { sanitizeStrict } from "@/common/utils/sanitize.util";
import { CreateContactInquiryDto } from "./dto/create-contact-inquiry.dto";
import { UpdateContactInquiryDto } from "./dto/update-contact-inquiry.dto";
import { QueryContactInquiriesDto } from "./dto/query-contact-inquiries.dto";

/**
 * 응답에 노출하는 ContactInquiry 필드 — SPEC §3 ContactInquiryDto.
 * ipAddress / userAgent / deletedAt 은 제외(서버 추적 전용).
 */
const CONTACT_INQUIRY_SELECT = {
  id: true,
  organizationName: true,
  managerName: true,
  email: true,
  phone: true,
  interestedPlan: true,
  clubSize: true,
  message: true,
  privacyAgreed: true,
  status: true,
  adminMemo: true,
  source: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContactInquirySelect;

interface CreateMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ContactInquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 공개 상담 신청 생성.
   * - privacyAgreed !== true 면 400 (DTO @Equals 와 이중 방어)
   * - 모든 문자열 필드 XSS 살균
   * - ip/userAgent 는 컨트롤러에서 추출하여 서버 기록
   */
  async create(dto: CreateContactInquiryDto, meta: CreateMeta = {}) {
    if (dto.privacyAgreed !== true) {
      throw new BadRequestException("개인정보 수집·이용에 동의해주세요.");
    }

    const created = await this.prisma.contactInquiry.create({
      data: {
        organizationName: sanitizeStrict(dto.organizationName),
        managerName: sanitizeStrict(dto.managerName),
        email: sanitizeStrict(dto.email),
        phone: sanitizeStrict(dto.phone),
        interestedPlan: dto.interestedPlan
          ? sanitizeStrict(dto.interestedPlan)
          : null,
        clubSize: dto.clubSize ? sanitizeStrict(dto.clubSize) : null,
        message: dto.message ? sanitizeStrict(dto.message) : null,
        privacyAgreed: true,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
      select: { id: true, createdAt: true },
    });

    return {
      success: true,
      id: created.id,
      createdAt: created.createdAt,
    };
  }

  /**
   * 관리자 목록 조회 — deletedAt=null, createdAt desc, select 명시.
   */
  async findAll(query: QueryContactInquiriesDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(query.pageSize, 100)
        : 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ContactInquiryWhereInput = { deletedAt: null };

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { organizationName: { contains: search, mode: "insensitive" } },
        { managerName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contactInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: CONTACT_INQUIRY_SELECT,
      }),
      this.prisma.contactInquiry.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * 상태별 카운트 — deletedAt=null 기준.
   */
  async getStats() {
    const grouped = await this.prisma.contactInquiry.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    const stats = {
      total: 0,
      NEW: 0,
      IN_PROGRESS: 0,
      DONE: 0,
      ARCHIVED: 0,
    };

    for (const row of grouped) {
      const count = row._count._all;
      stats[row.status] = count;
      stats.total += count;
    }

    return stats;
  }

  /**
   * 상세 조회 — 없으면 404.
   */
  async findOne(id: string) {
    const inquiry = await this.prisma.contactInquiry.findFirst({
      where: { id, deletedAt: null },
      select: CONTACT_INQUIRY_SELECT,
    });

    if (!inquiry) {
      throw new NotFoundException("상담 신청 내역을 찾을 수 없습니다.");
    }

    return inquiry;
  }

  /**
   * 상태/메모 수정 — 없으면 404.
   */
  async update(id: string, dto: UpdateContactInquiryDto) {
    const existing = await this.prisma.contactInquiry.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("상담 신청 내역을 찾을 수 없습니다.");
    }

    const data: Prisma.ContactInquiryUpdateInput = {};
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.adminMemo !== undefined) {
      data.adminMemo = dto.adminMemo ? sanitizeStrict(dto.adminMemo) : null;
    }

    return this.prisma.contactInquiry.update({
      where: { id },
      data,
      select: CONTACT_INQUIRY_SELECT,
    });
  }

  /**
   * soft delete (deletedAt=now) — 없으면 404.
   */
  async remove(id: string) {
    const existing = await this.prisma.contactInquiry.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("상담 신청 내역을 찾을 수 없습니다.");
    }

    await this.prisma.contactInquiry.update({
      where: { id },
      data: { deletedAt: new Date() },
      select: { id: true },
    });

    return { success: true };
  }
}
