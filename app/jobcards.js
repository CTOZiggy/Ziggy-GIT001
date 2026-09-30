// Job card domain logic: the four-step state machine and duration maths.

// event -> { column, from (required current status), to (new status) }
export const EVENTS = {
  left_office: { column: "left_office_at", from: "pending", to: "left_office" },
  check_in: { column: "checked_in_at", from: "left_office", to: "on_site" },
  sign_out: { column: "signed_out_at", from: "on_site", to: "work_complete" },
  closed_off: { column: "closed_at", from: "work_complete", to: "closed" },
};

export const EVENT_LABELS = {
  left_office: "Time left office",
  check_in: "Agent check in (arrived on site)",
  sign_out: "Agent sign out (work complete, leaving site)",
  closed_off: "Job card closed off (back in office)",
};

export class JobCardError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const now = () => new Date().toISOString();

function str(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** Create a job card from a Halo webhook payload. Idempotent per ticket. */
export function upsertFromHalo(db, payload) {
  const t = payload.ticket ?? payload;
  const ticketId = Number(t.ticket_id ?? t.id);
  if (!Number.isInteger(ticketId) || ticketId <= 0) {
    throw new JobCardError("ticket_id is required");
  }
  const existing = getJobCard(db, ticketId);
  const fields = {
    summary: str(t.summary),
    client_name: str(t.client_name),
    site_name: str(t.site_name),
    site_address: str(t.site_address),
    quote_ref: str(t.quote_ref),
    technician: str(t.agent_name ?? t.technician),
  };
  const ts = now();
  if (existing) {
    // A re-fired workflow refreshes the descriptive fields only, never the times.
    db.prepare(
      `UPDATE jobcards SET summary=?, client_name=?, site_name=?, site_address=?,
         quote_ref=?, technician=COALESCE(NULLIF(?, ''), technician), updated_at=?
       WHERE ticket_id=?`,
    ).run(
      fields.summary || existing.summary,
      fields.client_name || existing.client_name,
      fields.site_name || existing.site_name,
      fields.site_address || existing.site_address,
      fields.quote_ref || existing.quote_ref,
      fields.technician,
      ts,
      ticketId,
    );
    return { card: getJobCard(db, ticketId), created: false };
  }
  db.prepare(
    `INSERT INTO jobcards (ticket_id, summary, client_name, site_name, site_address,
       quote_ref, technician, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
  ).run(
    ticketId,
    fields.summary,
    fields.client_name,
    fields.site_name,
    fields.site_address,
    fields.quote_ref,
    fields.technician,
    ts,
    ts,
  );
  return { card: getJobCard(db, ticketId), created: true };
}

export function getJobCard(db, ticketId) {
  const row = db
    .prepare("SELECT * FROM jobcards WHERE ticket_id = ?")
    .get(ticketId);
  return row ? withDurations(row) : null;
}

export function listJobCards(db, { status } = {}) {
  const rows = status
    ? db
        .prepare(
          "SELECT * FROM jobcards WHERE status = ? ORDER BY updated_at DESC",
        )
        .all(status)
    : db.prepare("SELECT * FROM jobcards ORDER BY updated_at DESC").all();
  return rows.map(withDurations);
}

export function listEvents(db, ticketId) {
  return db
    .prepare("SELECT * FROM events WHERE ticket_id = ? ORDER BY id")
    .all(ticketId);
}

const minutesBetween = (a, b) =>
  a && b ? Math.round((new Date(b) - new Date(a)) / 60000) : null;

export function withDurations(row) {
  return {
    ...row,
    durations: {
      travel_to_site_min: minutesBetween(row.left_office_at, row.checked_in_at),
      on_site_min: minutesBetween(row.checked_in_at, row.signed_out_at),
      travel_back_min: minutesBetween(row.signed_out_at, row.closed_at),
      total_min: minutesBetween(row.left_office_at, row.closed_at),
    },
  };
}

/**
 * Record one of the four tracking events. Enforces order and that times never
 * go backwards. `occurredAt` lets an offline device submit the time the button
 * was actually pressed; it may not be in the future or earlier than the last event.
 */
export function recordEvent(db, ticketId, event, opts = {}) {
  const def = EVENTS[event];
  if (!def) {
    throw new JobCardError(`Unknown event "${event}"`);
  }
  const card = getJobCard(db, ticketId);
  if (!card) {
    throw new JobCardError("Job card not found", 404);
  }
  if (card.status !== def.from) {
    throw new JobCardError(
      `Cannot record "${event}" while job card is "${card.status}"`,
      409,
    );
  }
  const recordedAt = now();
  let occurredAt = recordedAt;
  if (opts.occurredAt) {
    const d = new Date(opts.occurredAt);
    if (Number.isNaN(d.getTime())) {
      throw new JobCardError("occurred_at is not a valid date");
    }
    // Allow 2 minutes of clock skew into the future.
    if (d.getTime() > Date.now() + 120000) {
      throw new JobCardError("occurred_at is in the future");
    }
    occurredAt = d.toISOString();
  }
  const last = [
    card.left_office_at,
    card.checked_in_at,
    card.signed_out_at,
    card.closed_at,
  ]
    .filter(Boolean)
    .at(-1);
  if (last && occurredAt < last) {
    throw new JobCardError("Time is earlier than the previous step");
  }
  const technician = str(opts.technician) || card.technician;
  const lat = Number.isFinite(opts.lat) ? opts.lat : null;
  const lng = Number.isFinite(opts.lng) ? opts.lng : null;

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE jobcards SET ${def.column}=?, status=?, technician=?, updated_at=?
       WHERE ticket_id=?`,
    ).run(occurredAt, def.to, technician, recordedAt, ticketId);
    const info = db
      .prepare(
        `INSERT INTO events (ticket_id, event, occurred_at, recorded_at, technician, lat, lng, note)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        ticketId,
        event,
        occurredAt,
        recordedAt,
        technician,
        lat,
        lng,
        str(opts.note),
      );
    db.exec("COMMIT");
    return {
      card: getJobCard(db, ticketId),
      eventId: Number(info.lastInsertRowid),
    };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function markSynced(db, eventId, error = "") {
  db.prepare("UPDATE events SET halo_synced=?, halo_error=? WHERE id=?").run(
    error ? 0 : 1,
    error,
    eventId,
  );
}

export function unsyncedEvents(db) {
  return db
    .prepare("SELECT * FROM events WHERE halo_synced = 0 ORDER BY id")
    .all();
}
