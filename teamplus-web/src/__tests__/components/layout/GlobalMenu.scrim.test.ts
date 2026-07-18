import { readFileSync } from 'fs';
import path from 'path';

describe('GlobalMenu native scrim policy', () => {
  it('paints the bottom safe area with a drawer surface instead of dimming it', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/layout/GlobalMenu.tsx'),
      'utf8',
    );

    expect(source).toContain('bottomColor: "#FFFFFFFF"');
  });

  it('paints the native bottom safe area with the drawer surface', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/components/layout/GlobalMenu.tsx'),
      'utf8',
    );

    expect(source).toContain('scaffoldBackgroundColor: "#FFFFFF"');
    expect(source).toContain('scaffoldBackgroundColor: null');
  });
});
