import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { promises as fsp } from "fs";
import { basename } from "path";
import { resolveUploadAbsolutePath } from "@/common/upload-paths";

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 이전 아바타 파일 자동 정리 (자주 바꾸는 사용자의 디스크 누적 방지).
   *
   * 안전 조건:
   *   - URL 이 `/uploads/` 로 시작해야 함 (외부 URL 보호)
   *   - 경로 순회 방지 (`..` · 절대경로 차단)
   *   - 본인 소유 + 본인 외 참조 없을 때만 삭제 (refType=user_avatar OR uploaderId 일치)
   *   - 디스크 삭제는 best-effort (실패해도 메인 흐름 영향 없음)
   *
   * @param userId 변경 주체 — 안전 검증용
   * @param oldUrl 기존 avatarUrl (null/외부 URL/빈 문자열이면 no-op)
   */
  private async cleanupPreviousAvatar(
    userId: string,
    oldUrl: string | null | undefined,
  ): Promise<void> {
    if (!oldUrl || !oldUrl.startsWith("/uploads/")) return;

    // path traversal 방지 — 경로 분해 후 basename 만 사용
    const segments = oldUrl
      .replace(/^\/uploads\/+/, "")
      .split("/")
      .filter((s) => s && !s.includes(".."));
    if (segments.length < 2) {
      this.logger.warn(`아바타 URL 형식 비정상 — 정리 스킵: ${oldUrl}`);
      return;
    }
    const filename = basename(segments[segments.length - 1]);
    if (!filename || filename.includes("/") || filename.includes("\\")) {
      this.logger.warn(`아바타 파일명 비정상 — 정리 스킵: ${oldUrl}`);
      return;
    }

    // UploadedFile 레코드를 URL 로 역추적 — 본인 소유 + AVATAR/IMAGE 카테고리만
    const record = await this.prisma.uploadedFile.findFirst({
      where: {
        url: oldUrl,
        uploaderId: userId,
        category: { in: ["AVATAR", "IMAGE"] },
      },
      select: { id: true, path: true, thumbUrl: true },
    });

    if (record) {
      await this.prisma.uploadedFile
        .delete({ where: { id: record.id } })
        .catch((err) => {
          this.logger.warn(
            `이전 아바타 UploadedFile 레코드 삭제 실패: ${record.id} - ${(err as Error).message}`,
          );
        });

      // 디스크 정리 (원본 + 썸네일) — best-effort
      //   resolveUploadAbsolutePath: path traversal 방지 + UPLOAD_ROOT 하위 보장
      const absolutePath = resolveUploadAbsolutePath(record.path);
      if (absolutePath) {
        await fsp.unlink(absolutePath).catch((err) => {
          // ENOENT 는 이미 삭제된 정상 상황 — info 로그
          if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
          this.logger.warn(
            `이전 아바타 디스크 삭제 실패: ${absolutePath} - ${err.message}`,
          );
        });
      }

      if (record.thumbUrl) {
        const thumbAbsolute = resolveUploadAbsolutePath(record.thumbUrl);
        if (thumbAbsolute) {
          await fsp.unlink(thumbAbsolute).catch((err) => {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
            this.logger.warn(
              `이전 아바타 썸네일 삭제 실패: ${thumbAbsolute} - ${err.message}`,
            );
          });
        }
      }

      this.logger.log(
        `이전 아바타 정리 완료: userId=${userId}, url=${oldUrl}`,
      );
    } else {
      // UploadedFile 레코드가 없으면 디스크에서만 삭제 시도 (orphan 파일 — 안전 정리)
      const absolutePath = resolveUploadAbsolutePath(oldUrl);
      if (absolutePath) {
        await fsp.unlink(absolutePath).catch(() => {
          // 조용히 실패 — 다른 곳에서 사용 중이거나 이미 삭제된 경우
        });
      }
    }
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        userType: true,
        createdAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        userType: true,
      },
    });
  }

  /**
   * 프로필 수정 (이름, 전화번호)
   */
  async updateMyProfile(
    userId: string,
    data: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      avatarUrl?: string;
      zipCode?: string;
      address?: string;
      addressDetail?: string;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 전화번호 중복 확인
    if (data.phone && data.phone !== user.phone) {
      const existing = await this.prisma.user.findUnique({
        where: { phone: data.phone },
      });
      if (existing) {
        throw new BadRequestException("이미 사용 중인 전화번호입니다.");
      }
    }

    const updateData: Record<string, string | null> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    // avatarUrl: 빈 문자열("")이 오면 null로 저장해 아바타 제거 효과
    let avatarChanged = false;
    let previousAvatarUrl: string | null = null;
    if (data.avatarUrl !== undefined) {
      const next = data.avatarUrl === "" ? null : data.avatarUrl;
      if (next !== user.avatarUrl) {
        avatarChanged = true;
        previousAvatarUrl = user.avatarUrl ?? null;
        updateData.avatarUrl = next;
      }
    }
    // 주소 3필드: 빈 문자열은 null로 정규화
    if (data.zipCode !== undefined) {
      updateData.zipCode = data.zipCode === "" ? null : data.zipCode;
    }
    if (data.address !== undefined) {
      updateData.address = data.address === "" ? null : data.address;
    }
    if (data.addressDetail !== undefined) {
      updateData.addressDetail =
        data.addressDetail === "" ? null : data.addressDetail;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException("수정할 항목이 없습니다.");
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        userType: true,
        avatarUrl: true,
        zipCode: true,
        address: true,
        addressDetail: true,
        updatedAt: true,
      },
    });

    this.logger.log(`프로필 수정 완료: ${updated.email}`);

    // 아바타가 실제로 바뀐 경우 이전 파일 정리 (best-effort, 실패해도 응답에 영향 없음)
    if (avatarChanged && previousAvatarUrl) {
      await this.cleanupPreviousAvatar(userId, previousAvatarUrl).catch(
        (err) => {
          this.logger.warn(
            `이전 아바타 정리 중 예외: ${(err as Error).message}`,
          );
        },
      );
    }

    return updated;
  }

  /**
   * 부모 → 자녀 프로필 사진 변경
   *
   * 권한 검증:
   *   - PARENT 만 호출 가능 (controller 에서 @Roles 보장)
   *   - ParentChild 관계 확인 (본인 자녀가 아니면 403)
   *
   * 이전 아바타 파일 자동 정리 (자녀가 자주 바꾸는 경우 디스크 누적 방지).
   *
   * @param parentId 부모 User.id (요청자)
   * @param childId 자녀 User.id
   * @param avatarUrl 새 아바타 URL. 빈 문자열이면 아바타 제거(null).
   */
  async updateChildAvatar(
    parentId: string,
    childId: string,
    avatarUrl: string,
  ) {
    // ParentChild 관계 검증
    const parentChild = await this.prisma.parentChild.findFirst({
      where: { parentId, childId },
      select: { id: true },
    });
    if (!parentChild) {
      throw new NotFoundException(
        "본인 자녀의 프로필 사진만 변경할 수 있습니다.",
      );
    }

    const child = await this.prisma.user.findUnique({
      where: { id: childId },
      select: { id: true, avatarUrl: true, userType: true },
    });
    if (!child) {
      throw new NotFoundException("자녀를 찾을 수 없습니다.");
    }

    const next = avatarUrl === "" ? null : avatarUrl;
    const previousAvatarUrl = child.avatarUrl ?? null;
    const changed = next !== previousAvatarUrl;
    if (!changed) {
      return {
        id: child.id,
        avatarUrl: child.avatarUrl,
        unchanged: true,
      };
    }

    const updated = await this.prisma.user.update({
      where: { id: childId },
      data: { avatarUrl: next },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userType: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    this.logger.log(
      `자녀 아바타 변경 완료: parentId=${parentId}, childId=${childId}`,
    );

    // 이전 자녀 아바타 파일 정리 — 자녀 본인 uploaderId 또는 부모 uploaderId 모두 허용.
    if (previousAvatarUrl) {
      await this.cleanupPreviousAvatar(childId, previousAvatarUrl).catch(
        (err) => {
          this.logger.warn(
            `자녀 이전 아바타 정리 실패: ${(err as Error).message}`,
          );
        },
      );
      // 부모가 업로드한 파일이라면 위 cleanup 이 매칭 실패할 수 있어 1회 더 시도 (uploaderId=parentId).
      await this.cleanupPreviousAvatar(parentId, previousAvatarUrl).catch(
        () => undefined,
      );
    }

    return updated;
  }

  /**
   * 비밀번호 변경 (현재 비밀번호 확인 + 새 비밀번호)
   */
  async changeMyPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException("사용자를 찾을 수 없습니다.");
    }

    // 현재 비밀번호 검증
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException("현재 비밀번호가 일치하지 않습니다.");
    }

    // 새 비밀번호가 현재와 동일한지 확인
    const isSame = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSame) {
      throw new BadRequestException(
        "새 비밀번호는 현재 비밀번호와 달라야 합니다.",
      );
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    this.logger.log(`비밀번호 변경 완료: ${user.email}`);

    return { message: "비밀번호가 변경되었습니다." };
  }
}
