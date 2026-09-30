# Callout job cards on Microsoft 365

Tracks the four callout timestamps, plus GPS, for Halo PSA tickets. It runs
entirely inside your Microsoft 365 tenant, with nothing to host.

| Piece                                   | What it does                                                              | Licence                                 |
| --------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------- |
| **SharePoint list** "Callout Job Cards" | Stores every job card, including the monthly report view                  | Included in M365                        |
| **Power Apps canvas app**               | The technician's phone screen: one big button per step, GPS, M365 sign-in | Included in M365 (standard connectors)  |
| **Teams tab** (optional)                | The same app, pinned in Teams                                             | Included                                |
| Flow 1: Halo → SharePoint               | Pre-fills the card when the ticket type becomes Callout / Job Card        | Power Automate Premium × 1 (flow owner) |
| Flow 2: SharePoint → Halo               | Writes each timestamp to the Halo ticket as a private note                | Same Premium licence                    |
| Flow 3: Monthly report                  | Emails last month's totals on the 1st                                     | Included                                |

**Why this setup:** there's no server to host, patch or secure. Technicians sign in
with their normal M365 account, so every timestamp shows who pressed the button.
Power Apps reads the phone's GPS. SharePoint gives you monthly reporting,
Excel export and Power BI without extra work.

The core (list, app, Teams tab and monthly email) works with no Premium licence.
Flows 1 and 2 add the Halo integration and need one Premium licence between them.

## How the callout runs

```
Store logs ticket ─► L1/L2 troubleshoot ─► callout needed ─► reassigned to Admin
      ─► Admin quotes in Halo ─► store approves ─► back to L2, visit scheduled
      ─► tech sets ticket type = Callout / Job Card
            ├─► Halo webhook ─► Flow 1 ─► job card created in SharePoint (status: Scheduled)
            └─► "Open job card" button on the ticket ─► Power Apps on the tech's phone
                   1. I've left the office        → Left office      + GPS
                   2. Check in — I'm on site      → Arrived on site  + GPS  (travel-out minutes)
                   3. Sign out — work done        → Left site        + GPS  (on-site minutes)
                   4. Close job card — back       → Back in office   + GPS  (travel-back + total)
                         each tap ─► Flow 2 ─► private note on the Halo ticket
      ─► 1st of the month: Flow 3 emails the report; "Monthly report" view has totals per month
```

## Setup, in order

1. **SharePoint list.** Choose a site, for example the IT team site, and set its
   regional settings (Site settings → Regional settings) to time zone
   (UTC+02:00) Harare, Pretoria. Then run
   [`sharepoint/provision-list.ps1`](sharepoint/provision-list.ps1). It creates the list,
   the columns, the GPS "Map" links, and the **Open job cards** and **Monthly report** views.

2. **Power Apps app.** Go to make.powerapps.com → Create → Blank canvas app → Phone.
   Follow the steps at the top of
   [`powerapps/JobCardScreen.pa.yaml`](powerapps/JobCardScreen.pa.yaml). Save, publish,
   and share the app with the technicians. Share the SharePoint list with them too
   (Edit permission).
   Copy the app's **Web link** from Details. It looks like
   `https://apps.powerapps.com/play/e/<env-id>/a/<app-id>?tenantId=<tenant-id>`.

3. **Halo button.** On the Callout / Job Card ticket type, add a custom button or link
   that opens:

   ```
   <Web link>&ticketid=<Halo ticket-id variable>&store=<client/site name variable>&summary=<summary variable>
   ```

   Use your Halo version's ticket variables; the ticket id is commonly `$FAULTID`.
   Only `ticketid` is required. On a phone this opens the app in the
   browser, or in the Power Apps mobile app if it's installed.

4. **Teams (optional).** In Power Apps → Apps → … → **Add to Teams**. Technicians can
   then also open the app from Teams and pick a ticket from its link.

5. **Flows.** Build [Flow 1](power-automate/1-halo-to-sharepoint.md),
   [Flow 2](power-automate/2-sharepoint-to-halo.md) and
   [Flow 3](power-automate/3-monthly-report.md) at make.powerautomate.com,
   using a service account.

6. **Test run.** Open a test ticket, set it to Callout / Job Card, open the button, and
   tap through all four steps. Then check the list row, the four Halo notes, and
   the durations.

## Reporting

- **SharePoint → Monthly report view** groups closed cards by month. For each month it
  shows the count, average travel and on-site minutes, and total minutes.
  **Export to Excel** gives the raw rows.
- **Flow 3** emails the same figures on the 1st.
- **Power BI** (optional): connect to the SharePoint list for charts by technician,
  store or month. The columns are already numbers.
- **In Halo**, the notes Flow 2 writes are on every ticket's history.

## Rules the app enforces

- Steps can only happen in order. The button always shows the next step, and a closed
  card can't be changed from the app.
- Each step's time is the moment of the tap. If the save fails because of no signal, the
  button becomes **Retry save** and keeps the original tap time and GPS.
- GPS is optional. If the phone refuses location, the time is still saved and
  the GPS column is left blank.
- The technician is taken from the M365 sign-in, not typed in.

## Limits to know about

- The app needs a data connection at the moment it saves. A tap made with no signal is
  held on screen until Retry succeeds, but it isn't saved if the app is closed first.
- Admins can still edit times directly in the SharePoint list. Restrict the list to
  Contribute for technicians and use version history (on by default) as the audit trail.
- The Power Apps paste format and the Halo API calls were written from the
  published formats and haven't been run against your tenant or Halo instance.
  Step 6 of the setup is the check.
