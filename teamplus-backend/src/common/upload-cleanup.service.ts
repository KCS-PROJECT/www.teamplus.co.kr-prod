import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { promises as fsp } from "fs";
import { basename } from "path";
import { PrismaService } from "@/prisma/prisma.service";
import { resolveUploadAbsolutePath } from "@/common/upload-paths";

/**
 * 교체된 업로드 파일 정리 공용 서비스.
 *
 * 팀 로고(team_logo)·오픈클래스(academy_logo) 등 **업로더≠교체자**가 될 수 있는
 * 도메인에서 로고/이미지 교체 시 이전 파일이 디스크에 누적되는 orphan 을 방지한다.
 * (users.service 의 cleanupPreviousAvatar 는 uploaderId 매칭이라 교체자가 다르면 실패 —
 *  본 서비스는 uploaderId 대신 url 기준으로 역추적한다.)
 *
 * FilesModule ↔ TeamsModule 순환 의존(FilesModule 이 TeamsModule 을 import)을 피하기 위해
 * FilesService 가 아닌 별도 @Global 공용 서비스로 분리한다.
 */
@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 교체로 더 이상 참조되지 않는 이전 업로드 파일을 정리한다 (best-effort).
   *
   * 안전장치: `/uploads/` 접두 검증 + path traversal 방지 + resolveUploadAbsolutePath.
   * 역추적: url 기준(옵션 refType+refId 함께 매칭 시 정확도↑). 레코드가 있으면 DB 삭제 +
   *   디스크(원본/path · thumbUrl(≠url) · `.display.webp→.large.webp` large 형제) 삭제.
   *   레코드가 없으면 url 기준 디스크만 삭제(+large 형제). 실패는 전부 무시(ENOENT 포함).
   *
   * @param oldUrl 교체 전 URL (null/외부 URL/빈 문자열이면 no-op)
   * @param opts   refType/refId 로 역추적 정확도 보강 (선택)
   */
  async cleanupReplacedUpload(
    oldUrl: string | null | undefined,
    opts?: { refType?: string; refId?: string },
  ): Promise<void> {
    if (!oldUrl || !oldUrl.startsWith("/uploads/")) return;

    // path traversal 방지 — 경로 분해 후 basename 만 확인
    const segments = oldUrl
      .replace(/^\/uploads\/+/, "")
      .split("/")
      .filter((s) => s && !s.includes(".."));
    if (segments.length < 2) {
      this.logger.warn(`업로드 URL 형식 비정상 — 정리 스킵: ${oldUrl}`);
      return;
    }
    const filename = basename(segments[segments.length - 1]);
    if (!filename || filename.includes("/") || filename.includes("\\")) {
      this.logger.warn(`업로드 파일명 비정상 — 정리 스킵: ${oldUrl}`);
      return;
    }

    const where: Prisma.UploadedFileWhereInput = { url: oldUrl };
    if (opts?.refType) where.refType = opts.refType;
    if (opts?.refId) where.refId = opts.refId;

    const record = await this.prisma.uploadedFile.findFirst({
      where,
      select: { id: true, path: true, url: true, thumbUrl: true },
    });

    if (record) {
      await this.prisma.uploadedFile
        .delete({ where: { id: record.id } })
        .catch((err) => {
          this.logger.warn(
            `이전 업로드 UploadedFile 레코드 삭제 실패: ${record.id} - ${(err as Error).message}`,
          );
        });

      // 원본/display 정리
      await this.unlinkByDbPath(record.path);
      // 썸네일 — 신규 리사이즈 경로는 thumbUrl==url(display) 이므로 재삭제 스킵
      if (record.thumbUrl && record.thumbUrl !== record.url) {
        await this.unlinkByDbPath(record.thumbUrl);
      }
      // large 파생본 형제 (신규 리사이즈 경로)
      if (record.url?.endsWith(".display.webp")) {
        await this.unlinkByDbPath(
          record.url.replace(/\.display\.webp$/, ".large.webp"),
        );
      }

      this.logger.log(`이전 업로드 정리 완료: url=${oldUrl}`);
    } else {
      // 레코드 없음 — url 기준 디스크만 정리 (+large 형제)
      await this.unlinkByDbPath(oldUrl);
      if (oldUrl.endsWith(".display.webp")) {
        await this.unlinkByDbPath(
          oldUrl.replace(/\.display\.webp$/, ".large.webp"),
        );
      }
    }
  }

  /** DB path/url → 안전 절대경로 변환 후 unlink (ENOENT 무시, 그 외 warn). */
  private async unlinkByDbPath(dbPathOrUrl: string): Promise<void> {
    const absolute = resolveUploadAbsolutePath(dbPathOrUrl);
    if (!absolute) return;
    await fsp.unlink(absolute).catch((err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
      this.logger.warn(
        `이전 업로드 디스크 삭제 실패: ${absolute} - ${(err as Error).message}`,
      );
    });
  }
}
