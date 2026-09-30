# Flow 1 — Halo webhook → create the job card (optional, Premium)

Pre-creates the job card when the ticket type changes to **Callout / Job Card**, so the
store, address, quote and scheduled time are already filled in when the technician
opens the app. Without this flow the app still works: it creates the card on the
first tap and the technician types the store name.

Licence: the **When an HTTP request is received** trigger is Premium. One Power
Automate Premium licence on the account that owns the flow is enough.

## Build

1. **Trigger:** _When an HTTP request is received_. "Who can trigger the flow": **Anyone**.
   Request body JSON schema:

   ```json
   {
     "type": "object",
     "properties": {
       "secret": { "type": "string" },
       "ticket_id": { "type": "integer" },
       "summary": { "type": "string" },
       "store": { "type": "string" },
       "site_address": { "type": "string" },
       "quote_ref": { "type": "string" },
       "scheduled_for": { "type": "string" }
     },
     "required": ["secret", "ticket_id"]
   }
   ```

   Save the flow once to get the **HTTP URL**. That URL goes into Halo.

2. **Condition:** `secret` is equal to your shared secret (a long random string).
   - **No branch:** _Response_ with status `401`, then _Terminate_.

3. **Yes branch → Get items** (SharePoint, "Callout Job Cards").
   Filter Query: `TicketID eq @{triggerBody()?['ticket_id']}`. Top Count: `1`.

4. **Condition:** `length(outputs('Get_items')?['body/value'])` is equal to `0`.
   - **Yes → Create item:** Ticket ID = `ticket_id`, Summary = `summary`,
     Store = `store`, Site address = `site_address`, Quote ref = `quote_ref`,
     Scheduled for = `scheduled_for`, Status = `Scheduled`.
   - **No → Update item:** Id = `first(outputs('Get_items')?['body/value'])?['ID']`,
     same fields **except Status**, so a re-fired webhook never resets a card
     that's already in progress.

5. **Response:** status `200`.

## Halo side

In Halo, set up a webhook (Config → Integrations → Webhooks), or a workflow step
that calls a URL, on the **Callout / Job Card** ticket type. It should POST to the
flow's HTTP URL with a JSON body mapped from the ticket's fields:

```json
{
  "secret": "<same shared secret>",
  "ticket_id": 12345,
  "summary": "Damaged network cable at till 2",
  "store": "Pedros Sandton",
  "site_address": "…",
  "quote_ref": "Q-1001",
  "scheduled_for": "2026-10-02T09:00:00+02:00"
}
```

Only `secret` and `ticket_id` are required. Map the other fields to whichever
Halo fields hold them.
