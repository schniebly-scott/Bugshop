import { type GameSettings, SETTINGS_OPTIONS } from '@bugshop/protocol';

/** Pick a game's coin rate and Squish price from the preset values. */
export function SettingsForm({ value, onChange }: { value: GameSettings; onChange(s: GameSettings): void }) {
  const group = (k: keyof GameSettings, label: string, format: (v: number) => string) => (
    <div className="setting" role="radiogroup" aria-label={label}>
      <span className="setting-label">{label}</span>
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
    </div>
  );

  return (
    <fieldset className="settings">
      <legend>Game settings</legend>
      {group('secondsPerCoin', 'Opponent time per seed', v => `${v}s`)}
      {group('squishPrice', 'Squish price', v => `${v} seeds`)}
    </fieldset>
  );
}
