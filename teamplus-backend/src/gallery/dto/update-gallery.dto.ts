import { PartialType } from "@nestjs/swagger";
import { CreateGalleryDto } from "./create-gallery.dto";

/**
 * 갤러리 수정 DTO.
 *
 * CreateGalleryDto의 모든 필드를 optional로 확장.
 */
export class UpdateGalleryDto extends PartialType(CreateGalleryDto) {}
