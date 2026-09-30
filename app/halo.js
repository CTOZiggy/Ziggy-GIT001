import { EVENT_LABELS } from "./jobcards.js";

/**
 * Minimal Halo PSA API client (OAuth2 client credentials).
 * All calls are no-ops when HALO_URL / credentials are not configured, so the
 * app can run standalone while Halo is being set up.
 */
export function createHaloClient(config, fetchImpl = fetch) {
  const h = config.halo;
  const enabled = Boolean(h.url && h.authUrl && h.clientId && h.clientSecret);
  let token = null;
  let tokenExpiry = 0;

  async function getToken() {
    if (token && Date.now() < tokenExpiry - 30000) {
      return token;
    }
    const url = `${h.authUrl}/token${h.tenant ? `?tenant=${encodeURIComponent(h.tenant)}` : ""}`;
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: h.clientId,
        client_secret: h.clientSecret,
        scope: "all",
      }),
    });
    if (!res.ok) {
      throw new Error(`Halo auth failed: HTTP ${res.status}`);
    }
    const body = await res.json();
    token = body.access_token;
    tokenExpiry = Date.now() + (body.expires_in ?? 3600) * 1000;
    return token;
  }

  async function post(path, payload) {
    const res = await fetchImpl(`${h.url}/api/${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await getToken()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Halo ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
  }

  const fmt = (iso) =>
    new Date(iso).toLocaleString("en-ZA", {
      timeZone: config.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    });

  /** Push one recorded event to the Halo ticket: private note, custom field, status. */
  async function pushEvent(event) {
    if (!enabled) {
      return false;
    }
    const who = event.technician ? ` by ${event.technician}` : "";
    const where =
      event.lat !== null
        ? ` (GPS ${event.lat.toFixed(5)}, ${event.lng.toFixed(5)})`
        : "";
    await post("Actions", [
      {
        ticket_id: event.ticket_id,
        note_html: `<b>${EVENT_LABELS[event.event]}</b>: ${fmt(event.occurred_at)}${who}${where}`,
        hiddenfromuser: true,
      },
    ]);
    const update = { id: event.ticket_id };
    const fieldId = h.fields[event.event];
    if (fieldId) {
      update.customfields = [{ id: Number(fieldId), value: event.occurred_at }];
    }
    if (event.event === "closed_off" && h.closedStatusId) {
      update.status_id = Number(h.closedStatusId);
    }
    if (Object.keys(update).length > 1) {
      await post("Tickets", [update]);
    }
    return true;
  }

  return { enabled, pushEvent };
}
