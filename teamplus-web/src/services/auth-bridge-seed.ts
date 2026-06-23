"use client";
/**
 * Bridge `auth/tokenUpdate` 메시지를 수신해 AUTH_CACHE 를 partial seed.
 * Full profile 은 AuthContext 의 idle 보정 경로가 담당. listener 는 앱 부팅 시 1회 설치.
 *
 * iPhone X 콜드 스타트에서 로그인 직후 첫 `/auth/profile` RTT (~200-500ms) 제거.
 */
import { addMessageListener } from "@/services/native-bridge";
import { isNativeApp } from "@/lib/environment";

const AUTH_CACHE_KEY = "teamplus_auth_profile";
let installed = false;

export function installAuthBridgeSeed(): void {
  if (installed || typeof window === "undefined" || !isNativeApp()) return;
  installed = true;

  addMessageListener((messageJson) => {
    try {
      const msg = JSON.parse(messageJson);
      if (msg?.type !== "auth" || msg?.data?.action !== "tokenUpdate") return;

      const info = msg.data.tokenInfo;
      if (!info?.userId) return;

      const existing = (() => {
        try {
          return JSON.parse(sessionStorage.getItem(AUTH_CACHE_KEY) ?? "null");
        } catch {
          return null;
        }
      })();

      // 이미 full cache 가 있으면 덮어쓰지 않음 — partial merge 로 누락 필드만 보완.
      const seed = {
        id: info.userId,
        name: info.userName ?? existing?.name ?? "",
        email: info.userEmail ?? existing?.email ?? "",
        userType: (info.userType ?? existing?.userType ?? "")
          .toString()
          .toLowerCase(),
        avatarUrl: existing?.avatarUrl ?? null,
      };

      sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(seed));
    } catch {
      // 시드 실패는 무시 — AuthContext 가 getProfile() 폴백으로 복구.
    }
  });
}
