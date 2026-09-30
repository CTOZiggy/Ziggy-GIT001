import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../app/db.js";
import { upsertFromHalo, recordEvent, getJobCard } from "../app/jobcards.js";

const fresh = () => {
  const db = openDb(":memory:");
  upsertFromHalo(db, {
    ticket_id: 1001,
    summary: "Fryer down",
    client_name: "Acme",
  });
  return db;
};

test("webhook upsert is idempotent and keeps times", () => {
  const db = fresh();
  recordEvent(db, 1001, "left_office");
  const { created } = upsertFromHalo(db, {
    ticket: { id: 1001, summary: "Fryer down v2" },
  });
  assert.equal(created, false);
  const card = getJobCard(db, 1001);
  assert.equal(card.summary, "Fryer down v2");
  assert.equal(card.status, "left_office");
  assert.ok(card.left_office_at);
});

test("steps must be recorded in order", () => {
  const db = fresh();
  assert.throws(() => recordEvent(db, 1001, "check_in"), /Cannot record/);
  recordEvent(db, 1001, "left_office");
  assert.throws(() => recordEvent(db, 1001, "left_office"), /Cannot record/);
});

test("full flow computes durations", () => {
  const db = fresh();
  const base = Date.now() - 4 * 3600_000;
  const at = (m) => new Date(base + m * 60_000).toISOString();
  recordEvent(db, 1001, "left_office", { occurredAt: at(0) });
  recordEvent(db, 1001, "check_in", { occurredAt: at(45) });
  recordEvent(db, 1001, "sign_out", { occurredAt: at(165) });
  const { card } = recordEvent(db, 1001, "closed_off", { occurredAt: at(210) });
  assert.equal(card.status, "closed");
  assert.deepEqual(card.durations, {
    travel_to_site_min: 45,
    on_site_min: 120,
    travel_back_min: 45,
    total_min: 210,
  });
});

test("rejects backwards and future times", () => {
  const db = fresh();
  recordEvent(db, 1001, "left_office");
  const past = new Date(Date.now() - 3600_000).toISOString();
  assert.throws(
    () => recordEvent(db, 1001, "check_in", { occurredAt: past }),
    /earlier/,
  );
  const future = new Date(Date.now() + 3600_000).toISOString();
  assert.throws(
    () => recordEvent(db, 1001, "check_in", { occurredAt: future }),
    /future/,
  );
});
