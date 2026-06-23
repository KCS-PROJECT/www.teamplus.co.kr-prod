import { NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync } from 'fs';
import { Readable } from 'stream';

/**
 * GET /api/download/app — TEAMPLUS 안드로이드 앱(AOS) APK 다운로드.
 *
 * APK 파일은 웹 루트(public/) 밖의 서버 경로에 있어 정적 서빙이 불가능 →
 * route handler 가 파일을 스트리밍하고 attachment 로 응답한다.
 * (`<a href="/home/kcssi/...">` 직접 링크는 파일시스템 경로라 404 — API 경유 필수)
 *
 * 경로는 환경변수 APK_FILE_PATH 로 덮어쓸 수 있으며, 미설정 시 운영 서버
 * (211.236.174.115) 의 배포 위치를 기본값으로 사용한다.
 */
const APK_PATH = process.env.APK_FILE_PATH ?? '/home/kcssi/app-release.apk';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!existsSync(APK_PATH)) {
    return NextResponse.json(
      { error: 'APK 파일을 찾을 수 없습니다. 잠시 후 다시 시도해주세요.' },
      { status: 404 },
    );
  }

  try {
    const { size } = statSync(APK_PATH);
    // Node stream → Web ReadableStream (대용량 APK 를 메모리에 전부 올리지 않음)
    const nodeStream = createReadStream(APK_PATH);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition':
          'attachment; filename="teamplus-app-release.apk"',
        'Content-Length': String(size),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'APK 다운로드 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
