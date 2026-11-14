// Hand-drawn inline SVG icons (no external assets, so the CSP stays strict).
// Colors come from CSS via `currentColor` and custom properties.

export function ShoeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`icon shoe-icon ${className}`} viewBox="0 0 64 40" aria-hidden="true">
      {/* sole */}
      <path d="M3 31c0-2 1-3 3-3h52c3 0 4 2 4 4v2c0 2-1 3-3 3H7c-2 0-4-1-4-3z" fill="var(--shoe-sole, #3b2a1e)" />
      {/* boot upper */}
      <path
        d="M6 28c0-6 2-14 6-19 1-2 3-3 5-3h9c2 0 3 1 3 3v6c0 2 1 3 3 4l10 3c8 2 16 3 18 6v0H6z"
        fill="var(--shoe-upper, #8a5a32)"
      />
      {/* laces and stitching */}
      <path d="M22 9h6M21 13h7M21 17h8M34 20l3-3M40 22l3-3" stroke="var(--shoe-lace, #f1deb0)" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 26h50" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" strokeDasharray="2 3" />
    </svg>
  );
}

export function BackpackIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`icon backpack-icon ${className}`} viewBox="0 0 40 44" aria-hidden="true">
      <path d="M14 7c0-3 2-5 6-5s6 2 6 5" fill="none" stroke="var(--strap, #5c3b21)" strokeWidth="3" />
      <rect x="5" y="7" width="30" height="35" rx="9" fill="var(--canvas, #6f7d43)" />
      <path d="M5 18c0-6 4-11 10-11h10c6 0 10 5 10 11v3H5z" fill="var(--flap, #8a5a32)" />
      <rect x="17" y="18" width="6" height="7" rx="1.5" fill="var(--buckle, #d9b25f)" />
      <rect x="10" y="29" width="20" height="9" rx="3" fill="rgba(0,0,0,.15)" />
    </svg>
  );
}

export function SeedIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`icon seed-icon ${className}`} viewBox="0 0 20 24" aria-hidden="true">
      <path d="M10 2c5 4 8 9 8 13a8 8 0 0 1-16 0c0-4 3-9 8-13z" fill="var(--seed, #c98b2b)" />
      <path d="M10 6c-1 4-1 9 0 14" stroke="rgba(0,0,0,.25)" strokeWidth="1.5" fill="none" />
      <path d="M13 9c1 2 1.5 4 1 6" stroke="rgba(255,255,255,.45)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ScrollIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`icon scroll-icon ${className}`} viewBox="0 0 40 44" aria-hidden="true">
      <rect x="8" y="7" width="24" height="30" fill="var(--paper, #f3e4bd)" />
      <rect x="3" y="3" width="34" height="8" rx="4" fill="var(--roll, #c9a468)" />
      <rect x="3" y="33" width="34" height="8" rx="4" fill="var(--roll, #c9a468)" />
      <path d="M13 17h14M13 22h14M13 27h9" stroke="var(--scribble, #8a6a3c)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function HourglassIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`icon hourglass-icon ${className}`} viewBox="0 0 40 44" aria-hidden="true">
      <path d="M9 4h22M9 40h22" stroke="var(--frame, #74482a)" strokeWidth="4" strokeLinecap="round" />
      <path d="M12 6c0 9 6 11 6 16s-6 7-6 16h16c0-9-6-11-6-16s6-7 6-16z" fill="var(--glass, #f7efd8)" stroke="var(--frame, #74482a)" strokeWidth="2" />
      <path d="M15 12h10c-1 4-4 5-5 8-1-3-4-4-5-8zM14 37c1-5 4-6 6-8 2 2 5 3 6 8z" fill="var(--seed, #c98b2b)" />
    </svg>
  );
}
