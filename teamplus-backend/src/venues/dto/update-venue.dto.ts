import { PartialType } from "@nestjs/swagger";
import { CreateVenueDto } from "./create-venue.dto";

/**
 * 구장(Venue) 수정 요청 DTO
 * - CreateVenueDto의 모든 필드를 optional로 변환
 * - class-validator 검증 룰과 Swagger 문서화를 자동 승계
 */
export class UpdateVenueDto extends PartialType(CreateVenueDto) {}
