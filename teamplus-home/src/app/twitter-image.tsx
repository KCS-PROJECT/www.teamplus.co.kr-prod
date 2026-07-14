import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE, OG_ALT } from '@/lib/og-image';

export const runtime = 'nodejs';
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgImage();
}
