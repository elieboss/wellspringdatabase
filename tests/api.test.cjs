// Exercises the Express API end to end in local mode, following
// the instructor's suggested test: create a request for a room,
// assign it to a staff member, connect a vendor job, and add a
// status update documenting the repair.

process.env.DATA_MODE = 'local';

const test = require('node:test');
const assert = require('node:assert/strict');
const { app, ready } = require('../server.cjs');

let server;
let baseUrl;

test.before(async function () {
  await ready;
  server = app.listen(0);
  await new Promise(function (resolve) { server.once('listening', resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async function () {
  server.close();
  const db = await ready;
  await db.close();
});

async function call(method, path, body) {
  const options = { method, headers: {} };

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(baseUrl + path, options);
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function lookupIds() {
  const { body } = await call('GET', '/api/lookups');
  const byName = function (list, key, name) {
    return list.find(function (item) { return item[key] === name; });
  };

  return {
    gallery: byName(body.rooms, 'room_name', 'Gallery').room_id,
    hvac: byName(body.categories, 'category_name', 'HVAC').category_id,
    hvacService: byName(body.serviceTypes, 'service_name', 'HVAC').service_type_id,
    priya: byName(body.people, 'full_name', 'Priya Shah').person_id,
    marcus: byName(body.people, 'full_name', 'Marcus Hill').person_id,
    coolAir: byName(body.vendors, 'vendor_name', 'CoolAir Mechanical').vendor_id
  };
}

test('full workflow: report, assign, vendor job, delivery, resolve', async function () {
  const ids = await lookupIds();

  // 1. Report a problem in a room.
  const created = await call('POST', '/api/requests', {
    room_id: ids.gallery,
    category_id: ids.hvac,
    reported_by_id: ids.priya,
    title: 'Gallery too cold',
    description: 'Vent blows cold air all day.',
    urgency: 'Medium'
  });
  assert.equal(created.status, 201);
  const requestId = created.body.request_id;

  // 2. Assign it to a staff member.
  const assigned = await call('PATCH', `/api/requests/${requestId}/status`, {
    status: 'Assigned', assigned_to_id: ids.marcus, author_id: ids.marcus
  });
  assert.equal(assigned.status, 200);

  // 3. Find an HVAC vendor and connect a vendor job.
  const vendors = await call('GET', `/api/vendors?service_type_id=${ids.hvacService}`);
  assert.ok(vendors.body.some(function (v) { return v.vendor_id === ids.coolAir; }));

  const job = await call('POST', '/api/jobs', {
    vendor_id: ids.coolAir, request_id: requestId,
    job_description: 'Balance Gallery vents', scheduled_date: '2026-11-02'
  });
  assert.equal(job.status, 201);

  await call('PATCH', `/api/requests/${requestId}/status`, { status: 'In Progress', author_id: ids.marcus });

  // A part is ordered for the job, then arrives late.
  const delivery = await call('POST', '/api/deliveries', {
    vendor_id: ids.coolAir, job_id: job.body.job_id,
    item_description: 'Vent damper', date_expected: '2026-11-03', cost: 40
  });
  assert.equal(delivery.status, 201);

  const received = await call('PATCH', `/api/deliveries/${delivery.body.delivery_id}`, {
    status: 'Received', date_received: '2026-11-05', received_by_id: ids.marcus
  });
  assert.equal(received.status, 200);

  // Rule 4: cannot resolve while the job is unfinished.
  const tooEarly = await call('PATCH', `/api/requests/${requestId}/status`, { status: 'Resolved', author_id: ids.marcus });
  assert.equal(tooEarly.status, 409);
  assert.match(tooEarly.body.error, /Rule 4/);

  // 4. Finish the job and add a status update documenting the repair.
  const done = await call('PATCH', `/api/jobs/${job.body.job_id}`, { completed_date: '2026-11-05', final_cost: 175 });
  assert.equal(done.status, 200);

  const note = await call('POST', `/api/requests/${requestId}/updates`, {
    author_id: ids.marcus, note_text: 'CoolAir rebalanced the vents and installed the damper.'
  });
  assert.equal(note.status, 201);

  const resolved = await call('PATCH', `/api/requests/${requestId}/status`, {
    status: 'Resolved', author_id: ids.marcus, note_text: 'Temperature normal.'
  });
  assert.equal(resolved.status, 200);

  // The request keeps its full history and stays linked to its repair.
  const detail = await call('GET', `/api/requests/${requestId}`);
  assert.equal(detail.body.status, 'Resolved');
  assert.ok(detail.body.date_resolved);
  assert.deepEqual(
    detail.body.history.map(function (h) { return h.new_status; }),
    ['Reported', 'Assigned', 'In Progress', null, 'Resolved']
  );
  assert.equal(detail.body.jobs[0].final_cost, 175);
  assert.equal(detail.body.deliveries[0].item_description, 'Vent damper');

  // The late delivery shows up in the report.
  const late = await call('GET', '/api/reports/late-deliveries');
  assert.ok(late.body.some(function (d) { return d.item_description === 'Vent damper' && d.days_late === 2; }));
});

test('business rules are refused with clear messages', async function () {
  const ids = await lookupIds();
  const open = await call('GET', '/api/requests?status=Reported');
  const requestId = open.body[0].request_id;

  // Rule 2: no assignee.
  let result = await call('PATCH', `/api/requests/${requestId}/status`, { status: 'Assigned', author_id: ids.marcus });
  assert.equal(result.status, 400);
  assert.match(result.body.error, /Rule 2/);

  // Rule 2: volunteers cannot be assigned.
  result = await call('PATCH', `/api/requests/${requestId}/status`, {
    status: 'Assigned', assigned_to_id: ids.priya, author_id: ids.marcus
  });
  assert.equal(result.status, 409);
  assert.match(result.body.error, /Rule 2/);

  // Rule 3: no moving backward.
  const resolved = await call('GET', '/api/requests?status=Resolved');
  result = await call('PATCH', `/api/requests/${resolved.body[0].request_id}/status`, { status: 'Assigned', author_id: ids.marcus });
  assert.equal(result.status, 409);
  assert.match(result.body.error, /Rule 3/);

  // Rule 7: a job must point to a real request.
  result = await call('POST', '/api/jobs', { vendor_id: ids.coolAir, request_id: 99999, job_description: 'x' });
  assert.equal(result.status, 400);

  // Rule 8: received needs a date and a signer.
  result = await call('PATCH', '/api/deliveries/4', { status: 'Received' });
  assert.equal(result.status, 400);

  // Missing fields.
  result = await call('POST', '/api/requests', { title: 'x' });
  assert.equal(result.status, 400);
});

test('room filter and reports', async function () {
  const ids = await lookupIds();
  const mainHall = (await call('GET', '/api/lookups')).body.rooms.find(function (r) { return r.room_name === 'Main Hall'; });

  const rows = await call('GET', `/api/requests?room_id=${mainHall.room_id}`);
  assert.ok(rows.body.length >= 4);
  assert.ok(rows.body.every(function (r) { return r.room_name === 'Main Hall'; }));

  const costs = await call('GET', '/api/reports/vendor-costs');
  assert.equal(typeof costs.body[0].total_cost, 'number');

  const unknown = await call('GET', '/api/reports/nope');
  assert.equal(unknown.status, 404);

  assert.ok(ids.gallery);
});
