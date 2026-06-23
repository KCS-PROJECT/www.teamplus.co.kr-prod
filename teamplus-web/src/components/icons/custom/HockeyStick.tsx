interface IconProps {
  className?: string;
  size?: number;
}

export function HockeyStick({ className = 'w-6 h-6', size }: IconProps) {
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
      <path d="M4 20L14 4"/>
      <path d="M14 4L20 8"/>
      <path d="M4 20L8 18"/>
    </svg>
  );
}
