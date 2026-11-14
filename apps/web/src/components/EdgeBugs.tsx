import { useEffect, useRef } from 'react';
import { pointAt, trackLength } from '../bugs/path';

// Decorative bugs that crawl around the edge of the window. Everything is drawn
// procedurally on one canvas (no assets, CSP-safe): each bug follows a rounded
// track just inside the viewport, pauses, turns around, and scurries off when
// the pointer gets close. The canvas ignores pointer events and is hidden from
// assistive tech.

type Kind = 'caterpillar' | 'beetle' | 'ladybug' | 'ant';

interface Bug {
  kind: Kind;
  /** Distance from the window edge to this bug's lane. */
  inset: number;
  /** Distance along the track, in px (head position for the caterpillar). */
  s: number;
  dir: 1 | -1;
  speed: number;
  /** Walk-cycle phase (radians). */
  phase: number;
  /** Seconds of standing still left. */
  pause: number;
  /** Seconds until the next "what now?" decision. */
  think: number;
  /** Seconds of hurrying left after being startled. */
  scared: number;
  /** Remaining about-face rotation (radians), eased to 0. */
  turn: number;
  /** Caterpillar body length right now. */
  length: number;
  /** Per-bug hue variation, 0..1. */
  tint: number;
  /** Area painted last frame: x, y, w, h. */
  box: [number, number, number, number] | null;
}

interface Palette {
  caterpillar: string;
  caterpillarDark: string;
  caterpillarDot: string;
  caterpillarHead: string;
  beetle: [string, string];
  beetleDark: string;
  beetleShine: string;
  ladybug: string;
  ladybugDark: string;
  ant: string;
  leg: string;
}

const DAY: Palette = {
  caterpillar: '#7fae3a',
  caterpillarDark: '#557d24',
  caterpillarDot: '#f0d65a',
  caterpillarHead: '#c4572a',
  beetle: ['#1f6b5a', '#5a3d7a'],
  beetleDark: '#1c231c',
  beetleShine: 'rgba(255,255,255,0.45)',
  ladybug: '#cf3a2a',
  ladybugDark: '#1e1a17',
  ant: '#3a2416',
  leg: '#2a2118',
};

const NIGHT: Palette = {
  caterpillar: '#9cc956',
  caterpillarDark: '#6f9a3a',
  caterpillarDot: '#f6e27a',
  caterpillarHead: '#e0764a',
  beetle: ['#4fb59a', '#9a7ad0'],
  beetleDark: '#c9d6c0',
  beetleShine: 'rgba(255,255,255,0.5)',
  ladybug: '#e8594a',
  ladybugDark: '#f1e6d2',
  ant: '#d2a273',
  leg: '#c7b89c',
};

const KINDS: Kind[] = ['caterpillar', 'beetle', 'ant', 'ladybug', 'caterpillar', 'ant', 'beetle', 'ladybug'];
const SPEED: Record<Kind, number> = { caterpillar: 0, beetle: 20, ladybug: 15, ant: 38 };
const CORNER = 28;
const CATERPILLAR_LEN = 30;
const CATERPILLAR_SEGMENTS = 9;
const TAU = Math.PI * 2;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const makeBug = (kind: Kind, i: number, total: number, perimeter: number): Bug => ({
  kind,
  inset: 8 + (i % 3) * 3,
  s: (perimeter * (i + rand(0.15, 0.85))) / total,
  dir: Math.random() < 0.5 ? 1 : -1,
  speed: SPEED[kind] * rand(0.8, 1.2),
  phase: rand(0, TAU),
  pause: 0,
  think: rand(2, 8),
  scared: 0,
  turn: 0,
  length: CATERPILLAR_LEN,
  tint: Math.random(),
  box: null,
});

export function EdgeBugs() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    let w = 0;
    let h = 0;
    let bugs: Bug[] = [];
    let pointer: { x: number; y: number } | null = null;
    let raf = 0;
    let last = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = document.documentElement.clientWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const perimeter = trackLength(w, h, 10, CORNER);
      const count = Math.max(3, Math.min(KINDS.length, Math.round(perimeter / 620)));
      if (bugs.length !== count) bugs = Array.from({ length: count }, (_, i) => makeBug(KINDS[i]!, i, count, perimeter));
      for (const b of bugs) b.box = null; // resizing cleared the canvas
      if (reducedMotion.matches) draw(0);
    };

    const at = (b: Bug, s: number) => pointAt(s, w, h, b.inset, CORNER);

    const step = (b: Bug, dt: number) => {
      const here = at(b, b.s);
      if (pointer && Math.hypot(pointer.x - here.x, pointer.y - here.y) < 64) {
        b.scared = 1.4;
        b.pause = 0;
      }
      b.scared = Math.max(0, b.scared - dt);
      b.turn *= Math.exp(-dt * 9);
      const hurry = b.scared > 0 ? 3 : 1;

      b.think -= dt;
      if (b.think <= 0 && b.scared === 0) {
        b.think = rand(4, 11);
        const roll = Math.random();
        if (roll < 0.5) b.pause = rand(0.8, 3);
        else if (roll < 0.68) {
          // About-face. The caterpillar swaps ends; the others spin on the spot.
          if (b.kind === 'caterpillar') b.s -= b.dir * b.length;
          else b.turn = Math.PI;
          b.dir = b.dir === 1 ? -1 : 1;
        }
      }
      if (b.pause > 0) {
        b.pause -= dt;
        return;
      }

      if (b.kind === 'caterpillar') {
        // Inchworm: stretch out with the tail planted, then pull the tail up
        // with the head planted. The head only advances while stretching.
        b.phase += dt * 6.5 * hurry;
        const next = CATERPILLAR_LEN * (0.8 + 0.2 * Math.cos(b.phase));
        if (next > b.length) b.s += b.dir * (next - b.length);
        b.length = next;
      } else {
        b.s += b.dir * b.speed * hurry * dt;
        b.phase += dt * b.speed * hurry * 0.55;
      }
    };

    const paint = (b: Bug, colors: Palette) => {
      const p = at(b, b.s);
      const heading = p.angle + (b.dir === 1 ? 0 : Math.PI) + b.turn;
      const idle = b.pause > 0;

      if (b.kind === 'caterpillar') {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < CATERPILLAR_SEGMENTS; i++) {
          const q = at(b, b.s - (b.dir * b.length * i) / (CATERPILLAR_SEGMENTS - 1));
          const ripple = Math.sin(b.phase * 0.5 - i * 0.9) * 1.1 * Math.sin((Math.PI * i) / (CATERPILLAR_SEGMENTS - 1));
          pts.push({ x: q.x - Math.sin(q.angle) * ripple, y: q.y + Math.cos(q.angle) * ripple });
        }
        ctx.lineCap = 'round';
        for (let i = CATERPILLAR_SEGMENTS - 1; i >= 0; i--) {
          const q = pts[i]!;
          const radius = i === 0 ? 3.1 : 3.3 - 0.9 * (i / (CATERPILLAR_SEGMENTS - 1)) ** 2;
          ctx.beginPath();
          ctx.arc(q.x, q.y, radius, 0, TAU);
          ctx.fillStyle = i === 0 ? colors.caterpillarHead : i % 2 ? colors.caterpillar : colors.caterpillarDark;
          ctx.fill();
          if (i > 0 && i % 2 === 1) {
            ctx.beginPath();
            ctx.arc(q.x, q.y, 0.9, 0, TAU);
            ctx.fillStyle = colors.caterpillarDot;
            ctx.fill();
          }
        }
        // Antennae on the head.
        const head = pts[0]!;
        const wiggle = Math.sin(b.phase * (idle ? 0.3 : 1)) * 0.25;
        ctx.strokeStyle = colors.leg;
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        for (const side of [-1, 1]) {
          const a = heading + side * (0.55 + wiggle);
          ctx.moveTo(head.x + Math.cos(a) * 2.5, head.y + Math.sin(a) * 2.5);
          ctx.lineTo(head.x + Math.cos(a) * 6.5, head.y + Math.sin(a) * 6.5);
        }
        ctx.stroke();
        return;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(heading);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Six legs in an alternating tripod gait.
      const ant = b.kind === 'ant';
      const reach = ant ? 5.2 : 6.6;
      ctx.strokeStyle = colors.leg;
      ctx.lineWidth = ant ? 0.8 : 1;
      ctx.beginPath();
      for (let pair = -1; pair <= 1; pair++) {
        for (const side of [-1, 1]) {
          const swing = Math.sin(b.phase + ((pair + (side + 1) / 2) % 2 === 0 ? 0 : Math.PI)) * (idle ? 0 : 1.8);
          const hipX = pair * (ant ? 1.3 : 2.6);
          ctx.moveTo(hipX, side * 1.5);
          ctx.lineTo(hipX + pair * 1.4 + swing * 0.4, side * reach * 0.62);
          ctx.lineTo(hipX + pair * 2.6 + swing, side * reach);
        }
      }
      ctx.stroke();

      // Antennae twitch faster when standing still, "sniffing".
      const twitch = Math.sin(performance.now() / (idle ? 90 : 220) + b.tint * 9) * 0.22;
      const headX = ant ? 3.6 : b.kind === 'ladybug' ? 5.2 : 6.6;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const side of [-1, 1]) {
        ctx.moveTo(headX + 0.8, side * 0.7);
        ctx.quadraticCurveTo(headX + 2.6, side * (1.6 + twitch), headX + 4, side * (2.9 + twitch * 3));
      }
      ctx.stroke();

      const blob = (x: number, y: number, rx: number, ry: number, fill: string) => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
        ctx.fillStyle = fill;
        ctx.fill();
      };

      if (ant) {
        blob(-3.9, 0, 3, 2.1, colors.ant);
        blob(0, 0, 1.9, 1.3, colors.ant);
        blob(3.4, 0, 1.6, 1.5, colors.ant);
      } else if (b.kind === 'ladybug') {
        blob(4.6, 0, 1.7, 2.1, colors.ladybugDark); // head
        blob(0, 0, 5, 4.5, colors.ladybug); // wing cases
        blob(3.9, 0, 1.5, 3.1, colors.ladybugDark); // pronotum
        ctx.strokeStyle = colors.ladybugDark;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(3, 0);
        ctx.stroke();
        for (const [x, y] of [[-2.4, 2.3], [-2.4, -2.3], [0.8, 2.6], [0.8, -2.6], [-3.9, 0.9], [-3.9, -0.9]] as const) {
          blob(x, y, 0.95, 0.95, colors.ladybugDark);
        }
      } else {
        const shell = colors.beetle[b.tint < 0.5 ? 0 : 1];
        blob(6.4, 0, 1.7, 1.6, colors.beetleDark); // head
        blob(3.9, 0, 2.4, 3.3, colors.beetleDark); // pronotum
        blob(-1.6, 0, 5.6, 4.1, shell); // wing cases
        ctx.strokeStyle = colors.beetleDark;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-7, 0);
        ctx.lineTo(2.4, 0);
        ctx.stroke();
        ctx.strokeStyle = colors.beetleShine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-4.4, -2.2);
        ctx.quadraticCurveTo(-1.5, -3, 1, -2.1);
        ctx.stroke();
      }
      ctx.restore();
    };

    const draw = (dt: number) => {
      const colors = darkScheme.matches ? NIGHT : DAY;
      for (const b of bugs) {
        if (b.box) ctx.clearRect(...b.box);
        if (dt > 0) step(b, dt);
      }
      for (const b of bugs) {
        paint(b, colors);
        const p = at(b, b.s);
        if (b.kind === 'caterpillar') {
          const tail = at(b, b.s - b.dir * b.length);
          const pad = 9;
          b.box = [
            Math.min(p.x, tail.x) - pad,
            Math.min(p.y, tail.y) - pad,
            Math.abs(p.x - tail.x) + pad * 2,
            Math.abs(p.y - tail.y) + pad * 2,
          ];
        } else b.box = [p.x - 14, p.y - 14, 28, 28];
      }
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      draw(dt);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      if (reducedMotion.matches) {
        draw(0); // a still life: bugs sit where they are
        return;
      }
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
    };
    const onPointerGone = () => {
      pointer = null;
    };
    const repaint = () => {
      if (reducedMotion.matches) draw(0);
    };

    resize();
    start();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerGone);
    reducedMotion.addEventListener('change', start);
    darkScheme.addEventListener('change', repaint);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerGone);
      reducedMotion.removeEventListener('change', start);
      darkScheme.removeEventListener('change', repaint);
    };
  }, []);

  return <canvas ref={ref} className="edge-bugs" aria-hidden="true" />;
}
