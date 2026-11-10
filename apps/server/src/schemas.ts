import { z } from 'zod';
import type { Action, ShopRole } from '@bugshop/rules';
import type { JoinOptions } from '@bugshop/protocol';

// Strict schemas: unknown keys are rejected, strings are length-bounded.
// Colyseus disconnects any client whose message fails validation.

const ShopRoleSchema = z.enum(['pawn', 'knight', 'bishop', 'rook', 'queen'] satisfies ShopRole[]);

/** UCI move (`e2e4`, `e7e8q`) or drop (`N@f3`). */
const UciSchema = z.string().max(5).regex(/^(?:[a-h][1-8][a-h][1-8][qrbn]?|[PNBRQ]@[a-h][1-8])$/);

export const ActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('move'), uci: UciSchema }),
  z.strictObject({ type: z.literal('buy'), role: ShopRoleSchema }),
  z.strictObject({ type: z.literal('claimVictory') }),
  z.strictObject({ type: z.literal('resign') }),
  z.strictObject({ type: z.literal('offerDraw') }),
  z.strictObject({ type: z.literal('acceptDraw') }),
  z.strictObject({ type: z.literal('declineDraw') }),
]) satisfies z.ZodType<Action>;

export const JoinOptionsSchema = z.strictObject({
  mode: z.enum(['public', 'private']).optional(),
}) satisfies z.ZodType<JoinOptions>;

/** The `time` request carries no payload. */
export const EmptySchema = z.undefined().or(z.null()).or(z.strictObject({}));
