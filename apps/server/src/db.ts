import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Color } from 'chessops';
import type { GameMode, PlayerRecord, RatingChange } from '@bugshop/protocol';
import { type Score, INITIAL_RATING, rateGame } from './elo.ts';

// SQLite through Node's built-in driver (no native dependency to build). Better
// Auth keeps its own tables (user, session, account, verification) in the same
// file; the tables here hold what is specific to Bugshop.
//
// Every query is a prepared statement with bound parameters. Never build SQL
// from strings that contain user input.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS player (
  user_id    TEXT PRIMARY KEY,
  handle     TEXT NOT NULL,
  handle_key TEXT NOT NULL UNIQUE,
  rating     INTEGER NOT NULL,
  games      INTEGER NOT NULL DEFAULT 0,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  draws      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS game_result (
  id           INTEGER PRIMARY KEY,
  white_id     TEXT NOT NULL,
  black_id     TEXT NOT NULL,
  winner       TEXT,
  status       TEXT NOT NULL,
  mode         TEXT NOT NULL,
  white_before INTEGER NOT NULL,
  white_after  INTEGER NOT NULL,
  black_before INTEGER NOT NULL,
  black_after  INTEGER NOT NULL,
  finished_at  INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS game_result_white ON game_result (white_id, finished_at);
CREATE INDEX IF NOT EXISTS game_result_black ON game_result (black_id, finished_at);
`;

/** Open (and create if needed) the database file. `:memory:` is used by tests. */
export const openDatabase = (path: string): DatabaseSync => {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
};

export interface PlayerRow extends PlayerRecord {
  userId: string;
}

export type HandleResult = { ok: true; player: PlayerRow } | { ok: false; error: 'taken' | 'already-set' };

/** Handles are unique ignoring case, so "Beetle" and "beetle" can't both exist. */
const handleKey = (handle: string) => handle.toLowerCase();

/** Player profiles (handle, rating, record) and finished rated games. */
export class PlayerStore {
  private readonly db: DatabaseSync;
  private readonly byUser;
  private readonly insert;
  private readonly update;
  private readonly insertResult;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.byUser = db.prepare(
      'SELECT user_id AS userId, handle AS name, rating, games, wins, losses, draws FROM player WHERE user_id = ?',
    );
    this.insert = db.prepare(
      'INSERT INTO player (user_id, handle, handle_key, rating, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
    );
    this.update = db.prepare(
      'UPDATE player SET rating = ?, games = games + 1, wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE user_id = ?',
    );
    this.insertResult = db.prepare(
      `INSERT INTO game_result (white_id, black_id, winner, status, mode, white_before, white_after, black_before, black_after, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
  }

  get(userId: string): PlayerRow | undefined {
    return this.byUser.get(userId) as PlayerRow | undefined;
  }

  /** Give an account its player name. A name is chosen once and is unique. */
  create(userId: string, handle: string, now: number): HandleResult {
    if (this.get(userId)) return { ok: false, error: 'already-set' };
    const { changes } = this.insert.run(userId, handle, handleKey(handle), INITIAL_RATING, now);
    const player = this.get(userId);
    return changes === 1 && player ? { ok: true, player } : { ok: false, error: 'taken' };
  }

  /**
   * Apply one finished game to both players' ratings and records, atomically.
   * Ratings are read fresh inside the transaction, so two games that end at the
   * same moment can't both start from the same old rating.
   */
  recordGame(game: {
    whiteId: string;
    blackId: string;
    winner: Color | undefined;
    status: string;
    mode: GameMode;
    now: number;
  }): Record<Color, RatingChange> | undefined {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const white = this.get(game.whiteId);
      const black = this.get(game.blackId);
      if (!white || !black) {
        this.db.exec('ROLLBACK');
        return undefined;
      }
      const score: Score = game.winner === 'white' ? 1 : game.winner === 'black' ? 0 : 0.5;
      const after = rateGame(white, black, score);
      this.update.run(after.white, score === 1 ? 1 : 0, score === 0 ? 1 : 0, score === 0.5 ? 1 : 0, white.userId);
      this.update.run(after.black, score === 0 ? 1 : 0, score === 1 ? 1 : 0, score === 0.5 ? 1 : 0, black.userId);
      this.insertResult.run(
        white.userId, black.userId, game.winner ?? null, game.status, game.mode,
        white.rating, after.white, black.rating, after.black, game.now,
      );
      this.db.exec('COMMIT');
      return {
        white: { before: white.rating, after: after.white },
        black: { before: black.rating, after: after.black },
      };
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
