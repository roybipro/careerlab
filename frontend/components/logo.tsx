import { useId } from "react";
import { cn } from "@/lib/utils";

/** The CareerLab mark: an open "C" around a point, on an indigo-to-violet tile. Decorative: the name is always beside it. */
export function LogoMark({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--brand-from)" />
          <stop offset="1" stopColor="var(--brand-to)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <path d="M21.6 10.6a8 8 0 1 0 0 10.8" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16.5" cy="16" r="2.4" fill="#fff" />
    </svg>
  );
}
