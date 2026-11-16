import { useEffect, useState } from 'react';
import { Client } from '@colyseus/sdk';
import { type LobbyListing, LOBBY_LIST_ROOM_NAME, Msg } from '@bugshop/protocol';
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

/** Live list of open public lobbies while the component is mounted. */
export const useLobbyList = (): LobbyListState => {
  const [state, setState] = useState<LobbyListState>({ status: 'connecting' });

  useEffect(() => {
    let cancelled = false;
    let leave: (() => void) | undefined;

    new Client(SERVER_URL)
      .joinOrCreate(LOBBY_LIST_ROOM_NAME)
      .then(room => {
        leave = () => void room.leave().catch(() => undefined);
        if (cancelled) return leave();
        room.onMessage(Msg.lobbies, (lobbies: unknown) => setState({ status: 'live', lobbies: parseLobbies(lobbies) }));
        room.onLeave(() => !cancelled && setState({ status: 'offline' }));
      })
      .catch(() => !cancelled && setState({ status: 'offline' }));

    return () => {
      cancelled = true;
      leave?.();
    };
  }, []);

  return state;
};
