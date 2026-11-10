import { useState } from 'react';
import { type GameSettings, SETTINGS_LIMITS } from '@bugshop/protocol';

const clamp = (k: keyof GameSettings, v: number) =>
  Math.min(SETTINGS_LIMITS[k].max, Math.max(SETTINGS_LIMITS[k].min, Math.round(v)));

/** Coin rate and Claim Victory price for a new game. Always reports valid values. */
export function SettingsForm({ value, onChange }: { value: GameSettings; onChange(s: GameSettings): void }) {
  // Raw text while typing, so a half-typed number isn't clamped mid-edit.
  const [draft, setDraft] = useState<Record<keyof GameSettings, string>>({
    secondsPerCoin: String(value.secondsPerCoin),
    claimVictoryPrice: String(value.claimVictoryPrice),
  });

  const field = (k: keyof GameSettings, label: string, unit: string) => (
    <label className="setting">
      <span>{label}</span>
      <span className="setting-input">
        <input
          type="number"
          inputMode="numeric"
          min={SETTINGS_LIMITS[k].min}
          max={SETTINGS_LIMITS[k].max}
          step={1}
          value={draft[k]}
          onChange={e => {
            setDraft(d => ({ ...d, [k]: e.target.value }));
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onChange({ ...value, [k]: clamp(k, n) });
          }}
          onBlur={e => {
            // Settle the field from its own text: clamp a number, or restore the last valid value.
            const n = Number(e.target.value);
            const settled = e.target.value !== '' && Number.isFinite(n) ? clamp(k, n) : value[k];
            setDraft(d => ({ ...d, [k]: String(settled) }));
            if (settled !== value[k]) onChange({ ...value, [k]: settled });
          }}
        />
        <span className="unit">{unit}</span>
      </span>
    </label>
  );

  return (
    <fieldset className="settings">
      <legend>Game settings</legend>
      {field('secondsPerCoin', 'Opponent time per seed', 'seconds')}
      {field('claimVictoryPrice', 'Claim Victory price', 'seeds')}
    </fieldset>
  );
}
