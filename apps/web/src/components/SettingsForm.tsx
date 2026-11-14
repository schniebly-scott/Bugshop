import type { ReactNode } from 'react';
import { type GameSettings, SETTINGS_OPTIONS } from '@bugshop/protocol';
import { SeedIcon, ShoeIcon } from './icons';

/** Pick a game's coin rate and Squish price from the preset values. */
export function SettingsForm({ value, onChange }: { value: GameSettings; onChange(s: GameSettings): void }) {
  const group = (k: keyof GameSettings, icon: ReactNode, label: string, format: (v: number) => string, help: string) => (
    <div className="setting" role="radiogroup" aria-label={label}>
      <span className="setting-label">
        {icon} {label}
      </span>
      <div className="setting-options">
        {SETTINGS_OPTIONS[k].map(v => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value[k] === v}
            className={`setting-option ${value[k] === v ? 'chosen' : ''}`}
            onClick={() => onChange({ ...value, [k]: v })}
          >
            {format(v)}
          </button>
        ))}
      </div>
      <p className="setting-help">{help}</p>
    </div>
  );

  return (
    <div className="settings">
      {group(
        'secondsPerCoin',
        <SeedIcon />,
        'Seed rate',
        v => `${v}s`,
        `You earn 1 seed for every ${value.secondsPerCoin} seconds your opponent spends thinking.`,
      )}
      {group(
        'squishPrice',
        <ShoeIcon />,
        'Squish price',
        v => `${v}`,
        `Save up ${value.squishPrice} seeds and you can squish your opponent to win on the spot.`,
      )}
    </div>
  );
}
