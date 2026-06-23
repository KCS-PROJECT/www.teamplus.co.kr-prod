import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { Prisma, UploadCategory } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { promises as fsp } from "fs";
import { extname, join } from "path";
import sharp from "sharp";
import { PrismaService } from "@/prisma/prisma.service";
import { TeamsService } from "@/teams/teams.service";
import { NotificationsGateway } from "@/websocket/notifications.gateway";
import {
  FileResponseDto,
  UploadFileDto,
  UploadManyPartialResponseDto,
} from "./dto/upload-file.dto";

/**
 * 카테고리별 허용 MIME 및 크기 제한
 */
const CATEGORY_RULES: Record<
  UploadCategory,
  {
    mimes: ReadonlyArray<string>;
    maxSize: number;
    extHints: ReadonlyArray<string>;
  }
> = {
  // 2026-05-23: 사용자 정책 — VIDEO 50MB / 그 외 10MB (Web UPLOAD_LIMITS · Admin upload.service 와 동기화).
  //   다중 업로드 시에도 각 개별 파일이 카테고리별 maxSize 를 초과할 수 없음.
  IMAGE: {
    mimes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    maxSize: 10 * 1024 * 1024, // 10MB
    extHints: [".jpg", ".jpeg", ".png", ".gif", ".webp"],
  },
  AVATAR: {
    mimes: ["image/jpeg", "image/png", "image/webp"],
    maxSize: 10 * 1024 * 1024, // 10MB
    extHints: [".jpg", ".jpeg", ".png", ".webp"],
  },
  DOCUMENT: {
    mimes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "text/csv",
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    extHints: [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".csv",
    ],
  },
  VIDEO: {
    // 2026-05-23: R2 제거 + multipart 단일 채널 전환에 따라 영상은 50MB 한도.
    //   모바일 카메라 영상은 클라이언트 측 사전 압축(video_compress 등) 강제 권장.
    mimes: ["video/mp4", "video/webm", "video/quicktime"],
    maxSize: 50 * 1024 * 1024, // 50MB
    extHints: [".mp4", ".webm", ".mov"],
  },
  ATTACHMENT: {
    mimes: [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/zip",
      "application/x-zip-compressed",
      "text/plain",
      "text/csv",
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    extHints: [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".pdf",
      ".zip",
      ".txt",
      ".csv",
    ],
  },
};

const MAX_MULTI_FILES = 10;
// 2026-05-23: 다중 업로드 합계 — 각 파일 10MB × 10개 = 100MB. 개별 파일 한도(카테고리별) 가 항상 우선 검증됨.
const MAX_MULTI_TOTAL_SIZE = 100 * 1024 * 1024; // 100MB 합계

/**
 * 위험 확장자 블랙리스트 (전역, 카테고리 무관) — Web/Admin `DANGEROUS_EXTENSIONS` 와 동기화.
 *
 * 보안 정책:
 *   - CATEGORY_RULES.extHints 화이트리스트만으로 1차 차단되지만, 명시적 블랙리스트로
 *     이중 안전망 + 카테고리 확장 시 우발적 허용 방지.
 *   - 클라이언트(Web/Admin)에서 동일 리스트로 1차 검증, 서버에서 최종 강제 차단.
 *   - 점(.)은 포함하지 않음, 모두 소문자.
 */
const DANGEROUS_EXTENSIONS: readonly string[] = [
  // 실행 파일
  // [수정 2026-05-23 BE-039] "app" 제거 — 다의적 영어 단어(App/MyApp/HockeyApp 등)로
  //   토큰 검사 시 false positive 매우 높음. .app 마지막 확장자 자체는 카테고리별
  //   화이트리스트(rule.extHints)가 이미 차단하므로 블랙리스트 제거해도 안전.
  "exe",
  "bat",
  "cmd",
  "com",
  "msi",
  "dmg",
  "apk",
  "ipa",
  "deb",
  "rpm",
  // 셸 스크립트
  "sh",
  "bash",
  "zsh",
  "ksh",
  "fish",
  "ps1",
  "psm1",
  "psd1",
  "vbs",
  "vbe",
  "wsf",
  "wsh",
  // JS 변형 (XSS 위험)
  "js",
  "mjs",
  "cjs",
  "jse",
  "jsx",
  "ts",
  "tsx",
  // 서버사이드 코드
  "php",
  "php3",
  "php4",
  "php5",
  "phtml",
  "jsp",
  "jspx",
  "asp",
  "aspx",
  "cer",
  "cgi",
  "pl",
  "py",
  "rb",
  // 마크업/XSS
  "html",
  "htm",
  "xhtml",
  "mhtml",
  "mht",
  "shtml",
  "hta",
  "svg",
  "xml",
  // 매크로 가능 오피스 (저장된 매크로 포함)
  "docm",
  "xlsm",
  "pptm",
  "dotm",
  "xltm",
  "potm",
  // 압축 실행 (jar/war/ear 는 Java 실행 가능)
  "jar",
  "war",
  "ear",
  // 기타
  "iso",
  "reg",
  "lnk",
  "scr",
  "pif",
  "gadget",
  "inf",
];

/**
 * 파일 시그니처 (Magic Bytes) — 확장자 위장 방지
 * 첫 바이트 패턴으로 실제 파일 유형 검증
 */
const MAGIC_BYTES: ReadonlyArray<{
  mime: string;
  bytes: ReadonlyArray<number | null>; // null = wildcard
  offset?: number;
}> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  {
    mime: "image/png",
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  {
    mime: "image/webp",
    bytes: [
      0x52,
      0x49,
      0x46,
      0x46,
      null,
      null,
      null,
      null,
      0x57,
      0x45,
      0x42,
      0x50,
    ],
  },
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "video/mp4", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  {
    mime: "video/quicktime",
    bytes: [0x66, 0x74, 0x79, 0x70, 0x71, 0x74],
    offset: 4,
  },
  { mime: "video/webm", bytes: [0x1a, 0x45, 0xdf, 0xa3] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] }, // ZIP · docx · xlsx · pptx
];

/**
 * 위험 파일 시그니처 DENY 리스트 (BE-040 · 2026-05-23) — 실제 파일 내용 기반 차단.
 *
 * 정책 (사용자 직접 지시 2026-05-23):
 *   "이름·확장자 신뢰 못함 → 파일 type 분석해서 설정값과 일치하면 막는다."
 *
 * extHints 화이트리스트 / MIME 화이트리스트가 1차 방어를 하지만, 본 DENY 리스트는
 * **magic bytes 기반 최종 방어선** — 이름 우회(.app.png, .exe.jpg) + MIME 위장
 * (application/octet-stream → image/png 강제) 둘 다 봉인.
 *
 * 검출 대상 — 실행 가능 형식만 (정상 이미지/문서/영상은 1차 화이트리스트 통과):
 *  · Mach-O (macOS .app 번들 내부 실행파일, iOS .ipa)
 *  · PE (Windows .exe, .dll, .scr)
 *  · ELF (Linux/Android shared library, .so, .deb 내부)
 *  · Android DEX (.dex)
 *  · Java class file (0xCAFEBABE — Mach-O Universal 과 충돌하지만 둘 다 차단 대상)
 */
const DANGEROUS_SIGNATURES: ReadonlyArray<{
  name: string;
  bytes: ReadonlyArray<number | null>;
  offset?: number;
}> = [
  // Mach-O 32-bit LE — iOS/macOS x86 실행파일
  { name: "Mach-O 32-bit", bytes: [0xfe, 0xed, 0xfa, 0xce] },
  // Mach-O 64-bit LE — macOS x86_64, ARM64
  { name: "Mach-O 64-bit", bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  // Mach-O 32-bit BE — PowerPC
  { name: "Mach-O 32-bit BE", bytes: [0xce, 0xfa, 0xed, 0xfe] },
  // Mach-O 64-bit BE
  { name: "Mach-O 64-bit BE", bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  // Mach-O Universal Binary (Fat, multi-arch) / Java class file — 동일 시그니처
  { name: "Mach-O Universal / Java class", bytes: [0xca, 0xfe, 0xba, 0xbe] },
  // Mach-O Universal Binary 64-bit
  { name: "Mach-O Universal 64", bytes: [0xca, 0xfe, 0xba, 0xbf] },
  // PE (Windows EXE/DLL/SCR) — "MZ" header
  { name: "PE Executable", bytes: [0x4d, 0x5a] },
  // ELF (Linux/Android executable, .so) — "\x7fELF"
  { name: "ELF Executable", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  // Android DEX (Dalvik Executable) — "dex\n"
  { name: "Android DEX", bytes: [0x64, 0x65, 0x78, 0x0a] },
];

/**
 * 업로드 디렉토리 베이스 — 단일 진입점 `common/upload-paths.ts` 위임.
 * main.ts ServeStatic 및 videos.module.ts multer destination 과 동일 경로.
 *
 * DB 의 path → 디스크 절대 경로 변환은 항상 `resolveUploadAbsolutePath()` 헬퍼 통과.
 *   - path traversal 방지 통합
 *   - UPLOAD_ROOT 하위 보장
 */
import {
  getUploadRoot,
  resolveUploadAbsolutePath,
} from "@/common/upload-paths";

// 호환성을 위해 const 로 노출 — 함수 호출 시점에 cached root 사용.
const UPLOAD_DIR_BASE = getUploadRoot();

/**
 * sharp 처리 결과 — Phase 2.1 SPEC §3
 */
interface ProcessedImage {
  width?: number;
  height?: number;
  thumbUrl?: string;
  thumbAbsolutePath?: string;
  exifJson?: Record<string, unknown>;
}

/**
 * persist() 결과 + sharp 처리 결과 (롤백 시 양쪽 파일 정리)
 */
interface SavedFile {
  storedName: string;
  extension: string | null;
  relativePath: string;
  url: string;
  sha256: string;
  absolutePath: string;
  // sharp 처리 결과 (IMAGE/AVATAR 만 채워짐)
  processed: ProcessedImage;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    // [추가 2026-05-23] 권한 SoT 통일 — team_logo refType 권한 체크를
    //   TeamsService.assertTeamManagerPermission 단일 함수에 위임하여
    //   resolveCallerApprovalStatus(프론트 isTeamManagerOf 합성) 와 정합 자동 보장.
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * 단일 파일 업로드
   *
   * - persist 후 sharp 로 이미지 메타데이터/썸네일/EXIF 추출 (best-effort)
   * - DB insert 후 NotificationsGateway 로 file:created emit (refType+refId 있을 때만)
   */
  async uploadOne(
    file: Express.Multer.File,
    dto: UploadFileDto,
    uploaderId: string,
    uploaderType?: string,
  ): Promise<FileResponseDto> {
    this.assertFile(file, dto.category);
    this.assertNotDangerousSignature(file.buffer);
    this.assertMagicBytes(file.buffer, file.mimetype);
    await this.validateUploadPermission(
      dto.refType,
      dto.refId,
      uploaderId,
      uploaderType,
    );

    const uploader = await this.getUploaderNameSafe(uploaderId);
    const saved = await this.persist(file, dto.category, uploader);

    let record;
    try {
      record = await this.prisma.uploadedFile.create({
        data: {
          category: dto.category,
          originalName: this.sanitizeOriginalName(file.originalname),
          storedName: saved.storedName,
          extension: saved.extension,
          mimeType: file.mimetype,
          size: file.size,
          path: saved.relativePath,
          url: saved.url,
          sha256: saved.sha256,
          width: saved.processed.width ?? null,
          height: saved.processed.height ?? null,
          thumbUrl: saved.processed.thumbUrl ?? null,
          exifJson:
            (saved.processed.exifJson as Prisma.InputJsonValue) ??
            Prisma.JsonNull,
          uploaderId,
          modifiedById: uploaderId, // 생성 직후 최초 수정자는 업로더 본인
          refType: dto.refType ?? null,
          refId: dto.refId ?? null,
        },
      });
    } catch (err) {
      // DB insert 실패 → 디스크 파일도 정리 (원본 + 썸네일)
      await this.cleanupSavedFiles([saved]);
      throw err;
    }

    const response = this.toResponse(record);

    // file:created 이벤트 emit (refType + refId 있을 때만, best-effort)
    await this.notificationsGateway
      .broadcastFileEvent({
        type: "file:created",
        refType: dto.refType,
        refId: dto.refId,
        files: [response],
        uploaderId,
      })
      .catch((err) =>
        this.logger.error(`file:created emit 실패 (uploadOne): ${err}`),
      );

    return response;
  }

  /**
   * 다중 파일 업로드
   *
   * - dto.allowPartial=false (기본): $transaction 으로 원자성 보장, 하나라도 실패 시 전체 롤백 + 디스크 정리
   * - dto.allowPartial=true: 개별 try-catch 로 분리, 성공한 것만 commit + 실패 리포트 반환
   *
   * 모든 성공한 파일에 대해 file:created emit (단일 묶음 이벤트).
   */
  async uploadMany(
    files: Express.Multer.File[],
    dto: UploadFileDto,
    uploaderId: string,
    uploaderType?: string,
  ): Promise<FileResponseDto[] | UploadManyPartialResponseDto> {
    if (!files || files.length === 0) {
      throw new BadRequestException("업로드할 파일이 없습니다.");
    }
    await this.validateUploadPermission(
      dto.refType,
      dto.refId,
      uploaderId,
      uploaderType,
    );
    if (files.length > MAX_MULTI_FILES) {
      throw new BadRequestException(
        `다중 업로드는 최대 ${MAX_MULTI_FILES}개까지 허용됩니다.`,
      );
    }

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > MAX_MULTI_TOTAL_SIZE) {
      throw new PayloadTooLargeException(
        `다중 업로드 총 크기 제한(${Math.floor(MAX_MULTI_TOTAL_SIZE / 1024 / 1024)}MB)을 초과했습니다.`,
      );
    }

    if (dto.allowPartial) {
      return this.uploadManyPartial(files, dto, uploaderId);
    }

    // 사전 검증 (디스크 쓰기 전) — 전체 롤백 모드는 한 건이라도 검증 실패 시 즉시 거부
    files.forEach((f) => {
      this.assertFile(f, dto.category);
      this.assertNotDangerousSignature(f.buffer);
      this.assertMagicBytes(f.buffer, f.mimetype);
    });

    const uploader = await this.getUploaderNameSafe(uploaderId);

    const savedList: SavedFile[] = [];
    try {
      for (const f of files) {
        const saved = await this.persist(f, dto.category, uploader);
        savedList.push(saved);
      }

      const records = await this.prisma.$transaction(
        files.map((f, i) => {
          const saved = savedList[i];
          return this.prisma.uploadedFile.create({
            data: {
              category: dto.category,
              originalName: this.sanitizeOriginalName(f.originalname),
              storedName: saved.storedName,
              extension: saved.extension,
              mimeType: f.mimetype,
              size: f.size,
              path: saved.relativePath,
              url: saved.url,
              sha256: saved.sha256,
              width: saved.processed.width ?? null,
              height: saved.processed.height ?? null,
              thumbUrl: saved.processed.thumbUrl ?? null,
              exifJson:
                (saved.processed.exifJson as Prisma.InputJsonValue) ??
                Prisma.JsonNull,
              uploaderId,
              modifiedById: uploaderId,
              refType: dto.refType ?? null,
              refId: dto.refId ?? null,
            },
          });
        }),
      );

      const responses = records.map((r) => this.toResponse(r));

      // file:created 이벤트 emit (성공한 전체 묶음)
      await this.notificationsGateway
        .broadcastFileEvent({
          type: "file:created",
          refType: dto.refType,
          refId: dto.refId,
          files: responses,
          uploaderId,
        })
        .catch((err) =>
          this.logger.error(`file:created emit 실패 (uploadMany): ${err}`),
        );

      return responses;
    } catch (error) {
      // 롤백: 쓰여진 디스크 파일 + 썸네일 제거
      await this.cleanupSavedFiles(savedList);
      throw error;
    }
  }

  /**
   * 다중 업로드 부분 실패 모드 — Phase 2.3 SPEC §4.2
   *
   * 개별 try-catch 로 분리. 성공한 파일은 즉시 commit, 실패는 리포트.
   * 모든 성공한 파일에 대해 단일 묶음 file:created emit.
   */
  private async uploadManyPartial(
    files: Express.Multer.File[],
    dto: UploadFileDto,
    uploaderId: string,
  ): Promise<UploadManyPartialResponseDto> {
    const succeeded: FileResponseDto[] = [];
    const failed: Array<{
      index: number;
      originalName: string;
      message: string;
    }> = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        // 개별 업로드 — uploadOne 은 emit 도 하지만, 부분 모드에서는 묶음 emit 을 원하므로
        // 핵심 로직만 인라인 처리 (개별 emit 회피).
        this.assertFile(f, dto.category);
        this.assertNotDangerousSignature(f.buffer);
        this.assertMagicBytes(f.buffer, f.mimetype);

        const uploader = await this.getUploaderNameSafe(uploaderId);
        const saved = await this.persist(f, dto.category, uploader);

        let record;
        try {
          record = await this.prisma.uploadedFile.create({
            data: {
              category: dto.category,
              originalName: this.sanitizeOriginalName(f.originalname),
              storedName: saved.storedName,
              extension: saved.extension,
              mimeType: f.mimetype,
              size: f.size,
              path: saved.relativePath,
              url: saved.url,
              sha256: saved.sha256,
              width: saved.processed.width ?? null,
              height: saved.processed.height ?? null,
              thumbUrl: saved.processed.thumbUrl ?? null,
              exifJson:
                (saved.processed.exifJson as Prisma.InputJsonValue) ??
                Prisma.JsonNull,
              uploaderId,
              modifiedById: uploaderId,
              refType: dto.refType ?? null,
              refId: dto.refId ?? null,
            },
          });
        } catch (dbErr) {
          // DB insert 실패 → 해당 파일 디스크 정리 후 실패 기록
          await this.cleanupSavedFiles([saved]);
          throw dbErr;
        }

        succeeded.push(this.toResponse(record));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failed.push({
          index: i,
          originalName: f?.originalname ?? `file_${i}`,
          message,
        });
      }
    }

    // 성공한 묶음을 한 번만 emit
    if (succeeded.length > 0) {
      await this.notificationsGateway
        .broadcastFileEvent({
          type: "file:created",
          refType: dto.refType,
          refId: dto.refId,
          files: succeeded,
          uploaderId,
        })
        .catch((err) =>
          this.logger.error(
            `file:created emit 실패 (uploadManyPartial): ${err}`,
          ),
        );
    }

    return { succeeded, failed };
  }

  /**
   * 파일 조회
   */
  async findById(id: string): Promise<FileResponseDto> {
    const record = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException("파일을 찾을 수 없습니다.");
    }
    return this.toResponse(record);
  }

  /**
   * 파일 삭제 — 업로더 본인 또는 ADMIN만 가능
   *
   * - DB 트랜잭션으로 메타데이터 삭제
   * - 디스크 원본 + 썸네일 파일 정리
   * - file:deleted 이벤트 emit (refType + refId 있을 때만)
   */
  async remove(
    id: string,
    requesterId: string,
    requesterRole: string,
  ): Promise<{ deleted: true }> {
    const record = await this.prisma.uploadedFile.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException("파일을 찾을 수 없습니다.");
    }
    if (record.uploaderId !== requesterId && requesterRole !== "ADMIN") {
      throw new ForbiddenException(
        "본인이 업로드한 파일만 삭제할 수 있습니다.",
      );
    }

    // 응답 스냅샷 (emit 페이로드용)
    const snapshot = this.toResponse(record);

    await this.prisma.$transaction(async (tx) => {
      await tx.uploadedFile.delete({ where: { id } });
    });

    // 디스크 삭제는 트랜잭션 외부 (실패해도 DB는 이미 정리됨)
    //   resolveUploadAbsolutePath 가 path traversal 방지 + UPLOAD_ROOT 하위 보장.
    const absolutePath = resolveUploadAbsolutePath(record.path);
    if (absolutePath) {
      await fsp.unlink(absolutePath).catch((err) => {
        this.logger.warn(
          `디스크 원본 삭제 실패: ${absolutePath} - ${err.message}`,
        );
      });
    } else {
      this.logger.warn(
        `안전하지 않은 path — 디스크 삭제 스킵: ${record.path}`,
      );
    }

    // 썸네일 정리 (있을 때만)
    if (record.thumbUrl) {
      const thumbAbsolute = resolveUploadAbsolutePath(record.thumbUrl);
      if (thumbAbsolute) {
        await fsp.unlink(thumbAbsolute).catch((err) => {
          this.logger.warn(
            `디스크 썸네일 삭제 실패: ${thumbAbsolute} - ${err.message}`,
          );
        });
      }
    }

    // file:deleted 이벤트 emit
    await this.notificationsGateway
      .broadcastFileEvent({
        type: "file:deleted",
        refType: record.refType,
        refId: record.refId,
        files: [snapshot],
        uploaderId: requesterId,
      })
      .catch((err) =>
        this.logger.error(`file:deleted emit 실패 (remove): ${err}`),
      );

    return { deleted: true };
  }

  // ==================== 내부 헬퍼 ====================

  /**
   * refType + refId 기반 도메인 권한 검증.
   *
   * - `team_logo` — 팀 감독/코치/ADMIN/ACADEMY_DIRECTOR 만 허용
   * - `player_profile` — 본인 자신 OR 부모(자녀) OR 코치(수업/팀 소속) OR 감독(팀 소속) OR ADMIN
   * - 그 외 refType (notice/banner/chat/shop/gallery 등) — 별도 검증 없이 통과
   *
   * refType/refId 미지정 시 검증 스킵.
   * ADMIN userType 은 무조건 통과.
   */
  private async validateUploadPermission(
    refType: string | null | undefined,
    refId: string | null | undefined,
    userId: string,
    userType: string | undefined,
  ): Promise<void> {
    if (!refType || !refId) return;
    if (userType === "ADMIN") return;

    switch (refType) {
      case "team_logo": {
        // [재수정 2026-05-23] 권한 SoT 단일화 — TeamsService.assertTeamManagerPermission 위임.
        //   배경: 이전 수정(인라인 3경로 OR)이 기능적으로 정확했으나 SoT 가 분기됨.
        //         resolveCallerApprovalStatus(프론트 isTeamManagerOf 합성) 와 동일 함수를
        //         사용해야 정책 변경 시 자동 정합 (예: ACADEMY_DIRECTOR 경로 추가 등).
        //   동작:
        //     1) team.coachId === userId       (owner)
        //     2) TeamMember(매니저 + approved) (다대다)
        //     3) 둘 다 없음 → ForbiddenException
        //   ADMIN 은 함수 진입 직후 이미 통과 (위 if 분기).
        // 팀 존재 확인 (assertTeamManagerPermission 은 not-found 가 아닌 forbidden 만 던지므로
        //   404 시그널 보존을 위해 사전 조회 1회 유지).
        const team = await this.prisma.team.findUnique({
          where: { id: refId },
          select: { id: true },
        });
        if (!team) {
          throw new NotFoundException("팀을 찾을 수 없습니다.");
        }
        await this.teamsService.assertTeamManagerPermission(
          userId,
          refId,
          "이 팀의 로고를 업로드할 권한이 없습니다.",
        );
        break;
      }

      case "user_avatar": {
        // 본인 프로필 사진은 항상 허용 (PARENT/COACH/CHILD/TEEN/DIRECTOR 본인 변경)
        if (userId === refId) return;

        // 부모가 본인 자녀 프로필 사진 변경 (CHILD 는 직접 로그인 불가하거나 어린 경우)
        if (userType === "PARENT") {
          const parentChild = await this.prisma.parentChild.findFirst({
            where: { parentId: userId, childId: refId },
            select: { id: true },
          });
          if (!parentChild) {
            throw new ForbiddenException(
              "본인 자녀의 프로필 사진만 변경할 수 있습니다.",
            );
          }
          return;
        }

        // 타인 아바타 변경은 ADMIN 만 허용 (위에서 ADMIN 통과)
        throw new ForbiddenException(
          "본인 프로필 사진만 변경할 수 있습니다.",
        );
      }

      case "player_profile": {
        // 본인 프로필은 항상 허용
        if (userId === refId) return;

        if (userType === "PARENT") {
          const parentChild = await this.prisma.parentChild.findFirst({
            where: { parentId: userId, childId: refId },
            select: { id: true },
          });
          if (!parentChild) {
            throw new ForbiddenException(
              "본인 자녀의 사진/영상만 업로드할 수 있습니다.",
            );
          }
          return;
        }

        if (userType === "COACH") {
          // 본인이 코치인 팀 소속 멤버 OR 본인이 코치인 수업 등록자
          const isInCoachTeam = await this.prisma.teamMember.findFirst({
            where: {
              userId: refId,
              team: { coachId: userId },
            },
            select: { id: true },
          });
          if (isInCoachTeam) return;

          const isInCoachClass = await this.prisma.enrollment.findFirst({
            where: {
              childId: refId,
              class: { coachId: userId },
            },
            select: { id: true },
          });
          if (isInCoachClass) return;

          throw new ForbiddenException(
            "본인 수업·팀 소속 선수의 사진/영상만 업로드할 수 있습니다.",
          );
        }

        if (userType === "DIRECTOR" || userType === "ACADEMY_DIRECTOR") {
          // 감독/아카데미감독은 role 기반으로 통과 (구체적 팀 소속 검증은 도메인 레이어에서 별도 처리).
          // 향후 academy ↔ team ↔ member 관계가 schema 에 명시되면 그 시점에 엄격 검증으로 강화.
          return;
        }

        // TEEN / CHILD 본인 외 무권한
        throw new ForbiddenException(
          "선수 사진/영상 업로드 권한이 없습니다.",
        );
      }

      default:
        // 기타 refType (notice / banner / chat_message / shop_product / gallery 등)
        // 도메인별 권한은 해당 도메인 컨트롤러에서 별도 검증.
        break;
    }
  }

  private assertFile(
    file: Express.Multer.File,
    category: UploadCategory,
  ): void {
    if (!file) {
      throw new BadRequestException("업로드할 파일이 없습니다.");
    }
    const rule = CATEGORY_RULES[category];
    if (!rule) {
      throw new BadRequestException("알 수 없는 업로드 카테고리입니다.");
    }

    // 1) 사이즈 검증 (5MB 통일)
    if (file.size > rule.maxSize) {
      throw new PayloadTooLargeException(
        `파일 크기가 제한(${Math.floor(rule.maxSize / 1024 / 1024)}MB)을 초과했습니다.`,
      );
    }

    // 2) 보안 — 확장자 추출 + 이중 확장자(`shell.php.txt` 같은 위장) 차단
    //    extname() 은 마지막 점 이후만 반환하므로 파일명 전체에서 위험 확장자 포함 여부도 검사.
    const ext = extname(file.originalname).toLowerCase().replace(/^\./, "");
    if (!ext) {
      throw new BadRequestException("파일 확장자가 없습니다.");
    }

    // 3) 보안 — 위험 확장자 블랙리스트 (전역, 카테고리 무관)
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `보안상 ".${ext}" 확장자는 업로드할 수 없습니다.`,
      );
    }

    // 4) 보안 — 이중 확장자 위장 차단 (e.g., `malware.php.jpg` · `shell.exe.png`)
    // [수정 2026-05-23 BE-039] 기존: 전체 토큰 분리 후 dangerous 매칭 → false positive 많음
    //   (예: `team.app.png`, `MyApp_logo.jpg` 등 정상 파일까지 차단).
    //   변경: 점(.)으로 split 후 마지막 확장자(ext) **직전 토큰**만 dangerous 검사.
    //   이중 확장자 위장 패턴(`shell.php.jpg`)은 그대로 차단되며, 파일명 내부 일반
    //   단어(`team.app.png` 의 app, `myproject.bat.png` 의 bat 등)는 통과한다.
    //   더 깊은 chain(`shell.php.exe.jpg`)도 line 810 의 ext 검사 또는 본 검사 중
    //   하나에서 차단되므로 안전 보장.
    const parts = file.originalname.toLowerCase().split(".");
    if (parts.length >= 3) {
      // [a, b, ext] — 마지막 확장자 직전 토큰만 검사
      const beforeExt = parts[parts.length - 2];
      if (DANGEROUS_EXTENSIONS.includes(beforeExt)) {
        throw new BadRequestException(
          `보안상 이중 확장자 위장(.${beforeExt}.${ext}) 은 허용되지 않습니다.`,
        );
      }
    }

    // 5) MIME 화이트리스트
    if (!rule.mimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `허용되지 않는 파일 유형입니다. (${file.mimetype})`,
      );
    }

    // 6) 카테고리별 확장자 화이트리스트
    if (!rule.extHints.includes(`.${ext}`)) {
      throw new BadRequestException(`허용되지 않는 확장자입니다. (.${ext})`);
    }
  }

  /**
   * 위험 파일 시그니처 DENY 검사 (BE-040 · 2026-05-23) — 실제 파일 내용 기반 차단.
   *
   * 정책: buffer 첫 N바이트가 `DANGEROUS_SIGNATURES` 와 일치하면 무조건 차단.
   *  · 이름 우회 봉인: `team.app.png` 라도 실제 내용이 Mach-O 면 차단
   *  · MIME 위장 봉인: declaredMime=image/png 라도 실제 PE 면 차단
   *  · extHints / MIME 화이트리스트가 1차 방어, 본 검사가 최종 방어선
   *
   * 호출 시점: `assertFile` 통과 직후, 디스크 쓰기 전.
   */
  private assertNotDangerousSignature(buffer: Buffer): void {
    for (const sig of DANGEROUS_SIGNATURES) {
      const offset = sig.offset ?? 0;
      if (buffer.length < offset + sig.bytes.length) continue;
      const matched = sig.bytes.every((expected, i) => {
        if (expected === null) return true;
        return buffer[offset + i] === expected;
      });
      if (matched) {
        throw new BadRequestException(
          `보안상 ${sig.name} 형식 파일은 업로드할 수 없습니다.`,
        );
      }
    }
  }

  /**
   * Magic Bytes 검증 — 확장자/MIME 위장 방지
   * 선언된 MIME이 MAGIC_BYTES 목록에 있다면 반드시 일치해야 함
   */
  private assertMagicBytes(buffer: Buffer, declaredMime: string): void {
    const candidates = MAGIC_BYTES.filter((m) => m.mime === declaredMime);
    if (candidates.length === 0) {
      // 매직 바이트 정의가 없는 MIME은 건너뜀 (text/plain 등)
      return;
    }
    const matched = candidates.some((candidate) => {
      const offset = candidate.offset ?? 0;
      if (buffer.length < offset + candidate.bytes.length) return false;
      return candidate.bytes.every((expected, i) => {
        if (expected === null) return true;
        return buffer[offset + i] === expected;
      });
    });
    if (!matched) {
      throw new BadRequestException(
        "파일 시그니처 검증에 실패했습니다. 파일이 손상되었거나 위조되었을 수 있습니다.",
      );
    }
  }

  /**
   * 원본 파일명 정화 (path traversal · NULL · 제어문자 제거)
   */
  private sanitizeOriginalName(name: string): string {
    const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
    const cleaned = base
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x1f<>:"|?*]/g, "")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 200);
    return cleaned.length > 0 ? cleaned : "file";
  }

  /**
   * 파일 디스크 저장 + sharp 후처리
   *
   * 경로 규칙: `uploads/{category소문자}/{YYYY}/{MM}/{DD}/`
   * 파일명 규칙: `{사용자명}_{YYYYMMDDHHmm}_{hash4}.{ext}`
   *   - 사용자명: 한글/영문/숫자/언더스코어만 허용, 최대 20자
   *   - 시각: Asia/Seoul 기준 YYYYMMDDHHmm (분 단위)
   *   - hash4: 동일 분 내 다중 업로드 충돌 방지용 random 4글자
   *
   * IMAGE/AVATAR 인 경우 sharp 로 메타데이터·썸네일·EXIF 추출 (best-effort, 실패해도 업로드 성공).
   */
  private async persist(
    file: Express.Multer.File,
    category: UploadCategory,
    uploaderName: string,
  ): Promise<SavedFile> {
    const now = this.getKstNow();
    const year = now.getFullYear().toString();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hour = String(now.getHours()).padStart(2, "0");
    const minute = String(now.getMinutes()).padStart(2, "0");
    const categoryDir = category.toLowerCase();

    const subDir = join(categoryDir, year, month, day);
    const absoluteDir = join(UPLOAD_DIR_BASE, subDir);
    await fsp.mkdir(absoluteDir, { recursive: true });

    const rawExt = extname(file.originalname).toLowerCase();
    const safeExt = rawExt.replace(/[^.a-z0-9]/g, "").slice(0, 10); // 예: ".jpg"
    const extensionValue = safeExt.startsWith(".") ? safeExt.slice(1) : safeExt;

    const safeName = this.sanitizeUsernameForPath(uploaderName);
    const yyyymmddhhmm = `${year}${month}${day}${hour}${minute}`;
    const hash4 = randomBytes(2).toString("hex"); // 4글자
    const storedName = `${safeName}_${yyyymmddhhmm}_${hash4}${safeExt}`;

    const absolutePath = join(absoluteDir, storedName);
    await fsp.writeFile(absolutePath, file.buffer, { flag: "wx" });

    const sha256 = createHash("sha256").update(file.buffer).digest("hex");

    const relativePath = `/${subDir.replace(/\\/g, "/")}/${storedName}`;
    const url = `/uploads${relativePath}`;

    // sharp 후처리 (IMAGE/AVATAR 만, best-effort)
    const processed = await this.processImage(
      file.buffer,
      category,
      absoluteDir,
      subDir,
      storedName,
    );

    return {
      storedName,
      extension: extensionValue || null,
      relativePath,
      url,
      sha256,
      absolutePath,
      processed,
    };
  }

  /**
   * sharp 후처리 — Phase 2.1 SPEC §3
   *
   * IMAGE/AVATAR 카테고리만 처리:
   *   - 메타데이터 추출 (width/height)
   *   - 썸네일 생성 (.thumb.webp · IMAGE=400px / AVATAR=200px · cover · quality 80)
   *   - EXIF 추출 (IMAGE 만 · 파싱 실패 시 raw key skip)
   *
   * 정책: best-effort — sharp 실패해도 업로드는 성공 (로그만 남김).
   * 보안: 원본 buffer 만 입력, 디스크 경로는 storedName.replace() 로 안전하게 파생.
   */
  private async processImage(
    buffer: Buffer,
    category: UploadCategory,
    absoluteDir: string,
    relativeSubDir: string,
    storedName: string,
  ): Promise<ProcessedImage> {
    if (category !== "IMAGE" && category !== "AVATAR") {
      return {};
    }

    try {
      const sharpInstance = sharp(buffer);
      const meta = await sharpInstance.metadata();

      // 썸네일 생성
      const thumbSize = category === "AVATAR" ? 200 : 400;
      const thumbStoredName = storedName.replace(/\.[^.]+$/, ".thumb.webp");
      const thumbAbsolutePath = join(absoluteDir, thumbStoredName);

      await sharp(buffer)
        .resize(thumbSize, thumbSize, { fit: "cover", position: "center" })
        .webp({ quality: 80 })
        .toFile(thumbAbsolutePath);

      // URL: /uploads/{subDir}/{thumbName}
      const thumbRelativePath = `/${relativeSubDir.replace(/\\/g, "/")}/${thumbStoredName}`;
      const thumbUrl = `/uploads${thumbRelativePath}`;

      // EXIF 추출 (IMAGE 만, best-effort)
      let exifJson: Record<string, unknown> | undefined;
      if (category === "IMAGE" && meta.exif) {
        exifJson = this.parseExifBuffer(meta.exif);
      }

      return {
        width: meta.width,
        height: meta.height,
        thumbUrl,
        thumbAbsolutePath,
        exifJson,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `sharp 처리 실패 (best-effort, ${category}): ${message}`,
      );
      return {};
    }
  }

  /**
   * EXIF buffer → JSON 객체 (best-effort, 실패 시 undefined).
   *
   * sharp 가 반환하는 raw EXIF Buffer 는 TIFF 형식. 완전 파싱은 외부 라이브러리(exifr 등) 필요.
   * 본 구현은 기본 안전망: TIFF 헤더 + size + buffer hex preview 정도만 노출 (디버깅용).
   * 클라이언트는 exifJson 존재 여부로 "EXIF 있음" 만 인지하면 충분 (DB 의 thumbUrl/width/height 가 핵심 메타).
   */
  private parseExifBuffer(
    exifBuffer: Buffer,
  ): Record<string, unknown> | undefined {
    try {
      if (!Buffer.isBuffer(exifBuffer) || exifBuffer.length === 0) {
        return undefined;
      }
      const header = exifBuffer.slice(0, 6).toString("ascii");
      const isTiff =
        exifBuffer.length >= 4 &&
        ((exifBuffer[0] === 0x49 && exifBuffer[1] === 0x49) || // II (little endian)
          (exifBuffer[0] === 0x4d && exifBuffer[1] === 0x4d)); // MM (big endian)

      return {
        present: true,
        size: exifBuffer.length,
        format: isTiff ? "TIFF" : "unknown",
        headerHex: header.replace(/[^\x20-\x7e]/g, "?"),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * 저장된 파일 정리 — 원본 + 썸네일 모두 제거.
   * 롤백 또는 DB insert 실패 시 호출.
   */
  private async cleanupSavedFiles(savedList: SavedFile[]): Promise<void> {
    const targets: string[] = [];
    for (const s of savedList) {
      if (s.absolutePath) targets.push(s.absolutePath);
      if (s.processed?.thumbAbsolutePath) {
        targets.push(s.processed.thumbAbsolutePath);
      }
    }
    await Promise.allSettled(
      targets.map((path) => fsp.unlink(path).catch(() => undefined)),
    );
  }

  /**
   * 현재 시각 (Asia/Seoul 기준 로컬 Date).
   * 서버 타임존이 UTC인 경우에도 KST로 환산해 YYYYMMDDHHmm을 생성.
   */
  private getKstNow(): Date {
    const utc = new Date();
    // KST 오프셋 +9시간
    return new Date(utc.getTime() + 9 * 60 * 60 * 1000);
  }

  /**
   * 업로더 식별자 조회 — 가입 시 사용한 email 의 local part (`@` 이전 부분).
   *
   * [수정 2026-05-23 BE-042] 사용자 정책 — 한글 이름(firstName+lastName) 대신 가입 시 생성된
   *  ASCII 식별자(email local part) 사용. 이유:
   *    · 파일 시스템·URL 인코딩 이슈 회피 (`%xx` 인코딩 깨짐 / 다국어 path 호환성)
   *    · 개인정보(한국 이름) 노출 차단
   *    · CLAUDE.md 테스트 계정 컨벤션과 일치 (`kang_coach@…` → "kang_coach")
   *
   * Fallback: email 없거나 sanitize 후 빈 결과 → userId 앞 8자리 hash.
   * 마지막 fallback: "user" (uploaderId 조회 자체 실패 시 — 방어적 처리).
   */
  private async getUploaderNameSafe(uploaderId: string): Promise<string> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: uploaderId },
        select: { email: true },
      });
      if (!user) return uploaderId.slice(0, 8) || "user";
      const localPart = (user.email ?? "").split("@")[0] ?? "";
      // sanitize 는 호출처(persist)가 sanitizeUsernameForPath 로 한 번 더 수행.
      return localPart || uploaderId.slice(0, 8) || "user";
    } catch {
      return "user";
    }
  }

  /**
   * 사용자명 → 파일시스템 안전 문자열 (ASCII-only).
   *
   * [수정 2026-05-23 BE-042] 한글 보존(`가-힣`) → 한글 제거로 변경.
   *  이유: 파일명/URL 에 한글 들어가면 인코딩(`%xx`)·다운로드 깨짐·다국어 path 호환성 이슈.
   *
   * - 영문/숫자/언더스코어/하이픈/점만 유지
   * - 공백·특수문자·한글·이모지 모두 제거
   * - 빈 결과면 "user"로 대체
   * - 최대 30자 (email local part 표준 길이 수용)
   */
  private sanitizeUsernameForPath(name: string): string {
    const cleaned = (name ?? "")
      .replace(/\s+/g, "")
      // ASCII 영문/숫자/언더스코어/하이픈/점만 허용 — 한글·이모지·특수문자 제거.
      .replace(/[^a-zA-Z0-9_\-.]/g, "");
    const result = cleaned.slice(0, 30);
    return result.length > 0 ? result : "user";
  }

  private toResponse(
    record: Awaited<ReturnType<PrismaService["uploadedFile"]["create"]>>,
  ): FileResponseDto {
    return {
      id: record.id,
      category: record.category,
      originalName: record.originalName,
      storedName: record.storedName,
      extension: record.extension ?? undefined,
      url: record.url,
      thumbUrl: record.thumbUrl ?? undefined,
      exifJson:
        record.exifJson && typeof record.exifJson === "object"
          ? (record.exifJson as Record<string, unknown>)
          : undefined,
      mimeType: record.mimeType,
      size: record.size,
      width: record.width ?? undefined,
      height: record.height ?? undefined,
      uploaderId: record.uploaderId,
      modifiedById: record.modifiedById ?? undefined,
      refType: record.refType ?? undefined,
      refId: record.refId ?? undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
