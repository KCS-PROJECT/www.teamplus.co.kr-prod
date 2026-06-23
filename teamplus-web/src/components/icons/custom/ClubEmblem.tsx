interface IconProps {
  className?: string;
  size?: number;
}

export function ClubEmblem({ className = 'w-6 h-6', size }: IconProps) {
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
      <path d="M12 2L4 6v6c0 5 4 9 8 10 4-1 8-5 8-10V6L12 2z"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  );
}
