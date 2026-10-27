// ============================================================
// SECTION 1: BROWSER SETUP
// ============================================================
// This file runs in the browser, not on the Express server.
// Database credentials must stay on the server.

// Find one HTML element using its CSS selector.
function getElement(selector) {
  return document.querySelector(selector);
}

// The request currently shown in "Request details".
let selectedRequestId = null;

// Lists from /api/lookups (rooms, people, vendors, ...).
let lookups = null;


// ============================================================
// SECTION 2: DISPLAY A MESSAGE
// ============================================================
// announce() displays a success message or an error message.
function announce(message, isError = false) {
  const messageElement = getElement('#message');

  messageElement.textContent = message;

  if (isError) {
    messageElement.classList.add('error');
  } else {
    messageElement.classList.remove('error');
  }
}


// ============================================================
// SECTION 3: SEND AN HTTP REQUEST TO EXPRESS
// ============================================================
// api() sends a request, reads the response, and displays a trace.
// path: the API URL, such as '/api/requests'
// method: GET, POST, PATCH, or DELETE
// body: optional data to send to the server
async function api(path, method = 'GET', body) {
  const options = {
    method: method
  };

  // POST and PATCH can send JSON data in the request body.
  if (body !== undefined && body !== null) {
    options.headers = {
      'Content-Type': 'application/json'
    };
    options.body = JSON.stringify(body);
  }

  // fetch() sends the HTTP request to the Express server.
  const response = await fetch(path, options);

  // Read the response as text before attempting to parse JSON.
  const rawText = await response.text();
  let data = null;

  if (rawText !== '') {
    try {
      // JSON.parse() converts JSON text into a JavaScript value.
      data = JSON.parse(rawText);
    } catch (error) {
      // If the response is not JSON, keep its original text.
      data = { raw: rawText };
    }
  }

  // Show the request and response so we can trace the flow.
  let requestBody = null;

  if (body !== undefined && body !== null) {
    requestBody = body;
  }

  const trace = {
    request: {
      method: method,
      path: path,
      body: requestBody
    },
    response: {
      status: response.status,
      ok: response.ok,
      body: data
    }
  };

  getElement('#trace').textContent = JSON.stringify(trace, null, 2);

  // HTTP errors should appear as readable messages in the page.
  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;

    if (data !== null && typeof data === 'object') {
      if (typeof data.error === 'string') {
        errorMessage = data.error;
      }
    }

    throw new Error(errorMessage);
  }

  return data;
}


// ============================================================
// SECTION 4: RUN AN ACTION SAFELY
// ============================================================
// perform() disables buttons during a request and handles errors.
async function perform(work) {
  const buttons = document.querySelectorAll('button');

  // Disable buttons to avoid duplicate requests.
  for (const button of buttons) {
    button.disabled = true;
  }

  try {
    // Run the operation passed into perform().
    await work();
    announce('Request completed. See trace and Network panel.');
  } catch (error) {
    announce(error.message, true);
  } finally {
    // Re-enable buttons whether the request succeeds or fails.
    for (const button of buttons) {
      button.disabled = false;
    }
  }
}


// ============================================================
// SECTION 5: SMALL DISPLAY HELPERS
// ============================================================

// actingPersonId() is the person chosen in "Acting as".
function actingPersonId() {
  return Number(getElement('#actingAs').value);
}

// formValue() reads a form field. Empty fields become null.
function formValue(form, name) {
  const value = form.elements[name].value.trim();

  if (value === '') {
    return null;
  }

  return value;
}

// formatDate() shows a date or timestamp in a short readable form.
function formatDate(value) {
  if (!value) {
    return '—';
  }

  // Plain dates (2026-10-09) have no time to show.
  if (value.length === 10) {
    return value;
  }

  return new Date(value).toLocaleString();
}

// renderTable() turns an array of row objects into an HTML table.
// textContent displays stored text safely as text, not HTML.
function renderTable(container, rows, emptyMessage) {
  container.replaceChildren();

  if (rows.length === 0) {
    container.textContent = emptyMessage;
    return;
  }

  const table = document.createElement('table');
  const headerRow = table.createTHead().insertRow();

  for (const key of Object.keys(rows[0])) {
    const th = document.createElement('th');
    th.textContent = key.replaceAll('_', ' ');
    headerRow.append(th);
  }

  const body = table.createTBody();

  for (const row of rows) {
    const tr = body.insertRow();

    for (const value of Object.values(row)) {
      let text = value;

      if (value === null) {
        text = '—';
      } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
        text = formatDate(value);
      }

      tr.insertCell().textContent = text;
    }
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrap';
  wrapper.append(table);
  container.append(wrapper);
}


// ============================================================
// SECTION 6: FILL THE DROP-DOWN MENUS
// ============================================================
// Each <select data-list="..."> is filled from /api/lookups, so
// staff pick existing rooms, people and vendors (no retyping).
function optionsFor(listName) {
  switch (listName) {
    case 'rooms':
      return lookups.rooms.map((r) => [r.room_id, `${r.room_name} (floor ${r.floor})`]);
    case 'categories':
      return lookups.categories.map((c) => [c.category_id, c.category_name]);
    case 'serviceTypes':
      return lookups.serviceTypes.map((s) => [s.service_type_id, s.service_name]);
    case 'vendors':
      return lookups.vendors.map((v) => [v.vendor_id, v.vendor_name]);
    case 'people':
      return lookups.people.map((p) => [p.person_id, `${p.full_name} (${p.person_type})`]);
    case 'staff':
      return lookups.people
        .filter((p) => p.person_type === 'Staff')
        .map((p) => [p.person_id, p.full_name]);
    case 'statuses':
      return lookups.statuses.map((s) => [s, s]);
    case 'urgencies':
      return lookups.urgencies.map((u) => [u, u]);
  }
  return [];
}

function fillSelect(select, listName, blankLabel) {
  select.replaceChildren();

  if (blankLabel) {
    select.append(new Option(blankLabel, ''));
  }

  for (const [value, label] of optionsFor(listName)) {
    select.append(new Option(label, value));
  }
}

async function loadLookups() {
  lookups = await api('/api/lookups');

  fillSelect(getElement('#actingAs'), 'people');

  for (const select of document.querySelectorAll('select[data-list]')) {
    fillSelect(select, select.dataset.list, select.dataset.blank);
  }
}


// ============================================================
// SECTION 7: LIST REQUESTS (GET)
// ============================================================
async function refresh() {
  const form = getElement('#filter');
  const params = new URLSearchParams();

  for (const name of ['room_id', 'status', 'search']) {
    const value = formValue(form, name);
    if (value !== null) {
      params.set(name, value);
    }
  }

  const data = await api(`/api/requests?${params}`);
  const rowsElement = getElement('#rows');
  rowsElement.replaceChildren();

  if (data.length === 0) {
    rowsElement.textContent = 'No matching requests.';
    return;
  }

  // Each request is a button that opens its details.
  for (const request of data) {
    const article = document.createElement('article');
    const heading = document.createElement('button');
    const details = document.createElement('div');

    heading.type = 'button';
    heading.className = 'link';
    heading.textContent = `#${request.request_id} · ${request.title}`;
    heading.addEventListener('click', function () {
      perform(function () {
        return showRequest(request.request_id);
      });
    });

    details.textContent =
      `${request.room_name} · ${request.category_name} · ${request.urgency} · ` +
      `${request.status} · assigned to ${request.assigned_to || 'nobody yet'}`;

    article.append(heading, details);
    rowsElement.append(article);
  }
}


// ============================================================
// SECTION 8: ONE REQUEST WITH ITS HISTORY (GET)
// ============================================================
async function showRequest(id) {
  const request = await api(`/api/requests/${id}`);
  selectedRequestId = request.request_id;
  getElement('#detailId').value = request.request_id;

  const detail = getElement('#detail');
  detail.replaceChildren();

  const heading = document.createElement('h3');
  heading.textContent = `#${request.request_id} · ${request.title} — ${request.status}`;

  const summary = document.createElement('p');
  summary.textContent =
    `${request.room_name} · ${request.category_name} · ${request.urgency} urgency. ` +
    `Reported by ${request.reported_by} on ${formatDate(request.date_reported)}. ` +
    `Assigned to ${request.assigned_to || 'nobody yet'}. ` +
    `Resolved: ${formatDate(request.date_resolved)}.`;

  const description = document.createElement('p');
  description.textContent = request.description;

  // History: one line per StatusUpdate, oldest first.
  const historyTitle = document.createElement('h3');
  historyTitle.textContent = 'History';
  const history = document.createElement('ol');
  history.className = 'history';

  for (const update of request.history) {
    const item = document.createElement('li');
    const when = document.createElement('small');
    when.textContent = `${formatDate(update.created_at)} · ${update.author}`;

    const text = document.createElement('div');
    text.textContent = update.new_status
      ? `[${update.new_status}] ${update.note_text}`
      : update.note_text;

    item.append(when, text);
    history.append(item);
  }

  const jobsTitle = document.createElement('h3');
  jobsTitle.textContent = 'Vendor jobs';
  const jobs = document.createElement('div');
  renderTable(jobs, request.jobs, 'No vendor jobs.');

  const deliveriesTitle = document.createElement('h3');
  deliveriesTitle.textContent = 'Deliveries';
  const deliveries = document.createElement('div');
  renderTable(deliveries, request.deliveries, 'No deliveries.');

  detail.append(heading, summary, description, historyTitle, history,
    jobsTitle, jobs, deliveriesTitle, deliveries);
}

// requireSelected() stops actions that need a request first.
function requireSelected() {
  if (selectedRequestId === null) {
    throw new Error('Choose a request in "Request details" first.');
  }
  return selectedRequestId;
}


// ============================================================
// SECTION 9: CONNECT, REPORT, FILTER
// ============================================================
getElement('#hello').addEventListener('click', function () {
  perform(async function () {
    const data = await api('/api/hello');
    getElement('#connection').textContent = `${data.message} (${data.mode} mode)`;
  });
});

getElement('#create').addEventListener('submit', function (event) {
  // Prevent the browser's default form submission and page reload.
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const created = await api('/api/requests', 'POST', {
      title: formValue(form, 'title'),
      description: formValue(form, 'description'),
      room_id: formValue(form, 'room_id'),
      category_id: formValue(form, 'category_id'),
      urgency: formValue(form, 'urgency'),
      reported_by_id: actingPersonId()
    });

    form.reset();
    await refresh();
    await showRequest(created.request_id);
  });
});

getElement('#filter').addEventListener('submit', function (event) {
  event.preventDefault();
  perform(refresh);
});


// ============================================================
// SECTION 10: DETAILS, STATUS CHANGES AND NOTES
// ============================================================
getElement('#showDetail').addEventListener('click', function () {
  perform(function () {
    return showRequest(getElement('#detailId').value);
  });
});

// Changing status also writes a StatusUpdate, so history is kept.
getElement('#status').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const id = requireSelected();

    await api(`/api/requests/${id}/status`, 'PATCH', {
      status: formValue(form, 'status'),
      assigned_to_id: formValue(form, 'assigned_to_id'),
      note_text: formValue(form, 'note_text'),
      author_id: actingPersonId()
    });

    form.elements.note_text.value = '';
    await showRequest(id);
    await refresh();
  });
});

getElement('#note').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const id = requireSelected();

    await api(`/api/requests/${id}/updates`, 'POST', {
      note_text: formValue(form, 'note_text'),
      author_id: actingPersonId()
    });

    form.reset();
    await showRequest(id);
  });
});


// ============================================================
// SECTION 11: VENDORS, JOBS AND DELIVERIES
// ============================================================
getElement('#vendors').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const serviceTypeId = formValue(form, 'service_type_id');
    const query = serviceTypeId ? `?service_type_id=${serviceTypeId}` : '';
    const vendors = await api(`/api/vendors${query}`);
    renderTable(getElement('#vendorRows'), vendors, 'No active vendors offer that service.');
  });
});

getElement('#job').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const id = requireSelected();

    const job = await api('/api/jobs', 'POST', {
      request_id: id,
      vendor_id: formValue(form, 'vendor_id'),
      job_description: formValue(form, 'job_description'),
      scheduled_date: formValue(form, 'scheduled_date')
    });

    form.reset();
    getElement('#finishJob').elements.id.value = job.job_id;
    getElement('#delivery').elements.job_id.value = job.job_id;
    await showRequest(id);
  });
});

getElement('#finishJob').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    await api(`/api/jobs/${formValue(form, 'id')}`, 'PATCH', {
      completed_date: formValue(form, 'completed_date'),
      final_cost: formValue(form, 'final_cost')
    });

    if (selectedRequestId !== null) {
      await showRequest(selectedRequestId);
    }
  });
});

getElement('#delivery').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const delivery = await api('/api/deliveries', 'POST', {
      vendor_id: formValue(form, 'vendor_id'),
      job_id: formValue(form, 'job_id'),
      item_description: formValue(form, 'item_description'),
      date_expected: formValue(form, 'date_expected'),
      cost: formValue(form, 'cost')
    });

    form.reset();
    getElement('#receive').elements.id.value = delivery.delivery_id;

    if (selectedRequestId !== null) {
      await showRequest(selectedRequestId);
    }
  });
});

// The person in "Acting as" signs for received deliveries (Rule 8).
getElement('#receive').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const status = formValue(form, 'status');
    const body = { status: status };

    if (status === 'Received') {
      body.date_received = formValue(form, 'date_received');
      body.received_by_id = actingPersonId();
    }

    await api(`/api/deliveries/${formValue(form, 'id')}`, 'PATCH', body);

    if (selectedRequestId !== null) {
      await showRequest(selectedRequestId);
    }
  });
});


// ============================================================
// SECTION 12: REPORTS
// ============================================================
getElement('#report').addEventListener('submit', function (event) {
  event.preventDefault();
  const form = event.currentTarget;

  perform(async function () {
    const rows = await api(`/api/reports/${formValue(form, 'name')}`);
    renderTable(getElement('#reportRows'), rows, 'Nothing to report.');
  });
});


// ============================================================
// SECTION 13: INITIAL PAGE LOAD
// ============================================================
// Fill the menus, then show the open requests.
loadLookups()
  .then(refresh)
  .catch(function (error) {
    announce(error.message, true);
  });
