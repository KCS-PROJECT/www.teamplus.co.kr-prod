"use client";

import { useAuth } from "@/contexts/AuthContext";

/**
 * Page-safe session facade.
 *
 * Route layouts remain responsible for auth guards. Pages use this facade only
 * to read session data or trigger auth actions without importing AuthContext
 * guard hooks directly.
 */
export function useSessionAuth() {
  return useAuth();
}
