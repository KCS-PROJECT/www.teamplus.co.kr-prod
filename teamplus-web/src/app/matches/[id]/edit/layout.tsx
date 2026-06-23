"use client";

import type { ReactNode } from "react";
import { useRequireRole } from "@/contexts/AuthContext";

const MATCH_MANAGER_ROLES: Parameters<typeof useRequireRole>[0] = [
  "admin",
  "director",
  "academy_director",
  "coach",
] as Parameters<typeof useRequireRole>[0];

export default function MatchEditLayout({ children }: { children: ReactNode }) {
  const { isLoading, isAllowed } = useRequireRole(MATCH_MANAGER_ROLES);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-wbg dark:bg-puck" aria-busy="true" />
    );
  }

  if (!isAllowed) return null;

  return <>{children}</>;
}
