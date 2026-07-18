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
    expect(source.match(/stepMinutes=\{10\}/g)).toHaveLength(4);
  });
});
