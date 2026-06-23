import { Module } from "@nestjs/common";
import { ChildrenController } from "./children.controller";
import { ChildrenService } from "./children.service";
import { PrismaModule } from "@/prisma/prisma.module";
import { NotificationsModule } from "@/notifications/notifications.module";

/**
 * Children Module
 *
 * 학부모-자녀 관계 관리 모듈
 *
 * 주요 기능:
 * - 자녀 등록 (학부모 대리 등록)
 * - 자녀 목록 조회
 * - 자녀 정보 수정
 * - 자녀 삭제
 * - 보호자 추가
 *
 * 비즈니스 규칙:
 * - 자녀는 UserType=CHILD인 User로 생성됨
 * - ParentChild 테이블로 학부모-자녀 관계 관리
 * - 한 자녀에 여러 보호자 연결 가능 (부모, 조부모 등)
 * - 주 보호자(isPrimary)만 결제/승인 권한 보유
 */
@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ChildrenController],
  providers: [ChildrenService],
  exports: [ChildrenService],
})
export class ChildrenModule {}
