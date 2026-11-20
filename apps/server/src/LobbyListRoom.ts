import { type AuthContext, type Client, Room, ServerError, matchMaker, subscribeLobby } from '@colyseus/core';
import { type LobbyListing, type OnlineCount, Msg, ROOM_NAME } from '@bugshop/protocol';
import { type LobbyMetadata, BugshopRoom } from './BugshopRoom.ts';

/**
 * Live list of open public lobbies. Visitors only receive data; they cannot
 * send anything (any message disconnects them). Colyseus' built-in LobbyRoom
 * isn't used because it also lists full games and sends internal room records.
 */
/** Who a visitor is, for counting people rather than tabs. Never sent anywhere. */
interface Visitor {
  userId: string | null;
}

export class LobbyListRoom extends Room {
  /** List rooms in this process (normally one). */
  private static live = new Set<LobbyListRoom>();

  /**
   * How many people are online. A signed-in person counts once, however many
   * tabs or games they have open; a visitor who isn't signed in counts per tab.
   * Finished games don't count (see BugshopRoom.presence). Counts only.
   */
  static countOnline(): OnlineCount {
    const people = new Set<string>();
    const playing = new Set<string>();
    let guests = 0;
    for (const p of BugshopRoom.presence()) {
      people.add(p.userId);
      if (p.playing) playing.add(p.userId);
    }
    for (const room of LobbyListRoom.live) {
      for (const client of room.clients) {
        const userId = (client.auth as Visitor | undefined)?.userId;
        if (userId) people.add(userId);
        else guests++;
      }
    }
    return { online: people.size + guests, playing: playing.size };
  }

  maxClients = 1000;
  maxMessagesPerSecond = 2;

  private unsubscribe: (() => void) | undefined;
  private pending: ReturnType<typeof setTimeout> | undefined;
  private pendingCount: ReturnType<typeof setTimeout> | undefined;
  private lastCount: OnlineCount | undefined;

  static async onAuth(_token: string, options: unknown, context: AuthContext): Promise<Visitor> {
    // Same per-IP limit and origin check as games, but no sign-in: anyone may
    // look at the noticeboard. No options accepted.
    BugshopRoom.checkRequest(context);
    if (options && typeof options === 'object' && Object.keys(options).length > 0) {
      throw new ServerError(400, 'Invalid options.');
    }
    // A signed-in visitor is recognised only so they count once in the online count.
    return { userId: await BugshopRoom.visitor(context.headers) };
  }

  async onCreate() {
    // Keep this room itself out of listings.
    (this as unknown as { _listing: { unlisted: boolean } })._listing.unlisted = true;
    this.unsubscribe = await subscribeLobby(() => this.scheduleBroadcast());
    this.clock.setInterval(() => this.scheduleCount(), 10_000);
    LobbyListRoom.live.add(this);
    BugshopRoom.onPresenceChange = () => LobbyListRoom.live.forEach(r => r.scheduleCount());
  }

  async onJoin(client: Client) {
    client.send(Msg.lobbies, await this.listOpenLobbies());
    client.send(Msg.online, LobbyListRoom.countOnline());
    // Visitors arriving and leaving change the count too; the next check picks it up.
    this.scheduleCount();
  }

  onLeave() {
    this.scheduleCount();
  }

  onDispose() {
    LobbyListRoom.live.delete(this);
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
      const count = LobbyListRoom.countOnline();
      if (count.online === this.lastCount?.online && count.playing === this.lastCount.playing) return;
      this.lastCount = count;
      this.broadcast(Msg.online, count);
    }, 1000);
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
