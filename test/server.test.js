import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app/server.js";

async function start(haloClient) {
  const app = createApp({
    dbPath: ":memory:",
    webhookSecret: "hook",
    accessKey: "k",
    haloClient,
  });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { app, base, close: () => app.server.close() };
}

const json = (body, headers = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

test("webhook requires secret; UI/API require access key", async () => {
  const { base, close } = await start({
    enabled: false,
    pushEvent: async () => false,
  });
  try {
    assert.equal(
      (await fetch(`${base}/webhook/halo`, json({ ticket_id: 5 }))).status,
      401,
    );
    const ok = await fetch(
      `${base}/webhook/halo`,
      json({ ticket_id: 5 }, { "x-webhook-secret": "hook" }),
    );
    assert.equal(ok.status, 201);
    assert.equal((await fetch(`${base}/api/jobcards`)).status, 401);
    assert.equal((await fetch(`${base}/api/jobcards?key=k`)).status, 200);
    const page = await fetch(`${base}/jobcard?ticket=5&key=k`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<title>Callout Job Card<\/title>/);
    const js = await fetch(`${base}/jobcard.js`, {
      headers: { cookie: "key=k" },
    });
    assert.match(js.headers.get("content-type"), /javascript/);
    assert.match(await js.text(), /const ticket = /);
  } finally {
    close();
  }
});

test("events push to Halo; failures are queued and retried", async () => {
  let fail = true;
  const pushed = [];
  const { base, close } = await start({
    enabled: true,
    pushEvent: async (e) => {
      if (fail) {
        throw new Error("halo down");
      }
      pushed.push(e.event);
    },
  });
  try {
    await fetch(
      `${base}/webhook/halo`,
      json({ ticket_id: 7 }, { "x-webhook-secret": "hook" }),
    );
    const r = await fetch(
      `${base}/api/jobcards/7/events?key=k`,
      json({ event: "left_office", technician: "Sam" }),
    );
    const card = await r.json();
    assert.equal(r.status, 200);
    assert.equal(card.status, "left_office");
    assert.equal(card.halo_synced, false);

    fail = false;
    const retry = await (
      await fetch(`${base}/api/sync-retry?key=k`, { method: "POST" })
    ).json();
    assert.deepEqual(retry, { retried: 1, still_failing: 0 });
    assert.deepEqual(pushed, ["left_office"]);

    const bad = await fetch(
      `${base}/api/jobcards/7/events?key=k`,
      json({ event: "closed_off" }),
    );
    assert.equal(bad.status, 409);
  } finally {
    close();
  }
});
