interface IconProps {
  className?: string;
  size?: number;
}

export function CreditCoin({ className = 'w-6 h-6', size }: IconProps) {
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
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v2"/>
      <path d="M12 16v2"/>
      <path d="M9 9h4a2 2 0 0 1 0 4H9v3h6"/>
    </svg>
  );
}
