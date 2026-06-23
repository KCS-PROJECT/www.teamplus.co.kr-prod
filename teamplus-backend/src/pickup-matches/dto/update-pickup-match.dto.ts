import { PartialType } from "@nestjs/swagger";
import { CreatePickupMatchDto } from "./create-pickup-match.dto";

/**
 * 매치 수정 DTO.
 *
 * `CreatePickupMatchDto`의 모든 필드를 optional로 전환 (PartialType 사용).
 *
 * 비즈니스 규칙(서비스 레이어에서 추가 검증):
 * - `cancelled` 상태 매치는 수정 불가
 * - 이미 시작된 매치(`scheduledAt < now`)는 수정 불가
 * - `maxParticipants`는 현재 승인된 신청자 수 이하로 낮출 수 없음
 * - 주최자(매니저) 본인 또는 ADMIN/DIRECTOR/ACADEMY_DIRECTOR만 호출 가능
 */
export class UpdatePickupMatchDto extends PartialType(CreatePickupMatchDto) {}
