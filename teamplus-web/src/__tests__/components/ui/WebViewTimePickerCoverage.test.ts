import fs from 'fs';
import path from 'path';

const migratedFiles = [
  'src/components/classes/ClassForm.tsx',
  'src/components/classes/ScheduleCalendarView.tsx',
  'src/components/ui/MultiDatePickerModal.tsx',
  'src/app/(coach)/training-manage/create/page.tsx',
  'src/app/(common)/notification-settings/page.tsx',
  'src/components/venue/VenueFormSheet.tsx',
  'src/components/match/MatchCreateForm.tsx',
  'src/components/match/MatchEditSheet.tsx',
  'src/app/(admin)/match-manage/page.tsx',
  'src/app/(common)/tournaments/create/page.tsx',
];

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('app-facing WebView time picker coverage', () => {
  it('does not leave native HTML time inputs in migrated screens', () => {
    for (const relativePath of migratedFiles) {
      expect(readSource(relativePath)).not.toMatch(
        /type\s*=\s*["']time["']/,
      );
    }
  });

  it('uses the common picker with 24-hour coverage and 10-minute precision', () => {
    const source = migratedFiles.map(readSource).join('\n');
    const timePickers = source.match(/<TimePicker\b[\s\S]*?\/>/g) ?? [];

    expect(timePickers).toHaveLength(18);
    for (const timePicker of timePickers) {
      expect(timePicker).toContain('startHour={0}');
      expect(timePicker).toContain('stepMinutes={10}');
    }
  });

  it('marks pickers inside overlays as nested', () => {
    const nestedSources = [
      'src/components/classes/ScheduleCalendarView.tsx',
      'src/components/ui/MultiDatePickerModal.tsx',
      'src/components/venue/VenueFormSheet.tsx',
      'src/components/match/MatchEditSheet.tsx',
    ]
      .map(readSource)
      .join('\n');
    const nestedPickers = nestedSources.match(
      /<TimePicker\b[\s\S]*?\/>/g,
    ) ?? [];

    expect(nestedPickers).toHaveLength(7);
    for (const timePicker of nestedPickers) {
      expect(timePicker).toMatch(/\bnested\b/);
    }
  });
});
