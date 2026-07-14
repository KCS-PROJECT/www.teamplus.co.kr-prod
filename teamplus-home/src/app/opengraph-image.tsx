import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from '@/lib/og-image';

// Satori 폰트 로드(fs) 위해 Node 런타임 사용.
export const runtime = 'nodejs';
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage();
}
