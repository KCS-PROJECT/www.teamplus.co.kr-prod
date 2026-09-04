/**
 * 대표 장소 pair 파생 회귀 가드 — deriveRepresentativeVenuePair (기본 장소 우선).
 *
 * - 폼 루트(감독이 입력한 기본 장소)에 장소(FK 또는 텍스트)가 있으면 루트의 두 값만 쓴다.
 * - 루트가 비면 가장 이른 유효 요일 행의 두 값만 쓴다(다른 층 FK 와 교차 조합 금지).
 * - 빈 값은 '' 로 돌려준다 — 제출 시 빈 문자열까지 동반 전송해 서버가 "" → null 로 전환·해제를 확정한다.
 * 백엔드 preferredVenuePair(루트 > 날짜 행 > 요일 행)와 같은 순서.
 */

import { deriveRepresentativeVenuePair } from '@/hooks/useClassForm';

describe('deriveRepresentativeVenuePair', () => {
  it('기본 장소(루트)가 있으면 요일 행보다 우선한다 — 루트의 두 값만', () => {
    expect(
      deriveRepresentativeVenuePair(
        { venueId: 'vA', venueText: 'A에리어' },
        { venueId: 'v-default', venueText: '1층 A실' },
      ),
    ).toEqual({ venueId: 'v-default', venueText: '1층 A실' });
  });

  it('기본 장소가 FK 만이면 세부는 빈 문자열 — 요일 행의 텍스트를 섞지 않는다', () => {
    expect(
      deriveRepresentativeVenuePair(
        { venueId: '', venueText: '임시 야외 링크' },
        { venueId: 'v1', venueText: '' },
      ),
    ).toEqual({ venueId: 'v1', venueText: '' });
  });

  it('기본 장소가 텍스트 장소(마스터 미등록)여도 루트가 우선한다', () => {
    expect(
      deriveRepresentativeVenuePair(
        { venueId: 'vA', venueText: '' },
        { venueId: '', venueText: '동네 공터 링크' },
      ),
    ).toEqual({ venueId: '', venueText: '동네 공터 링크' });
  });

  it('기본 장소가 비면 가장 이른 요일 행의 두 값으로 폴백한다(FK+세부 / 텍스트만)', () => {
    expect(
      deriveRepresentativeVenuePair({ venueId: 'vA', venueText: '2층' }, { venueId: '', venueText: '' }),
    ).toEqual({ venueId: 'vA', venueText: '2층' });
    expect(deriveRepresentativeVenuePair({ venueId: '', venueText: '야외' }, {})).toEqual({
      venueId: '',
      venueText: '야외',
    });
  });

  it('전부 비면 두 값 모두 빈 문자열(서버 null 확정용)', () => {
    expect(deriveRepresentativeVenuePair({ venueId: '', venueText: '' }, {})).toEqual({
      venueId: '',
      venueText: '',
    });
    expect(deriveRepresentativeVenuePair(undefined, { venueId: '', venueText: '' })).toEqual({
      venueId: '',
      venueText: '',
    });
  });
});
