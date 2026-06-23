import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface teamplusIconProps {
  icon: LucideIcon;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  color?: string;
}

const sizeMap = {
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

export function teamplusIcon({
  icon: Icon,
  size = "md",
  className,
  color,
}: teamplusIconProps) {
  return (
    <Icon
      className={cn(sizeMap[size], className)}
      style={color ? { color } : undefined}
    />
  );
}
