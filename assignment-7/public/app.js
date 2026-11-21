// ============================================================
// WELLSPRING MAINTENANCE — BROWSER
// ============================================================
// This file runs in the browser. It never holds database secrets
// and never decides permissions: the server checks every request.
// Everything shown here is read from the server, so reloading the
// page shows what is saved in the database.

const $ = (selector) => document.querySelector(selector);

let me = null;        // the signed-in person, from /api/me
let options = null;   // rooms, categories, staff, statuses, urgencies
let pending = '';     // confirmation to show once the next screen loads


// ------------------------------------------------------------
// 1. TALKING TO THE SERVER
// ------------------------------------------------------------

async function api(path, method = 'GET', body) {
  const request = { method, headers: {} };
  if (body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }
  const response = await fetch(path, request);
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((data && data.error) || `HTTP ${response.status}`);
    error.status = response.status;
    error.fields = (data && data.fields) || {};
    throw error;
  }
  return data;
}

function show(message, isError = false) {
  const box = $('#message');
  box.textContent = message;
  box.className = message ? (isError ? 'error' : 'success') : '';
}

// Puts each server message under its field, and marks the field.
function showFieldErrors(form, fields) {
  for (const p of form.querySelectorAll('.field-error')) {
    const message = fields[p.dataset.for] || '';
    p.textContent = message;
    const input = form.querySelector(`[name="${p.dataset.for}"]`);
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  const first = Object.keys(fields)[0];
  if (first) form.querySelector(`[name="${first}"]`)?.focus();
}

// Runs an action and turns any error into a readable message.
async function attempt(form, work) {
  const button = form?.querySelector('button');
  if (button) button.disabled = true;
  try {
    if (form) showFieldErrors(form, {});
    await work();
  } catch (error) {
    // A 401 while signed in means the session ended; on the sign-in form it is a wrong password.
    if (error.status === 401 && me) return signedOut('Your session has ended. Please sign in again.');
    if (form) showFieldErrors(form, error.fields || {});
    show(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function fill(select, items, blank) {
  select.replaceChildren();
  if (blank) select.append(new Option(blank, ''));
  for (const [value, label] of items) select.append(new Option(label, value));
}


// ------------------------------------------------------------
// 2. SIGNING IN AND OUT
// ------------------------------------------------------------

function signedOut(message) {
  me = null;
  $('#account').hidden = true;
  $('#nav').hidden = true;
  showView('login');
  show(message || '');
}

async function signedIn() {
  options = await api('/api/options');
  $('#whoami').textContent = `${me.full_name} · ${me.person_type}`;
  $('#account').hidden = false;
  $('#nav').hidden = false;
  // A convenience only: the server refuses the queue for non-staff anyway.
  $('#queueLink').hidden = me.person_type !== 'Staff';

  fill($('#room_id'), options.rooms.map((r) => [r.room_id, `${r.room_name} (floor ${r.floor})`]), 'Choose a room…');
  fill($('#category_id'), options.categories.map((c) => [c.category_id, c.category_name]), 'Choose a kind…');
  fill($('#urgency'), options.urgencies.map((u) => [u, u]), 'Choose urgency…');
  fill($('#f_room'), options.rooms.map((r) => [r.room_id, r.room_name]), 'All rooms');
  fill($('#u_assignee'), options.staff.map((s) => [s.person_id, s.full_name]), 'Nobody yet');
}

$('#loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  attempt(form, async () => {
    me = await api('/api/login', 'POST', { email: form.email.value, password: form.password.value });
    form.reset();
    await signedIn();
    pending = `Signed in as ${me.full_name}.`;
    const next = me.person_type === 'Staff' ? '#/queue' : '#/mine';
    if (location.hash === next) { show(pending); pending = ''; route(); } else location.hash = next;
  });
});

$('#logout').addEventListener('click', async () => {
  await api('/api/logout', 'POST');
  signedOut('You are signed out.');
  if (location.hash) {
    pending = 'You are signed out.';
    location.hash = '';
  }
});


// ------------------------------------------------------------
// 3. VIEWS
// ------------------------------------------------------------

function showView(name) {
  for (const view of document.querySelectorAll('.view')) view.hidden = view.id !== `view-${name}`;
  for (const link of document.querySelectorAll('#nav a')) {
    link.classList.toggle('current', link.getAttribute('href') === location.hash);
  }
}

function requestRow(r, showReporter) {
  const row = document.createElement('a');
  row.className = 'request';
  row.href = `#/requests/${r.request_id}`;

  const title = document.createElement('strong');
  title.textContent = `#${r.request_id} · ${r.title}`;
  const status = document.createElement('span');
  status.className = `status s-${r.status.replace(' ', '-').toLowerCase()}`;
  status.textContent = r.status;
  const meta = document.createElement('small');
  meta.textContent = [
    r.room_name, r.category_name, `${r.urgency} urgency`,
    showReporter ? `reported by ${r.reported_by}` : `reported ${formatDate(r.date_reported)}`,
    r.assigned_to ? `assigned to ${r.assigned_to}` : 'not assigned yet'
  ].join(' · ');

  row.append(title, status, meta);
  return row;
}

function renderList(container, rows, emptyText, showReporter) {
  container.replaceChildren();
  if (rows.length === 0) {
    container.textContent = emptyText;
    return;
  }
  for (const r of rows) container.append(requestRow(r, showReporter));
}

async function showMine() {
  showView('mine');
  const rows = await api('/api/requests?scope=mine&status=');
  renderList($('#mineRows'), rows, 'You have not reported anything yet.', false);
}

async function showQueue() {
  showView('queue');
  const form = $('#filterForm');
  const params = new URLSearchParams({ scope: 'all', status: form.status.value, room_id: form.room_id.value, search: form.search.value });
  const rows = await api(`/api/requests?${params}`);
  renderList($('#queueRows'), rows, 'No reports match these filters.', true);
}

async function showDetail(id) {
  showView('detail');
  const r = await api(`/api/requests/${id}`);
  $('#backLink').href = me.person_type === 'Staff' ? '#/queue' : '#/mine';

  // Information from the related tables: room, category, person, status_update.
  const detail = $('#detail');
  detail.replaceChildren();
  const heading = document.createElement('h2');
  heading.textContent = `#${r.request_id} · ${r.title}`;
  const facts = document.createElement('dl');
  facts.className = 'facts';
  for (const [label, value] of [
    ['Status', r.status], ['Urgency', r.urgency],
    ['Room', `${r.room_name} (floor ${r.floor})`], ['Kind of problem', r.category_name],
    ['Reported by', r.reported_by], ['Reported', formatDate(r.date_reported)],
    ['Assigned to', r.assigned_to || 'Nobody yet'], ['Resolved', formatDate(r.date_resolved)]
  ]) {
    const item = document.createElement('div');
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    item.append(dt, dd);
    facts.append(item);
  }
  const description = document.createElement('p');
  description.textContent = r.description;
  detail.append(heading, facts, description);

  const history = $('#history');
  history.replaceChildren();
  for (const entry of r.history) {
    const li = document.createElement('li');
    const when = document.createElement('small');
    when.textContent = `${formatDate(entry.created_at)} · ${entry.author}`;
    const note = document.createElement('div');
    note.textContent = (entry.new_status ? `[${entry.new_status}] ` : '') + entry.note_text;
    li.append(when, note);
    history.append(li);
  }

  // Staff see the update form, preset to the current values.
  const panel = $('#updatePanel');
  panel.hidden = me.person_type !== 'Staff' || r.status === 'Resolved';
  if (!panel.hidden) {
    const form = $('#updateForm');
    form.dataset.id = r.request_id;
    const forward = options.statuses.slice(options.statuses.indexOf(r.status));
    fill($('#u_status'), forward.map((s) => [s, s === r.status ? `${s} (current)` : s]));
    $('#u_status').value = forward[1] || r.status;
    $('#u_assignee').value = r.assigned_to_id || '';
    showFieldErrors(form, {});
  }
}


// ------------------------------------------------------------
// 4. CREATE AND UPDATE
// ------------------------------------------------------------

$('#newForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  attempt(form, async () => {
    const saved = await api('/api/requests', 'POST', {
      title: form.title.value,
      room_id: form.room_id.value,
      category_id: form.category_id.value,
      urgency: form.urgency.value,
      description: form.description.value
    });
    form.reset();
    pending = `${saved.message} Staff can now see it in the queue.`;
    location.hash = `#/requests/${saved.request_id}`;
  });
});

$('#updateForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  attempt(form, async () => {
    const saved = await api(`/api/requests/${form.dataset.id}`, 'PATCH', {
      status: form.status.value,
      assigned_to_id: form.assigned_to_id.value || null,
      note_text: form.note_text.value
    });
    form.note_text.value = '';
    await showDetail(form.dataset.id);
    show(saved.message);
  });
});

// Filters apply as soon as they change.
$('#filterForm').addEventListener('input', () => attempt(null, showQueue));
$('#filterForm').addEventListener('submit', (event) => event.preventDefault());


// ------------------------------------------------------------
// 5. ROUTING AND START-UP
// ------------------------------------------------------------

async function route() {
  if (!me) return;
  const hash = location.hash || '#/mine';
  const detail = hash.match(/^#\/requests\/(\d+)$/);
  await attempt(null, async () => {
    if (detail) return showDetail(detail[1]);
    if (hash === '#/new') return showView('new');
    if (hash === '#/queue') return showQueue();
    return showMine();
  });
}

window.addEventListener('hashchange', () => {
  show(pending);
  pending = '';
  route();
});

// On every page load, ask the server who is signed in.
(async () => {
  try {
    me = await api('/api/me');
    await signedIn();
    route();
  } catch {
    signedOut();
  }
})();
