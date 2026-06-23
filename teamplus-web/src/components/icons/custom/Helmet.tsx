interface IconProps {
  className?: string;
  size?: number;
}

export function Helmet({ className = 'w-6 h-6', size }: IconProps) {
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
      <path d="M12 3C7 3 3 7 3 12v3h18v-3C21 7 17 3 12 3z"/>
      <path d="M3 15h18"/>
      <path d="M8 15v3"/>
      <path d="M16 15v3"/>
      <path d="M8 18h8"/>
    </svg>
  );
}
