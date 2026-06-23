interface IconProps {
  className?: string;
  size?: number;
}

export function IceSkate({ className = 'w-6 h-6', size }: IconProps) {
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
      <path d="M6 3v10"/>
      <path d="M6 13c0 0 2 2 6 2s6-2 6-2"/>
      <path d="M4 17h16"/>
      <path d="M4 20h16"/>
    </svg>
  );
}
