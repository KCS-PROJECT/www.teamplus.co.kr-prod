"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface SkeletonBlockProps {
  className?: string;
  style?: CSSProperties;
}

export function SkeletonBlock({ className, style }: SkeletonBlockProps) {
  return (
    <div
      className={cn("animate-pulse bg-slate-200 dark:bg-slate-700 rounded", className)}
      style={style}
    />
  );
}

interface SkeletonLineProps {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export function SkeletonLine({ width = "100%", height = 16, className }: SkeletonLineProps) {
  return (
    <SkeletonBlock
      className={className}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

interface SkeletonCircleProps {
  size?: number;
  className?: string;
}

export function SkeletonCircle({ size = 40, className }: SkeletonCircleProps) {
  return (
    <SkeletonBlock
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}
