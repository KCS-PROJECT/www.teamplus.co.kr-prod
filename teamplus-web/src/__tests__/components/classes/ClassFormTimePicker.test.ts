import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ClassForm 시간 선택기 연결', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/components/classes/ClassForm.tsx'),
    'utf8',
  );

  it('요일별·날짜별 시간 입력 네 곳이 공통 TimePicker를 사용한다', () => {
    expect(source.match(/<TimePicker/g)).toHaveLength(4);
    expect(source).not.toMatch(/type=["']time["']/);
  });

  it('모든 수업 시간 선택기에 10분 정밀도를 명시한다', () => {
    // 리터럴 10 대신 명명 상수 — 종료 하한("시작 + 1스텝") 계산과 같은 값을 쓰기 위함.
    expect(source).toMatch(/const SCHEDULE_STEP_MINUTES = 10;/);
    expect(source.match(/stepMinutes=\{SCHEDULE_STEP_MINUTES\}/g)).toHaveLength(4);
  });
});
