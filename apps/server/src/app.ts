import { defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@bugshop/protocol';
import { BugshopRoom } from './BugshopRoom.ts';
import type { Env } from './env.ts';

/** Only the matchmaking calls the web client uses. */
const EXPOSED_METHODS = ['joinOrCreate', 'create', 'joinById', 'reconnect'];

export const createGameServer = (env: Env) => {
  const allowed = new Set(env.ALLOWED_ORIGINS);
  // Non-browser clients send no Origin. Browsers always do, so a foreign Origin
  // means another website is trying to use the server through a visitor's browser.
  const originOk = (origin: string | null) => origin === null || allowed.has(origin);

  BugshopRoom.configure({ matchmakePerMinute: env.MATCHMAKE_PER_MINUTE, maxRooms: env.MAX_ROOMS });

  // Matchmaking HTTP endpoints: reflect only allowed origins (the default reflects any).
  matchMaker.controller.exposedMethods = EXPOSED_METHODS;
  // The defaults allow ANY origin with credentials. Replace them so Allow-Origin
  // and Allow-Credentials are only ever sent for allowlisted origins (below).
  // (The SDK sends matchmaking requests with credentials, so allowed origins need both.)
  matchMaker.controller.DEFAULT_CORS_HEADERS = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    // Colyseus types this object as always containing Allow-Origin/Credentials;
    // omitting them is exactly the point.
  } as typeof matchMaker.controller.DEFAULT_CORS_HEADERS;
  matchMaker.controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
    const origin = headers.get('origin');
    return origin && allowed.has(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' }
      : { Vary: 'Origin' };
  };

  return defineServer({
    greet: false,
    transport: new WebSocketTransport({
      maxPayload: 4 * 1024, // client messages are tiny; cap them
      beforeUpgrade: request =>
        originOk(request.headers.get('origin')) ? undefined : new Response('Forbidden origin', { status: 403 }),
    }),
    rooms: {
      [ROOM_NAME]: defineRoom(BugshopRoom),
    },
  });
};
