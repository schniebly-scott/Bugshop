import { type AuthContext, type Client, Room, ServerError, matchMaker, subscribeLobby } from '@colyseus/core';
import { type LobbyListing, type OnlineCount, LOBBY_LIST_ROOM_NAME, Msg, ROOM_NAME } from '@bugshop/protocol';
import { type LobbyMetadata, BugshopRoom } from './BugshopRoom.ts';

/**
 * Live list of open public lobbies. Visitors only receive data; they cannot
 * send anything (any message disconnects them). Colyseus' built-in LobbyRoom
 * isn't used because it also lists full games and sends internal room records.
 */
export class LobbyListRoom extends Room {
  maxClients = 1000;
  maxMessagesPerSecond = 2;

  private unsubscribe: (() => void) | undefined;
  private pending: ReturnType<typeof setTimeout> | undefined;
  private pendingCount: ReturnType<typeof setTimeout> | undefined;
  private lastCount: OnlineCount | undefined;

  static async onAuth(_token: string, options: unknown, context: AuthContext) {
    // Same per-IP limit and origin check as games, but no sign-in: anyone may
    // look at the noticeboard. No options accepted.
    BugshopRoom.checkRequest(context);
    if (options && typeof options === 'object' && Object.keys(options).length > 0) {
      throw new ServerError(400, 'Invalid options.');
    }
    return true;
  }

  async onCreate() {
    // Keep this room itself out of listings.
    (this as unknown as { _listing: { unlisted: boolean } })._listing.unlisted = true;
    this.unsubscribe = await subscribeLobby(() => this.scheduleBroadcast());
    this.clock.setInterval(() => this.scheduleCount(), 10_000);
  }

  async onJoin(client: Client) {
    client.send(Msg.lobbies, await this.listOpenLobbies());
    client.send(Msg.online, await this.countOnline());
    // Visitors arriving and leaving change the count too; the next check picks it up.
    this.scheduleCount();
  }

  onLeave() {
    this.scheduleCount();
  }

  onDispose() {
    this.unsubscribe?.();
    clearTimeout(this.pending);
    clearTimeout(this.pendingCount);
  }

  /** Coalesce bursts of room changes into one update per 250 ms. */
  private scheduleBroadcast() {
    this.scheduleCount();
    if (this.pending) return;
    this.pending = setTimeout(async () => {
      this.pending = undefined;
      this.broadcast(Msg.lobbies, await this.listOpenLobbies());
    }, 250);
  }

  /**
   * Re-count at most once a second, and send the count only when it changed.
   * Joins and leaves inside game rooms don't always reach the lobby
   * subscription, so a slow periodic check (see onCreate) backs this up.
   */
  private scheduleCount() {
    if (this.pendingCount) return;
    this.pendingCount = setTimeout(async () => {
      this.pendingCount = undefined;
      const count = await this.countOnline();
      if (count.online === this.lastCount?.online && count.playing === this.lastCount.playing) return;
      this.lastCount = count;
      this.broadcast(Msg.online, count);
    }, 1000);
  }

  /** Aggregate counts only: nothing about who is connected. */
  private async countOnline(): Promise<OnlineCount> {
    const [games, lists] = await Promise.all([
      matchMaker.query({ name: ROOM_NAME }),
      matchMaker.query({ name: LOBBY_LIST_ROOM_NAME }),
    ]);
    // A game room locks once both players are seated (see BugshopRoom).
    const playing = games.reduce((n, r) => n + (r.locked ? r.clients : 0), 0);
    const inGames = games.reduce((n, r) => n + r.clients, 0);
    const browsing = lists.reduce((n, r) => n + r.clients, 0);
    return { online: inGames + browsing, playing };
  }

  private async listOpenLobbies(): Promise<LobbyListing[]> {
    const rooms = await matchMaker.query({ name: ROOM_NAME, private: false, locked: false });
    return rooms
      .filter(r => r.clients > 0 && r.clients < r.maxClients && (r.metadata as LobbyMetadata | undefined)?.host)
      .map(r => {
        const m = r.metadata as LobbyMetadata;
        return {
          roomId: r.roomId,
          settings: { secondsPerCoin: m.secondsPerCoin, squishPrice: m.squishPrice },
          host: { name: m.host.name, rating: m.host.rating },
          createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt);
  }
}
