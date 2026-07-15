import { PartialType } from "@nestjs/swagger";
import { CreateBlogDto } from "./create-blog.dto";

/**
 * 블로그 글 수정 DTO (관리자 전용).
 * 생성 DTO 의 모든 필드를 선택(optional)으로 재사용 — 부분 업데이트.
 */
export class UpdateBlogDto extends PartialType(CreateBlogDto) {}
