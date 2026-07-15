import { registerAs } from "@nestjs/config";

/**
 * Firebase Admin 자격증명 로딩.
 *
 * 우선순위:
 *  1. 개별 env (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)
 *  2. FIREBASE_SERVICE_ACCOUNT_JSON (서비스 계정 JSON 통째 — 운영 시크릿 주입 단순화용)
 *
 * 둘 다 없거나 JSON 파싱 실패 시 빈 값 반환 → FcmService 가 경고 후 발송 비활성화.
 */
export default registerAs("firebase", () => {
  const projectId = process.env.FIREBASE_PROJECT_ID || "";
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || "";
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(
    /\\n/g,
    "\n",
  );

  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    try {
      const json = JSON.parse(raw);
      return {
        projectId: json.project_id || "",
        clientEmail: json.client_email || "",
        privateKey: (json.private_key || "").replace(/\\n/g, "\n"),
      };
    } catch {
      // 파싱 실패는 자격증명 부재와 동일하게 취급 (아래 빈 값 반환)
    }
  }

  return { projectId, clientEmail, privateKey };
});
