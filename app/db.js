import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(path) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobcards (
      ticket_id       INTEGER PRIMARY KEY,
      summary         TEXT NOT NULL DEFAULT '',
      client_name     TEXT NOT NULL DEFAULT '',
      site_name       TEXT NOT NULL DEFAULT '',
      site_address    TEXT NOT NULL DEFAULT '',
      quote_ref       TEXT NOT NULL DEFAULT '',
      technician      TEXT NOT NULL DEFAULT '',
      status          TEXT NOT NULL DEFAULT 'pending',
      left_office_at  TEXT,
      checked_in_at   TEXT,
      signed_out_at   TEXT,
      closed_at       TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id    INTEGER NOT NULL REFERENCES jobcards(ticket_id),
      event        TEXT NOT NULL,
      occurred_at  TEXT NOT NULL,
      recorded_at  TEXT NOT NULL,
      technician   TEXT NOT NULL DEFAULT '',
      lat          REAL,
      lng          REAL,
      note         TEXT NOT NULL DEFAULT '',
      halo_synced  INTEGER NOT NULL DEFAULT 0,
      halo_error   TEXT NOT NULL DEFAULT ''
    );
  `);
  return db;
}
