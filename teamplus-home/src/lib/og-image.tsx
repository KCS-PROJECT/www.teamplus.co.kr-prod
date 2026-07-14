/**
 * OG/트위터 공유 카드 이미지 생성기 (1200×630).
 * next/og(Satori)로 브랜드 톤의 소셜 미리보기 이미지를 동적 생성한다.
 * opengraph-image.tsx · twitter-image.tsx 가 공유한다.
 *
 * 한글 렌더를 위해 Pretendard OTF(로컬 /public/fonts)를 로드한다.
 */
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BRAND } from './content';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = 'image/png';
export const OG_ALT = `${BRAND.name} · 아이스하키 클럽 통합 운영 플랫폼`;

async function loadFont(file: string) {
  return readFile(join(process.cwd(), 'public', 'fonts', file));
}

export async function renderOgImage() {
  const [bold, extraBold] = await Promise.all([
    loadFont('Pretendard-Bold.otf'),
    loadFont('Pretendard-ExtraBold.otf'),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          backgroundColor: '#0A0D14',
          backgroundImage:
            'radial-gradient(1000px circle at 85% 0%, rgba(47,95,255,0.28), transparent 60%)',
          fontFamily: 'Pretendard',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '18px',
              height: '18px',
              borderRadius: '9999px',
              backgroundColor: '#2F5FFF',
            }}
          />
          <div style={{ fontSize: '30px', color: '#9AA4BA', fontWeight: 700 }}>
            아이스하키 클럽 통합 운영 플랫폼
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            style={{
              fontSize: '92px',
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '-2px',
              lineHeight: 1.05,
            }}
          >
            {BRAND.name}
          </div>
          <div
            style={{
              fontSize: '40px',
              fontWeight: 700,
              color: '#C7CEDD',
              lineHeight: 1.35,
              maxWidth: '900px',
            }}
          >
            {BRAND.tagline}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '14px' }}>
          {['QR 출석', 'KG이니시스 연동', '카카오 알림톡', '역할별 화면'].map(
            (badge) => (
              <div
                key={badge}
                style={{
                  fontSize: '26px',
                  fontWeight: 700,
                  color: '#2F5FFF',
                  backgroundColor: 'rgba(47,95,255,0.12)',
                  border: '1px solid rgba(47,95,255,0.35)',
                  borderRadius: '9999px',
                  padding: '10px 24px',
                }}
              >
                {badge}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: 'Pretendard', data: bold, weight: 700, style: 'normal' },
        { name: 'Pretendard', data: extraBold, weight: 800, style: 'normal' },
      ],
    },
  );
}
