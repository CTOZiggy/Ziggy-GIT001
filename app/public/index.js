const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString([], {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

const res = await fetch("/api/jobcards");
const cards = await res.json();
const rows = document.getElementById("rows");
for (const c of cards) {
  const tr = document.createElement("tr");
  const link = document.createElement("a");
  link.href = `/jobcard?ticket=${c.ticket_id}`;
  link.textContent = `#${c.ticket_id}`;
  const first = document.createElement("td");
  first.append(link, document.createElement("br"));
  first.append(document.createTextNode(c.summary));
  tr.append(first);
  const total = c.durations.total_min;
  for (const text of [
    [c.client_name, c.site_name].filter(Boolean).join(" / "),
    c.technician || "—",
    c.status.replace("_", " "),
    fmt(c.left_office_at),
    fmt(c.checked_in_at),
    fmt(c.signed_out_at),
    fmt(c.closed_at),
    total === null ? "—" : `${Math.floor(total / 60)}h ${total % 60}m`,
  ]) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.append(td);
  }
  rows.append(tr);
}
if (!cards.length) {
  rows.innerHTML = '<tr><td colspan="9">No job cards yet.</td></tr>';
}
