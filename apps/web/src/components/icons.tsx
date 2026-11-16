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

export function CampfireIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`icon campfire-icon ${className}`} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M8 43 40 35M8 35l32 8" stroke="var(--log, #5a3a22)" strokeWidth="5" strokeLinecap="round" fill="none" />
      <path className="flame flame-outer" d="M24 38c-10-3-12-13-6-21 1 5 4 6 4 0 0-7 4-11 8-14-1 8 10 14 6 25-2 6-6 10-12 10Z" />
      <path className="flame flame-inner" d="M24 38c-5-2-6-8-3-12 1 3 3 2 3-1 5 3 7 9 4 12-1 1-3 1-4 1Z" />
    </svg>
  );
}

// Sign-in provider marks, drawn as each provider's guidelines require.
export function GoogleIcon() {
  return (
    <svg className="icon provider-icon" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg className="icon provider-icon" viewBox="0 0 384 512" aria-hidden="true">
      <path
        fill="currentColor"
        d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
      />
    </svg>
  );
}

/** Portraits of the four bots, weakest to strongest. */
export function BugIcon({ level }: { level: 'larva' | 'beetle' | 'mantis' | 'hornet' }) {
  return (
    <svg className={`icon bug-icon bug-${level}`} viewBox="0 0 48 48" aria-hidden="true">
      {level === 'larva' && (
        <>
          <path d="M8 33q4-5 8 0t8 0 8 0 8 0" fill="none" stroke="#6e9a34" strokeWidth="13" strokeLinecap="round" />
          <path d="M8 33q4-5 8 0t8 0 8 0" fill="none" stroke="#a5cf5a" strokeWidth="9" strokeLinecap="round" />
          <circle cx="39" cy="31" r="7" fill="#c4572a" />
          <circle cx="41.5" cy="29.5" r="1.6" fill="#2a2118" />
          <path d="M40 24l2-6M44 26l4-4" stroke="#2a2118" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {level === 'beetle' && (
        <>
          <path d="M12 20 4 15M11 28H3M13 35l-8 6M36 20l8-5M37 28h8M35 35l8 6" stroke="#2a2118" strokeWidth="2.2" strokeLinecap="round" />
          <ellipse cx="24" cy="29" rx="13" ry="15" fill="#1f6b5a" />
          <path d="M24 15v29" stroke="#12382f" strokeWidth="1.8" />
          <path d="M16 22q-3 8 0 16" stroke="rgba(255,255,255,.4)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M13 17q11-9 22 0v3H13z" fill="#1c231c" />
          <circle cx="24" cy="9" r="5" fill="#1c231c" />
          <path d="M21 5l-4-4M27 5l4-4" stroke="#1c231c" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
      {level === 'mantis' && (
        <>
          <path d="M24 16v26" stroke="#5c8a2c" strokeWidth="7" strokeLinecap="round" />
          <path d="M21 30 11 44M27 30l10 14M21 36 14 46M27 36l7 10" stroke="#3f6b1e" strokeWidth="2" strokeLinecap="round" />
          <path d="M22 19 11 13l3 13M26 19l11-6-3 13" fill="none" stroke="#6da334" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 9q9-8 18 0-4 9-9 9t-9-9z" fill="#7fb53c" />
          <circle cx="17.5" cy="9.5" r="3" fill="#2a2118" />
          <circle cx="30.5" cy="9.5" r="3" fill="#2a2118" />
          <path d="M21 5 18 0M27 5l3-5" stroke="#3f6b1e" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
      {level === 'hornet' && (
        <>
          <ellipse cx="11" cy="21" rx="11" ry="5" transform="rotate(-24 11 21)" fill="rgba(255,255,255,.75)" stroke="#8a8f84" />
          <ellipse cx="37" cy="21" rx="11" ry="5" transform="rotate(24 37 21)" fill="rgba(255,255,255,.75)" stroke="#8a8f84" />
          <path d="M24 46 20 40h8z" fill="#1c1a17" />
          <ellipse cx="24" cy="31" rx="8.5" ry="11" fill="#e9b12c" />
          <path d="M16.5 27h15M16 32h16M18 37h12" stroke="#1c1a17" strokeWidth="3" />
          <ellipse cx="24" cy="18" rx="6.5" ry="5.5" fill="#1c1a17" />
          <circle cx="24" cy="9.5" r="5.5" fill="#e9b12c" />
          <path d="M20 8l3 2M28 8l-3 2" stroke="#1c1a17" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M21 5 17 0M27 5l4-5" stroke="#1c1a17" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
