# Flow 2 — write each timestamp back to the Halo ticket (optional, Premium)

After every tap in the app, this adds a private note to the Halo ticket, for example
"Arrived on site: 02 Oct 2026 10:14 (GPS -26.107,28.056)". On close-off it can also
move the ticket to a status you choose.

Licence: the **HTTP** action is Premium. The trigger is a SharePoint trigger, so the
flow runs on the flow owner's licence. Technicians don't need Premium.

## Prerequisite: Halo API application

In Halo, go to Config → Integrations → Halo API → View Applications → New. Choose
**Client ID and Secret (Services)**, pick an agent to act as, and give it permission
to edit tickets. Note the Client ID, the Secret, and your Halo URL.
Keep the secret in an Azure Key Vault or a secure environment variable, not in a
plain action.

## Build

1. **Trigger:** _When an item is created or modified_ (SharePoint, "Callout Job Cards").
   Trigger settings → **Trigger conditions**:

   ```
   @not(equals(triggerBody()?['LastStep'], triggerBody()?['HaloSyncedStep']))
   ```

   The flow then only runs when the app has recorded a step Halo hasn't seen.
   Step 6 sets `HaloSyncedStep`, so the flow doesn't loop.

2. **Switch** on `LastStep`. In each case, set a string variable `Label` and a
   variable `When`/`GPS` from the matching columns:

   | LastStep      | Label                            | Time column   | GPS column            |
   | ------------- | -------------------------------- | ------------- | --------------------- |
   | `left_office` | Left office                      | LeftOffice    | LeftOfficeLocation    |
   | `check_in`    | Arrived on site                  | ArrivedOnSite | ArrivedOnSiteLocation |
   | `sign_out`    | Work complete, left site         | LeftSite      | LeftSiteLocation      |
   | `closed_off`  | Back in office — job card closed | BackInOffice  | BackInOfficeLocation  |

3. **HTTP** — get a token:
   - Method `POST`, URI `https://<your-halo>/auth/token`
     (add `?tenant=<tenant>` for hosted Halo if your instance needs it)
   - Header `Content-Type: application/x-www-form-urlencoded`
   - Body: `grant_type=client_credentials&client_id=<id>&client_secret=<secret>&scope=all`

4. **HTTP** — add the note:
   - Method `POST`, URI `https://<your-halo>/api/Actions`
   - Headers: `Authorization: Bearer @{body('HTTP_token')?['access_token']}`,
     `Content-Type: application/json`
   - Body:

   ```json
   [
     {
       "ticket_id": @{triggerBody()?['TicketID']},
       "note_html": "<b>@{variables('Label')}</b>: @{formatDateTime(convertFromUtc(variables('When'), 'South Africa Standard Time'), 'dd MMM yyyy HH:mm')} by @{triggerBody()?['Technician']} (GPS @{variables('GPS')})",
       "hiddenfromuser": true
     }
   ]
   ```

5. _(Optional, `closed_off` case only)_ **HTTP** `POST https://<your-halo>/api/Tickets`
   with body `[{"id": <TicketID>, "status_id": <your "Job card complete" status id>}]`.

6. **Update item** (SharePoint): Id = trigger `ID`, **Halo synced step** = `LastStep`.

If Halo is down, the run fails and `HaloSyncedStep` stays behind, so you can see which
cards weren't synced. Resubmit the failed run from the flow's run history.

> These are Halo's standard API endpoints and fields. Check them against your
> Halo version's API docs (`https://<your-halo>/apidoc`) on a test ticket before
> you switch the flow on.
