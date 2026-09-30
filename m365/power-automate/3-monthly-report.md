# Flow 3 — monthly report email (standard licence)

Emails the previous month's job cards on the 1st of each month: how many there
were, the total hours, average travel and on-site times, and a table of every card.
It only uses standard connectors (SharePoint, Outlook), so no Premium licence is needed.

## Build

1. **Trigger:** _Recurrence_: interval 1, frequency **Month**, start time on the 1st at
   07:00, time zone **(UTC+02:00) Harare, Pretoria**.

2. **Compose** `LastMonth`:

   ```
   formatDateTime(addDays(startOfMonth(convertFromUtc(utcNow(), 'South Africa Standard Time')), -1), 'yyyy-MM')
   ```

3. **Get items** ("Callout Job Cards"). Filter Query:
   `JobMonth eq '@{outputs('LastMonth')}' and Status eq 'Closed'`. Top Count `5000`.

4. **Initialize variables** (Integer, 0): `TotalMins`, `TravelMins`, `OnSiteMins`.
   **Apply to each** item → **Increment variable**:
   - `TotalMins` by `items('Apply_to_each')?['TotalMins']`
   - `TravelMins` by `add(items('Apply_to_each')?['TravelOutMins'], items('Apply_to_each')?['TravelBackMins'])`
   - `OnSiteMins` by `items('Apply_to_each')?['OnSiteMins']`

5. **Select** (from `Get items` value), mapping Ticket, Store, Technician,
   Left office, Arrived, Left site, Back, and Total (min). Then use **Create HTML table**
   from the Select output.

6. **Send an email (V2)** to the team:
   - Subject: `Callout job cards — @{outputs('LastMonth')}`
   - Body:

     ```
     Job cards completed: @{length(body('Get_items')?['value'])}
     Total time: @{div(variables('TotalMins'), 60)} h @{mod(variables('TotalMins'), 60)} min
     Avg travel per job: @{if(equals(length(body('Get_items')?['value']), 0), 0, div(variables('TravelMins'), length(body('Get_items')?['value'])))} min
     Avg on site per job: @{if(equals(length(body('Get_items')?['value']), 0), 0, div(variables('OnSiteMins'), length(body('Get_items')?['value'])))} min

     @{body('Create_HTML_table')}
     ```
