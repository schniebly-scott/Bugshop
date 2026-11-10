import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Color } from 'chessops';
import type { GameSettings } from '@bugshop/protocol';
import { sessionFor } from '../online/session';
import { navigate } from '../router';
import { useNow } from '../game/useNow';
import { colorName, errorText, settingsText } from '../game/view';
import { GameView } from './GameView';
import { ConfirmButton } from './ConfirmButton';

export function OnlineGamePage({ roomId }: { roomId: string }) {
  const session = sessionFor(roomId);
  const view = useSyncExternalStore(session.subscribe, session.getView);
  const live = view.status === 'playing' || view.status === 'reconnecting';
  const now = useNow(live) + view.offsetMs;

  useEffect(() => {
    if (!view.rejection) return;
    const id = setTimeout(() => session.clearRejection(), 2500);
    return () => clearTimeout(id);
  }, [view.rejection, session]);

  if (view.status === 'error' || (view.status === 'closed' && !view.game)) {
    return (
      <main className="notice">
        <p className="error">{view.error ?? 'This game has ended.'}</p>
        <button type="button" className="primary" onClick={() => navigate('/')}>Back to start</button>
      </main>
    );
  }

  if (view.status === 'connecting' || !view.color) {
    return <main className="notice"><p>Connecting…</p></main>;
  }

  if (!view.game) {
    return (
      <WaitingRoom
        roomId={roomId}
        isPrivate={view.mode === 'private'}
        settings={view.snapshot?.settings}
        onCancel={() => session.leave().then(() => navigate('/'))}
      />
    );
  }

  const me = view.color;
  const label = (c: Color) => (c === me ? `You (${colorName(c)})` : `Opponent (${colorName(c)})`);
  const playing = view.game.status === 'playing';

  return (
    <GameView
      state={view.game}
      now={now}
      controls={view.status === 'playing' ? [me] : []}
      orientation={me}
      act={(_, action) => session.act(action)}
      message={
        view.status === 'reconnecting'
          ? 'Connection lost. Reconnecting…'
          : view.status === 'closed'
            ? (view.error ?? 'Disconnected.')
            : view.rejection && errorText(view.rejection)
      }
      label={label}
      seats={view.snapshot?.seats}
    >
      {view.snapshot?.settings && <p className="settings-summary">{settingsText(view.snapshot.settings)}</p>}
      {playing ? (
        <ConfirmButton onConfirm={() => session.leave().then(() => navigate('/'))} confirmLabel="Leaving resigns. Leave?">
          Leave game
        </ConfirmButton>
      ) : (
        <button type="button" className="primary" onClick={() => session.leave().then(() => navigate('/'))}>
          Back to start
        </button>
      )}
    </GameView>
  );
}

function WaitingRoom(props: { roomId: string; isPrivate: boolean; settings?: GameSettings; onCancel(): void }) {
  const { roomId, isPrivate, onCancel } = props;
  const link = `${location.origin}/g/${roomId}`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is still selectable */
    }
  };

  return (
    <main className="notice waiting">
      {isPrivate ? (
        <>
          <h2>Invite a friend</h2>
          <p>Send this link. The game starts when they open it.</p>
          <div className="invite">
            <input readOnly value={link} aria-label="Invite link" onFocus={e => e.currentTarget.select()} />
            <button type="button" className="primary" onClick={copy}>{copied ? 'Copied!' : 'Copy link'}</button>
          </div>
          <p className="hint">Anyone with the link can take the empty seat, so only share it with your opponent.</p>
        </>
      ) : (
        <>
          <h2>Looking for an opponent…</h2>
          <p>The game starts as soon as someone else joins.</p>
        </>
      )}
      {props.settings && <p className="settings-summary">{settingsText(props.settings)}</p>}
      <button type="button" onClick={onCancel}>Cancel</button>
    </main>
  );
}
