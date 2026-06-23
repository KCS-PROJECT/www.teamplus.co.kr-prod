"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface LoadingCoreProps {
  label?: string;
  icon?: ReactNode;
  className?: string;
  labelClassName?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
};

export function LoadingCore({
  label,
  icon,
  className,
  labelClassName,
  size = "md",
}: LoadingCoreProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      {icon && (
        <div className={cn("flex items-center justify-center", sizeClasses[size])}>
          {icon}
        </div>
      )}
      {label && (
        <p className={cn("mt-3 text-sm text-slate-500", labelClassName)}>
          {label}
        </p>
      )}
    </div>
  );
}
