import { useEffect, useState } from 'react';
import type { Color } from 'chessops';
import type { GameSettings } from '@bugshop/protocol';
import { type BotLevel, BOT_LEVELS, LEVELS } from '../bot/levels';
import { loadStockfish, stockfishSupported } from '../bot/stockfish';
import { type BotGameSetup, useBotGame } from '../game/useBotGame';
import { type ColorChoice, loadBotPrefs, saveBotPrefs } from '../game/botPrefs';
import { loadSettings, saveSettings } from '../game/settingsStore';
import { useNow } from '../game/useNow';
import { colorName, errorText } from '../game/view';
import { useAccount } from '../account/store';
import { GameView } from './GameView';
import { ConfirmButton } from './ConfirmButton';
import { SettingsForm } from './SettingsForm';
import { BugIcon } from './icons';

/** Practice against the computer: pick an opponent, then play. Runs entirely in the browser. */
export function BotPage() {
  const [setup, setSetup] = useState<BotGameSetup | null>(null);
  // A new key per game gives the game hook a fresh state.
  const [gameNo, setGameNo] = useState(0);

  if (!setup) {
    return (
      <BotSetup
        onStart={s => {
          setGameNo(n => n + 1);
          setSetup(s);
        }}
      />
    );
  }
  return <BotGame key={gameNo} setup={setup} onLeave={() => setSetup(null)} />;
}

const COLOR_CHOICES: { id: ColorChoice; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'black', label: 'Black' },
  { id: 'random', label: 'Surprise me' },
];

function BotSetup({ onStart }: { onStart(setup: BotGameSetup): void }) {
  // The Stockfish levels need a browser with WebAssembly threads.
  const [engineOk] = useState(stockfishSupported);
  const usable = (id: BotLevel) => LEVELS[id].engine === 'builtin' || engineOk;
  const [prefs, setPrefs] = useState(() => {
    const saved = loadBotPrefs();
    return usable(saved.level) ? saved : { ...saved, level: 'hornet' as BotLevel };
  });
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  // Start downloading the engine as soon as one of its levels is chosen, so the first move isn't late.
  const wantsEngine = LEVELS[prefs.level].engine === 'stockfish';
  useEffect(() => {
    if (wantsEngine) void loadStockfish().catch(() => undefined);
  }, [wantsEngine]);

  const start = () => {
    saveBotPrefs(prefs);
    saveSettings(settings);
    const human: Color = prefs.color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : prefs.color;
    onStart({ level: prefs.level, human, settings });
  };

  return (
    <main className="bot-setup">
      <section className="start-panel">
        <h2>Pick a sparring partner</h2>
        <p className="bot-setup-note">
          Practice games don't change your rating. The bot plays at about your pace, so its thinking time earns you seeds just
          like a person's would.
        </p>
        <p className="bot-setup-note engine-credit">
          Scorpion and Tarantula are powered by{' '}
          <a href="https://github.com/fairy-stockfish/Fairy-Stockfish" target="_blank" rel="noopener noreferrer">
            Fairy-Stockfish
          </a>{' '}
          (GPL-3.0).
        </p>

        <div className="bot-levels" role="radiogroup" aria-label="Difficulty">
          {BOT_LEVELS.map((id, i) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={prefs.level === id}
              className={`bot-level ${prefs.level === id ? 'chosen' : ''}`}
              disabled={!usable(id)}
              onClick={() => setPrefs({ ...prefs, level: id })}
            >
              <BugIcon level={id} />
              <strong>{LEVELS[id].name}</strong>
              <span className="bot-strength" aria-label={`Difficulty ${i + 1} of ${BOT_LEVELS.length}`}>
                {BOT_LEVELS.map((_, n) => (
                  <i key={n} className={n <= i ? 'on' : ''} />
                ))}
              </span>
              <small>{usable(id) ? LEVELS[id].blurb : 'Needs a newer browser (WebAssembly threads).'}</small>
            </button>
          ))}
        </div>

        <div className="setting" role="radiogroup" aria-label="Your color">
          <span className="setting-label">You play</span>
          <div className="setting-options">
            {COLOR_CHOICES.map(c => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={prefs.color === c.id}
                className={`setting-option ${prefs.color === c.id ? 'chosen' : ''}`}
                onClick={() => setPrefs({ ...prefs, color: c.id })}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <SettingsForm value={settings} onChange={setSettings} />

        <button type="button" className="big-button primary bot-start" onClick={start}>
          Play {LEVELS[prefs.level].name}
        </button>
      </section>
    </main>
  );
}

function BotGame({ setup, onLeave }: { setup: BotGameSetup; onLeave(): void }) {
  const { state, act, lastError, clearError } = useBotGame(setup);
  const account = useAccount();
  const playing = state.status === 'playing';
  const now = useNow(playing);
  const me = setup.human;
  const botName = `${LEVELS[setup.level].name} (bot)`;
  const myName = account.status === 'ready' ? account.player.name : `You (${colorName(me)})`;

  useEffect(() => {
    if (!lastError) return;
    const id = setTimeout(clearError, 2500);
    return () => clearTimeout(id);
  }, [lastError]);

  return (
    <GameView
      state={state}
      now={now}
      controls={playing ? [me] : []}
      // The bot's pocket is as secret as a person's, until the game is over.
      revealed={playing ? [me] : ['white', 'black']}
      orientation={me}
      act={act}
      message={lastError && errorText(lastError)}
      label={c => (c === me ? myName : botName)}
      resultNote={playing ? undefined : 'Practice game: ratings are unchanged.'}
    >
      {playing ? (
        <ConfirmButton onConfirm={onLeave} confirmLabel="Abandon this game?">
          New opponent
        </ConfirmButton>
      ) : (
        <button type="button" className="primary" onClick={onLeave}>
          Play again
        </button>
      )}
    </GameView>
  );
}
