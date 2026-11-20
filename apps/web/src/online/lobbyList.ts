import { useEffect, useState } from 'react';
import { Client } from '@colyseus/sdk';
import { type LobbyListing, type OnlineCount, LOBBY_LIST_ROOM_NAME, Msg } from '@bugshop/protocol';
import { SERVER_URL } from './session';
import { ROOM_ID_PATTERN } from '../router';

export type LobbyListState =
  | { status: 'connecting' }
  | { status: 'live'; lobbies: LobbyListing[] }
  | { status: 'offline' };

/** The list comes over the network: keep only entries shaped the way the UI expects. */
const parseLobbies = (data: unknown): LobbyListing[] =>
  Array.isArray(data)
    ? (data as LobbyListing[]).filter(
        l =>
          typeof l?.roomId === 'string' &&
          ROOM_ID_PATTERN.test(l.roomId) &&
          typeof l.createdAt === 'number' &&
          typeof l.settings?.secondsPerCoin === 'number' &&
          typeof l.settings.squishPrice === 'number' &&
          typeof l.host?.name === 'string' &&
          typeof l.host.rating === 'number',
      )
    : [];

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e7;

/** Counts from the server: two small non-negative integers, or nothing. */
export const parseOnlineCount = (data: unknown): OnlineCount | null => {
  const d = data as Partial<OnlineCount> | null;
  return d && isCount(d.online) && isCount(d.playing) && d.playing <= d.online ? { online: d.online, playing: d.playing } : null;
};

/** Live list of open public lobbies, plus how many people are online, while the component is mounted. */
export const useLobbyList = (): { lobbies: LobbyListState; online: OnlineCount | null } => {
  const [state, setState] = useState<LobbyListState>({ status: 'connecting' });
  const [online, setOnline] = useState<OnlineCount | null>(null);

  useEffect(() => {
    let cancelled = false;
    let leave: (() => void) | undefined;

    new Client(SERVER_URL)
      .joinOrCreate(LOBBY_LIST_ROOM_NAME)
      .then(room => {
        leave = () => void room.leave().catch(() => undefined);
        if (cancelled) return leave();
        room.onMessage(Msg.lobbies, (lobbies: unknown) => setState({ status: 'live', lobbies: parseLobbies(lobbies) }));
        room.onMessage(Msg.online, (count: unknown) => setOnline(parseOnlineCount(count)));
        room.onLeave(() => {
          if (cancelled) return;
          setState({ status: 'offline' });
          setOnline(null);
        });
      })
      .catch(() => !cancelled && setState({ status: 'offline' }));

    return () => {
      cancelled = true;
      leave?.();
    };
  }, []);

  return { lobbies: state, online };
};
