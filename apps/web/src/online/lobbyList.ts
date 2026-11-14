import { useEffect, useState } from 'react';
import { Client } from '@colyseus/sdk';
import { type LobbyListing, LOBBY_LIST_ROOM_NAME, Msg } from '@bugshop/protocol';
import { SERVER_URL } from './session';

export type LobbyListState =
  | { status: 'connecting' }
  | { status: 'live'; lobbies: LobbyListing[] }
  | { status: 'offline' };

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
        room.onMessage(Msg.lobbies, (lobbies: LobbyListing[]) => setState({ status: 'live', lobbies }));
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
