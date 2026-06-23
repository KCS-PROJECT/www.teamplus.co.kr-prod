interface IconProps {
  className?: string;
  size?: number;
}

export function HockeyPuck({ className = 'w-6 h-6', size }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width={size}
      height={size}
    >
      <ellipse cx="12" cy="12" rx="10" ry="6"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
    </svg>
  );
}
