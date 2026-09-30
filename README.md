# Callout job cards for Halo PSA

A small service that tracks a technician's callout in four steps and writes each
step back to the Halo ticket.

| Step | Button the technician taps             | Stored as        |
| ---- | -------------------------------------- | ---------------- |
| 1    | I've left the office                   | `left_office_at` |
| 2    | Check in — on site                     | `checked_in_at`  |
| 3    | Sign out — work complete, leaving site | `signed_out_at`  |
| 4    | Close job card — back in office        | `closed_at`      |

Steps must happen in order and times can't go backwards. Travel-out, on-site,
travel-back and total durations are calculated automatically. Each tap also
captures GPS (if the phone allows it), and if there's no signal the tap is kept
on the phone with its true time and synced when back online.

## Flow

1. Technician troubleshoots the ticket in Halo; a callout is needed.
2. Admin builds the quote in Halo; the customer approves it.
3. Ticket type is changed to **Callout / Job Card** → Halo workflow calls
   `POST /webhook/halo`, which creates the job card (safe to fire more than once).
4. Technician clicks a button on the ticket that opens
   `https://<app-host>/jobcard?ticket=<ticket id>&key=<ACCESS_KEY>` and taps through the four steps.
5. Every step is pushed to Halo as a private note, optionally into a custom field, and
   (on close-off) optionally moves the ticket to a status you choose.
   If Halo is unreachable the step is still saved; `POST /api/sync-retry` re-sends it.

Manager view: `https://<app-host>/?key=<ACCESS_KEY>` lists every job card with its times.

## Run

```
npm ci
WEBHOOK_SECRET=... ACCESS_KEY=... npm start     # Node 22+, no runtime dependencies
npm test
```

The data lives in SQLite (`DB_PATH`, default `data/jobcards.db`). Put the service
behind HTTPS — phones only share GPS over HTTPS.

| Variable                                                                                        | Purpose                                                                           |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `WEBHOOK_SECRET`                                                                                | Required. Halo sends it in the `x-webhook-secret` header.                         |
| `ACCESS_KEY`                                                                                    | Required in production. Needed in the link to open the UI/API.                    |
| `HALO_URL`, `HALO_AUTH_URL`, `HALO_TENANT`, `HALO_CLIENT_ID`, `HALO_CLIENT_SECRET`              | Halo API application (client-credentials). Leave unset to run without write-back. |
| `HALO_FIELD_LEFT_OFFICE`, `HALO_FIELD_CHECK_IN`, `HALO_FIELD_SIGN_OUT`, `HALO_FIELD_CLOSED_OFF` | Optional Halo custom field ids for each timestamp.                                |
| `HALO_STATUS_ON_CLOSE`                                                                          | Optional Halo status id applied when the card is closed off.                      |
| `APP_TIMEZONE`                                                                                  | Timezone for times written into Halo notes (default `Africa/Johannesburg`).       |
| `PORT`, `DB_PATH`                                                                               | Listen port and SQLite path.                                                      |

## Halo configuration (to do in your Halo instance)

- **API application**: Config → Integrations → Halo PSA API → new application
  (client-credentials, permissions to edit tickets). Use its id/secret above.
- **Workflow step** on the Callout / Job Card ticket type: a webhook/HTTP call to
  `/webhook/halo` with header `x-webhook-secret` and a JSON body such as:
  `{"ticket_id": <id>, "summary": "...", "client_name": "...", "site_name": "...", "site_address": "...", "agent_name": "...", "quote_ref": "..."}`
  (`ticket_id` is the only required field).
- **Ticket button / link** to the job card URL above with the ticket id filled in.
- Optional: four date/time custom fields on the ticket, and their ids in the env vars.

> The Halo API calls (`/api/Actions`, `/api/Tickets`, OAuth token) follow Halo's
> documented API but have only been tested against a mock in `test/`, not a live
> Halo tenant. Check the first callout end-to-end in a test ticket before rollout.
