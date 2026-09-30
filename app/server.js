/* eslint-disable no-console */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { openDb } from "./db.js";
import { createHaloClient } from "./halo.js";
import {
  JobCardError,
  EVENTS,
  EVENT_LABELS,
  upsertFromHalo,
  getJobCard,
  listJobCards,
  listEvents,
  recordEvent,
  markSynced,
  unsyncedEvents,
} from "./jobcards.js";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "public");
const PAGES = { "/": "index.html", "/jobcard": "jobcard.html" };
const ASSETS = {
  "/app.css": "text/css",
  "/jobcard.js": "text/javascript",
  "/index.js": "text/javascript",
};

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function parseCookies(header = "") {
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim().split("="))
      .filter((p) => p[0])
      .map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]),
  );
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 100_000) {
      throw new JobCardError("Body too large", 413);
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    throw new JobCardError("Invalid JSON");
  }
}

export function createApp(overrides = {}) {
  const config = loadConfig(overrides);
  const db = openDb(config.dbPath);
  const halo = overrides.haloClient ?? createHaloClient(config);

  async function syncEvent(row) {
    try {
      await halo.pushEvent(row);
      markSynced(db, row.id);
    } catch (err) {
      markSynced(db, row.id, String(err.message));
    }
  }

  function isAuthed(req, url) {
    if (!config.accessKey) {
      return true;
    }
    const supplied =
      url.searchParams.get("key") ?? parseCookies(req.headers.cookie).key ?? "";
    return safeEqual(supplied, config.accessKey);
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;
    const send = (status, body, headers = {}) => {
      const isJson = typeof body === "object" && !Buffer.isBuffer(body);
      res.writeHead(status, {
        "content-type": isJson ? "application/json" : "text/plain",
        "cache-control": "no-store",
        ...headers,
      });
      res.end(isJson ? JSON.stringify(body) : body);
    };

    if (path === "/healthz") {
      return send(200, { ok: true, halo: halo.enabled });
    }

    // Halo -> app: fired by the ticket-type workflow. Uses its own shared secret.
    if (path === "/webhook/halo" && req.method === "POST") {
      const supplied = String(req.headers["x-webhook-secret"] ?? "");
      if (!config.webhookSecret || !safeEqual(supplied, config.webhookSecret)) {
        return send(401, { error: "Unauthorized" });
      }
      const { card, created } = upsertFromHalo(db, await readJson(req));
      return send(created ? 201 : 200, { ticket_id: card.ticket_id, created });
    }

    // Everything below is for people: require the access key.
    if (!isAuthed(req, url)) {
      return send(
        401,
        "Unauthorized. Open the link from Halo (it includes ?key=...).",
      );
    }
    const cookie =
      config.accessKey && url.searchParams.has("key")
        ? {
            "set-cookie": `key=${encodeURIComponent(config.accessKey)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`,
          }
        : {};

    if (req.method === "GET" && (PAGES[path] || ASSETS[path])) {
      const file = PAGES[path] ?? path.slice(1);
      const type = PAGES[path] ? "text/html; charset=utf-8" : ASSETS[path];
      const body = await readFile(join(publicDir, file));
      return send(200, body, { "content-type": type, ...cookie });
    }

    if (path === "/api/jobcards" && req.method === "GET") {
      return send(
        200,
        listJobCards(db, {
          status: url.searchParams.get("status") || undefined,
        }),
      );
    }

    // GET /api/jobcards/:ticketId  and  POST /api/jobcards/:ticketId/events
    const m = path.match(/^\/api\/jobcards\/(\d+)(\/events)?$/);
    if (m) {
      const ticketId = Number(m[1]);
      if (!m[2] && req.method === "GET") {
        const card = getJobCard(db, ticketId);
        return card
          ? send(200, {
              ...card,
              events: listEvents(db, ticketId),
              labels: EVENT_LABELS,
            })
          : send(404, { error: "Job card not found" });
      }
      if (m[2] && req.method === "POST") {
        const body = await readJson(req);
        const { card, eventId } = recordEvent(db, ticketId, body.event, {
          technician: body.technician,
          occurredAt: body.occurred_at,
          lat: Number(body.lat ?? NaN),
          lng: Number(body.lng ?? NaN),
          note: body.note,
        });
        const row = listEvents(db, ticketId).find((e) => e.id === eventId);
        await syncEvent(row); // never throws; failures are queued for retry
        return send(200, {
          ...card,
          halo_synced: Boolean(
            listEvents(db, ticketId).find((e) => e.id === eventId).halo_synced,
          ),
        });
      }
    }

    if (path === "/api/sync-retry" && req.method === "POST") {
      const pending = unsyncedEvents(db);
      for (const row of pending) {
        await syncEvent(row);
      }
      return send(200, {
        retried: pending.length,
        still_failing: unsyncedEvents(db).length,
      });
    }

    return send(404, { error: "Not found" });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof JobCardError ? err.status : 500;
      if (status === 500) {
        console.error(err);
      }
      if (!res.headersSent) {
        res.writeHead(status, { "content-type": "application/json" });
      }
      res.end(
        JSON.stringify({
          error: status === 500 ? "Internal error" : err.message,
        }),
      );
    });
  });

  return { server, db, config, events: Object.keys(EVENTS) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, config } = createApp();
  if (!config.webhookSecret || !config.accessKey) {
    console.warn(
      "WARNING: set WEBHOOK_SECRET and ACCESS_KEY before exposing this service.",
    );
  }
  server.listen(config.port, () => {
    console.log(`Callout job cards listening on :${config.port}`);
  });
}
