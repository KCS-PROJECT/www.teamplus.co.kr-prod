import { redirect } from 'next/navigation';

/**
 * [P5-R1-02] canonical redirect — 공지 상세의 SoT 는 `/notice/[id]` 단일 화면.
 *
 * 이 라우트는 진입 링크 0건의 orphan 구현이었으나 URL 직접 접근이 가능했고,
 * 폐기된 `limit=100` 클라이언트 인접글 계산·자체 권한 처리 등 canonical 화면과
 * 다른 계약이 잔존해 이중화 드리프트의 원인이었다. 692줄 중복 구현을 제거하고
 * 명시적 redirect 로 대체한다 — 딥링크·북마크는 그대로 동작한다.
 */
export default async function NoticeDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/notice/${encodeURIComponent(id)}`);
}
