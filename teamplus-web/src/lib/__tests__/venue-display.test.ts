/**
 * 수업 장소 2필드 모델 {venueId(name) | venueText} 표시 resolver 회귀 가드.
 *
 * - name 있으면 text 는 세부 구역 → "링크장명 · 세부", name 없으면 text 가 장소 전체.
 * - 계층 폴백(회차 → 요일 기본값 → 수업 대표)은 장소가 있는 첫 층의 두 값만 쓴다
 *   (다른 층의 name 과 이 층의 text 교차 조합 금지).
 * - formatDaySchedulesFull 이 요일 규칙의 venueText 를 같은 규칙으로 병기한다.
 */

import { formatVenueRef, resolveVenueDisplay } from '@/lib/venue-display';
import { formatDaySchedulesFull } from '@/lib/class-categories';

describe('formatVenueRef', () => {
  it('name + text → "name · text"', () => {
    expect(formatVenueRef({ name: '인천 선학빙상장', text: '1층 A실' })).toBe(
      '인천 선학빙상장 · 1층 A실',
    );
  });

  it('name 만 → name', () => {
    expect(formatVenueRef({ name: '인천 선학빙상장', text: null })).toBe('인천 선학빙상장');
    expect(formatVenueRef({ name: '인천 선학빙상장' })).toBe('인천 선학빙상장');
  });

  it('text 만(마스터 미등록 장소) → text 그대로', () => {
    expect(formatVenueRef({ name: null, text: '동네 공터 링크' })).toBe('동네 공터 링크');
  });

  it('공백만인 값은 없는 것으로 본다', () => {
    expect(formatVenueRef({ name: '  ', text: '  ' })).toBeNull();
    expect(formatVenueRef({ name: ' 링크장 ', text: '  ' })).toBe('링크장');
    expect(formatVenueRef(null)).toBeNull();
    expect(formatVenueRef(undefined)).toBeNull();
  });
});

describe('resolveVenueDisplay — 계층 폴백', () => {
  it('회차 층에 장소가 있으면 그 층만 쓴다(하위 층 name 과 교차 조합 금지)', () => {
    expect(
      resolveVenueDisplay(
        { name: null, text: 'B에리어' },
        { name: '요일 링크장', text: null },
        { name: '대표 링크장', text: '대표 세부' },
      ),
    ).toBe('B에리어');
  });

  it('회차 층이 비면 요일 기본값 층, 그것도 비면 수업 대표 층', () => {
    expect(
      resolveVenueDisplay(
        { name: null, text: null },
        { name: '요일 링크장', text: '2층' },
        { name: '대표 링크장', text: null },
      ),
    ).toBe('요일 링크장 · 2층');
    expect(
      resolveVenueDisplay(undefined, null, { name: '대표 링크장', text: null }),
    ).toBe('대표 링크장');
  });

  it('모든 층이 비면 null', () => {
    expect(resolveVenueDisplay({ name: '', text: '' }, null, undefined)).toBeNull();
  });
});

describe('formatDaySchedulesFull — venueText 병기', () => {
  it('요일 규칙의 name·text 를 "name · text" 로 시간 뒤에 붙인다', () => {
    expect(
      formatDaySchedulesFull([
        { dayOfWeek: '수', startTime: '18:00', endTime: '19:00', venueName: 'B링크', venueText: '2층' },
        { dayOfWeek: '월', startTime: '17:00', endTime: '18:00', venueName: 'A링크' },
        { dayOfWeek: '금', startTime: '17:00', endTime: '18:00', venueText: '임시 장소' },
      ]),
    ).toBe('월 17:00 ~ 18:00 A링크 / 수 18:00 ~ 19:00 B링크 · 2층 / 금 17:00 ~ 18:00 임시 장소');
  });
});
