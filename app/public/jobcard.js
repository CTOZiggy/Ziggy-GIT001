const ticket = new URLSearchParams(location.search).get("ticket");
const $ = (id) => document.getElementById(id);
const STEPS = [
  ["left_office", "left_office_at", "Time left office", "I've left the office"],
  ["check_in", "checked_in_at", "Checked in on site", "Check in — I'm on site"],
  [
    "sign_out",
    "signed_out_at",
    "Signed out (work done)",
    "Sign out — work complete, leaving site",
  ],
  [
    "closed_off",
    "closed_at",
    "Back in office (closed)",
    "Close job card — I'm back in the office",
  ],
];
const QUEUE_KEY = `queue:${ticket}`;
let card = null;

const fmt = (iso) =>
  iso
    ? new Date(iso).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";
const mins = (n) => (n === null ? "—" : `${Math.floor(n / 60)}h ${n % 60}m`);

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeQueue(q) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable */
  }
}

function render() {
  $("title").textContent = `Ticket #${ticket} — ${card.summary || "Callout"}`;
  $("sub").textContent = [card.client_name, card.site_name, card.site_address]
    .filter(Boolean)
    .join(" · ");
  const list = $("steps");
  list.replaceChildren();
  for (const [, col, label] of STEPS) {
    const li = document.createElement("li");
    const a = document.createElement("span");
    a.textContent = label;
    const b = document.createElement("span");
    b.textContent = fmt(card[col]);
    if (card[col]) {
      b.className = "done";
    }
    li.append(a, b);
    list.append(li);
  }
  const next = STEPS.find(([, col]) => !card[col]);
  const queued = readQueue().length > 0;
  $("go").disabled = !next || queued;
  $("go").textContent = next
    ? queued
      ? "Waiting to sync…"
      : next[3]
    : "Job card complete ✔";
  const d = card.durations;
  $("durations").textContent =
    `Travel out ${mins(d.travel_to_site_min)} · On site ${mins(d.on_site_min)} · Travel back ${mins(d.travel_back_min)} · Total ${mins(d.total_min)}`;
}

async function load() {
  const res = await fetch(`/api/jobcards/${encodeURIComponent(ticket)}`);
  if (!res.ok) {
    $("title").textContent = "Job card not found";
    $("sub").textContent =
      "Change the ticket type to Callout / Job Card in Halo first, then reopen this page.";
    $("go").textContent = "Unavailable";
    return;
  }
  card = await res.json();
  render();
}

function position() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve({});
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({}),
      { timeout: 5000, maximumAge: 60000 },
    );
  });
}

async function flush() {
  let q = readQueue();
  while (q.length) {
    let res;
    try {
      res = await fetch(`/api/jobcards/${encodeURIComponent(ticket)}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(q[0]),
      });
    } catch {
      return false;
    } // still offline; keep queued
    if (!res.ok && res.status >= 500) {
      return false;
    }
    if (!res.ok) {
      $("msg").textContent = (await res.json()).error;
      $("msg").className = "msg err";
    }
    q = q.slice(1);
    writeQueue(q);
  }
  return true;
}

$("go").addEventListener("click", async () => {
  const next = STEPS.find(([, col]) => !card[col]);
  if (!next || !confirm(`${next[3]}?`)) {
    return;
  }
  const technician = $("tech").value.trim();
  if (!technician) {
    $("msg").textContent = "Enter your name first.";
    $("msg").className = "msg err";
    return;
  }
  try {
    localStorage.setItem("technician", technician);
  } catch {
    /* ignore */
  }
  $("go").disabled = true;
  // Capture the time of the tap now so an offline submit keeps the true time.
  const pos = await position();
  writeQueue([
    ...readQueue(),
    {
      event: next[0],
      technician,
      occurred_at: new Date().toISOString(),
      ...pos,
    },
  ]);
  $("msg").className = "msg";
  $("msg").textContent = "Saving…";
  const ok = await flush();
  $("msg").textContent = ok
    ? "Saved."
    : "No signal — saved on this phone and will sync when online.";
  await load();
});

window.addEventListener("online", async () => {
  if (await flush()) {
    await load();
  }
});

try {
  $("tech").value = localStorage.getItem("technician") ?? "";
} catch {
  /* ignore */
}
if (!ticket) {
  $("title").textContent = "No ticket specified";
} else {
  flush().then(load);
}
