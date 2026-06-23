"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useRoleSwitch, type ViewAsRole } from "@/hooks/useRoleSwitch";
import { useUserRoles } from "@/hooks/useUserRoles";
import { MESSAGES } from "@/lib/messages";
import { cn } from "@/lib/utils";

/**
 * RoleSwitcher - 역할 겸직 사용자용 보기 모드 드롭다운
 *
 * - 학부모 + 코치 역할 동시 보유 시에만 노출
 * - localStorage `teamplus_current_view_as` 저장 (토큰 재발급 없음)
 * - AppBar `rightAction` 슬롯에 삽입
 */

interface RoleSwitcherProps {
  className?: string;
}

const ROLE_LABEL: Record<ViewAsRole, string> = {
  parent: MESSAGES.role.parentLabel,
  coach: MESSAGES.role.coachLabel,
};

const ROLE_SWITCH_LABEL: Record<ViewAsRole, string> = {
  parent: MESSAGES.role.viewAsParent,
  coach: MESSAGES.role.viewAsCoach,
};

const ROLE_ICON: Record<ViewAsRole, string> = {
  parent: "family_restroom",
  coach: "sports",
};

export function RoleSwitcher({ className }: RoleSwitcherProps) {
  const roles = useUserRoles();
  const { currentViewAs, setViewAs, isReady } = useRoleSwitch(
    roles.primaryRole ?? undefined,
  );
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleSelect = useCallback(
    (role: ViewAsRole) => {
      setIsOpen(false);
      if (currentViewAs === role) return;
      setViewAs(role);
      toast.success(MESSAGES.role.switchSuccess(ROLE_LABEL[role]));
    },
    [currentViewAs, setViewAs, toast],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  if (!isReady) return <div className="size-10" aria-hidden="true" />;
  if (!roles.hasMultipleRoles) return null;

  const activeRole: ViewAsRole = currentViewAs ?? roles.primaryRole ?? "parent";

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1 h-10 px-3 -mr-2 rounded-full text-sm font-semibold text-wtext-1 dark:text-white hover:bg-wline-2 dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none"
        aria-label={MESSAGES.role.dropdownAriaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Icon
          name={ROLE_ICON[activeRole]}
          className="text-[20px]"
          aria-hidden="true"
        />
        <span className="truncate max-w-[80px]">{ROLE_LABEL[activeRole]}</span>
        <Icon
          name="expand_more"
          className={cn(
            "text-[18px] transition-transform motion-reduce:transition-none",
            isOpen && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={MESSAGES.role.dropdownAriaLabel}
          className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-lg overflow-hidden z-30"
        >
          <div className="px-4 py-3 border-b border-wline-2 dark:border-rink-700">
            <p className="text-xs font-semibold text-wtext-3 dark:text-rink-300">
              {MESSAGES.role.viewAsLabel}
            </p>
            <p className="text-xs text-wtext-3 dark:text-rink-300 mt-1">
              {MESSAGES.role.switchHint}
            </p>
          </div>
          <ul className="py-1">
            {roles.availableRoles.map((role) => {
              const isActive = role === activeRole;
              return (
                <li key={role}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleSelect(role)}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-3 text-sm transition-colors motion-reduce:transition-none",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/20 text-ice-500 font-semibold"
                        : "text-wtext-2 dark:text-rink-100 hover:bg-wbg dark:hover:bg-rink-700",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Icon
                        name={ROLE_ICON[role]}
                        className="text-[20px]"
                        aria-hidden="true"
                      />
                      {ROLE_SWITCH_LABEL[role]}
                    </span>
                    {isActive && (
                      <Icon
                        name="check"
                        className="text-[18px] text-ice-500"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export default RoleSwitcher;
