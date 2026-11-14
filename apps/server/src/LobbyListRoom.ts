import { type AuthContext, type Client, Room, ServerError, matchMaker, subscribeLobby } from '@colyseus/core';
import { type GameSettings, type LobbyListing, Msg, ROOM_NAME } from '@bugshop/protocol';
import { BugshopRoom } from './BugshopRoom.ts';

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

  static async onAuth(token: string, options: unknown, context: AuthContext) {
    // Same per-IP matchmaking limit as games; no options accepted.
    await BugshopRoom.onAuth(token, {}, context);
    if (options && typeof options === 'object' && Object.keys(options).length > 0) {
      throw new ServerError(400, 'Invalid options.');
    }
    return true;
  }

  async onCreate() {
    // Keep this room itself out of listings.
    (this as unknown as { _listing: { unlisted: boolean } })._listing.unlisted = true;
    this.unsubscribe = await subscribeLobby(() => this.scheduleBroadcast());
  }

  async onJoin(client: Client) {
    client.send(Msg.lobbies, await this.listOpenLobbies());
  }

  onDispose() {
    this.unsubscribe?.();
    clearTimeout(this.pending);
  }

  /** Coalesce bursts of room changes into one update per 250 ms. */
  private scheduleBroadcast() {
    if (this.pending) return;
    this.pending = setTimeout(async () => {
      this.pending = undefined;
      this.broadcast(Msg.lobbies, await this.listOpenLobbies());
    }, 250);
  }

  private async listOpenLobbies(): Promise<LobbyListing[]> {
    const rooms = await matchMaker.query({ name: ROOM_NAME, private: false, locked: false });
    return rooms
      .filter(r => r.clients > 0 && r.clients < r.maxClients && r.metadata)
      .map(r => {
        const m = r.metadata as GameSettings;
        return {
          roomId: r.roomId,
          settings: { secondsPerCoin: m.secondsPerCoin, squishPrice: m.squishPrice },
          createdAt: r.createdAt ? new Date(r.createdAt).getTime() : Date.now(),
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt);
  }
}
