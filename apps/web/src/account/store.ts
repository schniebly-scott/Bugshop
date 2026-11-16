import { useSyncExternalStore } from 'react';
import type { AccountInfo, AuthProviders, PlayerRecord } from '@bugshop/protocol';
import { api } from './api';

/**
 * - `loading`: asking the server who we are.
 * - `guest`: not signed in.
 * - `unnamed`: signed in, but no player name chosen yet (can't play).
 * - `ready`: signed in with a player name.
 * - `offline`: the game server can't be reached.
 */
export type AccountState =
  | { status: 'loading' | 'guest' | 'offline' }
  | { status: 'unnamed'; email: string }
  | { status: 'ready'; email: string; player: PlayerRecord };

let state: AccountState = { status: 'loading' };
let providers: AuthProviders | undefined;
let started = false;
const listeners = new Set<() => void>();

const set = (next: AccountState) => {
  state = next;
  listeners.forEach(l => l());
};

const fromAccount = (account: AccountInfo | null | undefined): AccountState =>
  account === undefined
    ? { status: 'offline' }
    : account === null
      ? { status: 'guest' }
      : account.player
        ? { status: 'ready', email: account.email, player: account.player }
        : { status: 'unnamed', email: account.email };

export const accountStore = {
  getState: () => state,
  getProviders: () => providers,
  subscribe(l: () => void) {
    listeners.add(l);
    if (!started) {
      started = true;
      void accountStore.refresh();
      void api.providers().then(p => {
        providers = p;
        listeners.forEach(x => x());
      });
    }
    return () => void listeners.delete(l);
  },
  /** Ask the server again (after signing in or out, or when a rated game ends). */
  async refresh() {
    set(fromAccount(await api.me()));
  },
  setAccount(account: AccountInfo) {
    set(fromAccount(account));
  },
  async signOut() {
    await api.signOut();
    set({ status: 'guest' });
  },
};

export const useAccount = (): AccountState => useSyncExternalStore(accountStore.subscribe, accountStore.getState);
export const useProviders = (): AuthProviders | undefined => useSyncExternalStore(accountStore.subscribe, accountStore.getProviders);
