// The forest clearing behind every page: sky, overhanging leafy branches, two
// rows of pines and a small campsite. Pure inline SVG styled from theme.css
// (day by default, night in dark mode); purely decorative.

/** Small deterministic PRNG so the foliage is the same on every render. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const LEAF = 'M0 0C.22-.36.68-.34 1 0 .68.34.22.36 0 0Z';

/** A branch reaching in from the top-left corner, leaves alternating along it. */
function Branch({ seed, className }: { seed: number; className: string }) {
  const rnd = seeded(seed);
  // Cubic Bézier stem.
  const P = [[-12, -8], [70, 26], [170, 30], [296, 116]] as const;
  const bez = (t: number, k: 0 | 1) =>
    (1 - t) ** 3 * P[0][k] + 3 * (1 - t) ** 2 * t * P[1][k] + 3 * (1 - t) * t ** 2 * P[2][k] + t ** 3 * P[3][k];
  const tangent = (t: number) => Math.atan2(bez(t + 0.01, 1) - bez(t - 0.01, 1), bez(t + 0.01, 0) - bez(t - 0.01, 0));

  const leaves: { x: number; y: number; rot: number; size: number; tone: number }[] = [];
  const steps = 13;
  for (let i = 0; i <= steps; i++) {
    const t = 0.06 + (0.94 * i) / steps;
    const side = i % 2 ? 1 : -1;
    const size = (56 - 24 * t) * (0.85 + rnd() * 0.3);
    leaves.push({
      x: bez(t, 0),
      y: bez(t, 1),
      rot: ((tangent(t) + side * (0.55 + rnd() * 0.5)) * 180) / Math.PI,
      size,
      tone: i % 3,
    });
  }
  // The tip leaf continues the stem.
  leaves.push({ x: P[3][0], y: P[3][1], rot: (tangent(0.98) * 180) / Math.PI, size: 34, tone: 1 });

  return (
    <svg className={`backdrop-branch ${className}`} viewBox="0 0 340 200" aria-hidden="true">
      <path
        className="branch-stem"
        d={`M${P[0].join(' ')}C${P[1].join(' ')} ${P[2].join(' ')} ${P[3].join(' ')}`}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x.toFixed(1)} ${l.y.toFixed(1)}) rotate(${l.rot.toFixed(1)}) scale(${l.size.toFixed(1)})`}>
          <path className={`leaf tone-${l.tone}`} d={LEAF} />
          <path className="leaf-rib" d="M0 0H.9M.3 0 .45-.14M.3 0 .45.14M.55 0 .68-.11M.55 0 .68.11" fill="none" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
    </svg>
  );
}

/** Silhouette of one pine: a trunk and stacked boughs. */
const pine = (x: number, base: number, height: number, width: number): string => {
  const tiers = 4;
  let d = `M${x - 3} ${base}V${base - height * 0.3}H${x + 3}V${base}Z`;
  for (let k = 0; k < tiers; k++) {
    const top = base - height + k * height * 0.19;
    const bottom = top + height * 0.36;
    const half = (width / 2) * (0.4 + (0.6 * (k + 1)) / tiers);
    d += `M${x} ${top}L${x - half} ${bottom}H${x + half}Z`;
  }
  return d;
};

const FAR_PINES: [number, number, number][] = [
  [34, 112, 44], [86, 150, 54], [140, 96, 40], [204, 138, 52], [262, 162, 58], [330, 104, 42], [392, 142, 52], [446, 118, 46],
];
const NEAR_PINES: [number, number, number][] = [
  [52, 176, 78], [158, 124, 60], [244, 196, 84], [352, 146, 66], [446, 182, 80], [560, 132, 62],
];

export function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="backdrop-sky" />
      <Branch seed={7} className="left" />
      <Branch seed={23} className="right" />

      <svg className="backdrop-pines" width="100%" height="240">
        <defs>
          <pattern id="pines-far" width="480" height="240" patternUnits="userSpaceOnUse">
            <path className="pine-far" d={`M0 196Q120 180 240 196T480 196V240H0Z${FAR_PINES.map(([x, h, w]) => pine(x, 200, h, w)).join('')}`} />
          </pattern>
          <pattern id="pines-near" width="620" height="240" patternUnits="userSpaceOnUse">
            <path className="pine-near" d={`M0 222Q155 210 310 222T620 222V240H0Z${NEAR_PINES.map(([x, h, w]) => pine(x, 228, h, w)).join('')}`} />
          </pattern>
        </defs>
        <rect width="100%" height="240" fill="url(#pines-far)" />
        <rect width="100%" height="240" fill="url(#pines-near)" />
      </svg>

      <svg className="backdrop-camp" viewBox="0 0 240 120" aria-hidden="true">
        <defs>
          <radialGradient id="fire-glow">
            <stop offset="0" stopColor="#ffc35a" stopOpacity=".75" />
            <stop offset="1" stopColor="#ffc35a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* tent */}
        <path className="tent-side" d="M66 30 132 40 166 104H108Z" />
        <path className="tent-front" d="M22 104 66 30 108 104Z" />
        <path className="tent-door" d="M66 52 50 104H80Z" />
        <path className="tent-pole" d="M66 30V22M22 104l-8 4M108 104l8 4" fill="none" strokeWidth="2" strokeLinecap="round" />
        {/* campfire */}
        <circle className="fire-glow" cx="204" cy="92" r="34" fill="url(#fire-glow)" />
        <path className="fire-log" d="M186 106 222 98M186 98 222 106" fill="none" strokeWidth="5" strokeLinecap="round" />
        <path className="flame flame-outer" d="M204 100c-10-3-11-13-5-20 1 5 4 5 4 0 0-6 3-10 7-13-1 7 9 13 5 24-1 5-6 9-11 9Z" />
        <path className="flame flame-inner" d="M204 100c-5-2-5-8-2-12 1 3 3 2 3-1 4 3 6 9 3 12-1 1-3 1-4 1Z" />
      </svg>

      <div className="fireflies">
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
    </div>
  );
}
