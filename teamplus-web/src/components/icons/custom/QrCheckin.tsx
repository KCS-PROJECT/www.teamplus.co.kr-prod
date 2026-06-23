interface IconProps {
  className?: string;
  size?: number;
}

export function QrCheckin({ className = 'w-6 h-6', size }: IconProps) {
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
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <path d="M14 14h2v2h-2z"/>
      <path d="M18 14h3"/>
      <path d="M14 18h3"/>
      <path d="M18 18h3v3"/>
      <path d="M5 5h3v3H5z"/>
      <path d="M16 5h3v3h-3z"/>
      <path d="M5 16h3v3H5z"/>
    </svg>
  );
}
