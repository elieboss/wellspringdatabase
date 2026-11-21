// Checks the seven Assignment 7 requirements against the real
// server and a throwaway PostgreSQL database (PGlite in memory).
// Run with: npm test

process.env.DATA_MODE = 'local';
process.env.PGLITE_DIR = 'memory://';
process.env.SESSION_SECRET = 'test-secret-for-automated-tests-only';

const test = require('node:test');
const assert = require('node:assert/strict');
const { app, ready } = require('../server.cjs');

const PASSWORD = 'Wellspring-Test-2026';
let server;
let base;

test.before(async () => {
  await ready;
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.close();
  (await ready).close();
});

async function call(method, path, body, cookie) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json(), cookie: (res.headers.get('set-cookie') || '').split(';')[0] };
}

async function signIn(email) {
  const res = await call('POST', '/api/login', { email, password: PASSWORD });
  assert.equal(res.status, 200, `sign-in for ${email}`);
  return res.cookie;
}

const NEW_REPORT = {
  title: 'Stage lights flickering', room_id: 1, category_id: 4, urgency: 'High',
  description: 'Two stage spotlights flicker during rehearsals.'
};

test('sign-in rejects a wrong password', async () => {
  const res = await call('POST', '/api/login', { email: 'priya.shah@example.com', password: 'wrong' });
  assert.equal(res.status, 401);
});

test('Create, Read, Related tables: a volunteer reports a problem and sees it after reload', async () => {
  const priya = await signIn('priya.shah@example.com');

  const created = await call('POST', '/api/requests', NEW_REPORT, priya);
  assert.equal(created.status, 201);
  assert.match(created.body.message, /Report #\d+ was saved/);

  // "Reload": a fresh request to the server reads it back from the database.
  const detail = await call('GET', `/api/requests/${created.body.request_id}`, undefined, priya);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.room_name, 'Main Hall');          // room table
  assert.equal(detail.body.category_name, 'Lighting');       // category table
  assert.equal(detail.body.reported_by, 'Priya Shah');       // person table
  assert.equal(detail.body.history[0].note_text, 'Problem reported.'); // status_update table

  const mine = await call('GET', '/api/requests?scope=mine', undefined, priya);
  assert.ok(mine.body.some((r) => r.request_id === created.body.request_id));
  assert.ok(mine.body.every((r) => r.reported_by === 'Priya Shah'));
});

test('Server validation: missing or invalid fields are rejected and nothing is saved', async () => {
  const priya = await signIn('priya.shah@example.com');
  const before = (await call('GET', '/api/requests?scope=mine', undefined, priya)).body.length;

  const bad = await call('POST', '/api/requests', { title: '', room_id: 999, urgency: 'Whenever', description: 'short' }, priya);
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['category_id', 'description', 'room_id', 'title', 'urgency']);

  const after = (await call('GET', '/api/requests?scope=mine', undefined, priya)).body.length;
  assert.equal(after, before);
});

test('Protected access: no cookie, wrong role, and other people\'s reports are refused by the server', async () => {
  const noCookie = await call('POST', '/api/requests', NEW_REPORT);
  assert.equal(noCookie.status, 401);

  const priya = await signIn('priya.shah@example.com');
  const queue = await call('GET', '/api/requests?scope=all', undefined, priya);
  assert.equal(queue.status, 403);

  const update = await call('PATCH', '/api/requests/9', { status: 'Assigned', assigned_to_id: 2 }, priya);
  assert.equal(update.status, 403);

  // Request #7 was reported by Ava Thompson, not Priya.
  const other = await call('GET', '/api/requests/7', undefined, priya);
  assert.equal(other.status, 403);

  const forged = await call('GET', '/api/me', undefined, 'ws_session=eyJwaWQiOjF9.forged');
  assert.equal(forged.status, 401);
});

test('Update: staff assign a request, and the change is saved with history', async () => {
  const dana = await signIn('dana.lee@wellspring.example');

  const saved = await call('PATCH', '/api/requests/9', { status: 'Assigned', assigned_to_id: 2, note_text: 'Marcus will check the ballast.' }, dana);
  assert.equal(saved.status, 200);
  assert.match(saved.body.message, /now Assigned, assigned to Marcus Hill/);

  const detail = await call('GET', '/api/requests/9', undefined, dana);
  assert.equal(detail.body.status, 'Assigned');
  assert.equal(detail.body.assigned_to, 'Marcus Hill');
  assert.deepEqual(detail.body.history.map((h) => h.new_status), ['Reported', 'Assigned']);
  assert.equal(detail.body.history.at(-1).author, 'Dana Lee');
});

test('Update validation and business rules', async () => {
  const dana = await signIn('dana.lee@wellspring.example');

  const noAssignee = await call('PATCH', '/api/requests/9', { status: 'In Progress', assigned_to_id: 4 }, dana);
  assert.equal(noAssignee.status, 400);
  assert.match(noAssignee.body.fields.assigned_to_id, /only be assigned to Wellspring staff/);

  const backward = await call('PATCH', '/api/requests/6', { status: 'Assigned' }, dana);
  assert.equal(backward.status, 400);
  assert.match(backward.body.fields.status, /only moves forward/);

  // #7 has an unfinished vendor job, so the database refuses Resolved (Rule 4).
  const blocked = await call('PATCH', '/api/requests/7', { status: 'Resolved' }, dana);
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error, /vendor job must have a completed date/);
});

test('Filter and search: the staff queue returns the expected records in urgency order', async () => {
  const dana = await signIn('dana.lee@wellspring.example');

  const open = await call('GET', '/api/requests?scope=all&status=open', undefined, dana);
  assert.ok(open.body.length > 0);
  assert.ok(open.body.every((r) => r.status !== 'Resolved'));
  const rank = { Urgent: 1, High: 2, Medium: 3, Low: 4 };
  const ranks = open.body.map((r) => rank[r.urgency]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));

  const resolvedMainHall = await call('GET', '/api/requests?scope=all&status=Resolved&room_id=1', undefined, dana);
  assert.ok(resolvedMainHall.body.length >= 2);
  assert.ok(resolvedMainHall.body.every((r) => r.status === 'Resolved' && r.room_name === 'Main Hall'));

  const search = await call('GET', '/api/requests?scope=all&status=&search=ac', undefined, dana);
  assert.ok(search.body.every((r) => /ac/i.test(r.title)));

  const badFilter = await call('GET', '/api/requests?scope=all&status=Maybe', undefined, dana);
  assert.equal(badFilter.status, 400);
});
