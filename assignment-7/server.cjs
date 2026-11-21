// ============================================================
// WELLSPRING MAINTENANCE — EXPRESS SERVER (Assignment 7)
// ============================================================
// One workflow: a signed-in person reports a maintenance problem
// and follows it; Wellspring staff review the queue and update a
// request's status and assignee. Every change is saved in the
// PostgreSQL database (see database/wellspring.sql).
// ============================================================


// ------------------------------------------------------------
// 1. SET UP THE SERVER
// ------------------------------------------------------------

require('dotenv').config({ quiet: true });

const express = require('express');
const { connect } = require('./db.cjs');
const auth = require('./auth.cjs');

auth.secret(); // stop now with a clear message if SESSION_SECRET is missing

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(function (req, res, next) {
  if (req.body === undefined) req.body = {};
  next();
});
app.use(express.static('public'));

let db;
const ready = connect().then(function (connection) {
  db = connection;
  return connection;
});

const requireLogin = auth.requireLogin(() => db);
const requireStaff = auth.requireStaff;


// ------------------------------------------------------------
// 2. VALIDATION HELPERS
// ------------------------------------------------------------
// The server checks every value itself. Problems are collected per
// field so the page can show the user exactly what to correct.

const STATUSES = ['Reported', 'Assigned', 'In Progress', 'Resolved'];
const URGENCIES = ['Low', 'Medium', 'High', 'Urgent'];

class ValidationError extends Error {
  constructor(fields) {
    super('Some information is missing or not valid.');
    this.fields = fields;
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInt(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

// Reads :id from the URL.
app.param('id', function (req, res, next, value) {
  const id = positiveInt(value);
  if (!id) return res.status(400).json({ error: 'The request number must be a positive whole number.' });
  req.requestId = id;
  next();
});


// ------------------------------------------------------------
// 3. SIGN IN / SIGN OUT
// ------------------------------------------------------------

app.post('/api/login', async function (req, res) {
  const email = text(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const fields = {};
  if (!email) fields.email = 'Enter your email address.';
  if (!password) fields.password = 'Enter your password.';
  if (Object.keys(fields).length) throw new ValidationError(fields);

  const [found] = await db.query(
    `select p.person_id, p.full_name, p.person_type, a.password_hash
     from person p
     join account a on a.person_id = p.person_id
     where lower(p.email) = $1 and a.is_active`,
    [email]
  );

  // Check a hash even for unknown emails, so both cases look the same.
  const ok = auth.verifyPassword(password, found ? found.password_hash : auth.DUMMY_HASH);
  if (!found || !ok) {
    return res.status(401).json({ error: 'That email and password do not match an account.' });
  }

  auth.setSessionCookie(res, found.person_id);
  res.json({ person_id: found.person_id, full_name: found.full_name, person_type: found.person_type });
});

app.post('/api/logout', function (req, res) {
  auth.clearSessionCookie(res);
  res.json({ signedOut: true });
});

// Who is signed in? The page calls this on every load.
app.get('/api/me', requireLogin, function (req, res) {
  res.json(req.user);
});


// ------------------------------------------------------------
// 4. LISTS FOR THE FORMS
// ------------------------------------------------------------

app.get('/api/options', requireLogin, async function (req, res) {
  const rooms = await db.query('select room_id, room_name, floor from room where is_active order by room_name');
  const categories = await db.query('select category_id, category_name from category order by category_name');

  // Only staff assign requests, so only staff receive the staff list.
  const staff = req.user.person_type === 'Staff'
    ? await db.query("select person_id, full_name from person where person_type = 'Staff' order by full_name")
    : [];

  res.json({ rooms, categories, staff, statuses: STATUSES, urgencies: URGENCIES });
});


// ------------------------------------------------------------
// 5. CREATE — report a problem
// ------------------------------------------------------------
// POST /api/requests  { title, room_id, category_id, urgency, description }
// The reporter is ALWAYS the signed-in person; the body cannot choose it.

app.post('/api/requests', requireLogin, async function (req, res) {
  const title = text(req.body.title);
  const description = text(req.body.description);
  const urgency = req.body.urgency;
  const roomId = positiveInt(req.body.room_id);
  const categoryId = positiveInt(req.body.category_id);

  const fields = {};
  if (!title) fields.title = 'Enter a short title.';
  else if (title.length > 120) fields.title = 'Keep the title to 120 characters or fewer.';
  if (!roomId) fields.room_id = 'Choose the room where the problem is.';
  if (!categoryId) fields.category_id = 'Choose what kind of problem it is.';
  if (!URGENCIES.includes(urgency)) fields.urgency = 'Choose how urgent it is: Low, Medium, High or Urgent.';
  if (description.length < 10) fields.description = 'Describe what is wrong in at least 10 characters.';
  else if (description.length > 2000) fields.description = 'Keep the description to 2000 characters or fewer.';

  // The room and category must exist (and the room must be in use).
  if (roomId && !fields.room_id) {
    const [room] = await db.query('select 1 from room where room_id = $1 and is_active', [roomId]);
    if (!room) fields.room_id = 'Choose a room from the list.';
  }
  if (categoryId && !fields.category_id) {
    const [cat] = await db.query('select 1 from category where category_id = $1', [categoryId]);
    if (!cat) fields.category_id = 'Choose a kind of problem from the list.';
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);

  // One statement saves the request AND its first history entry.
  const [created] = await db.query(
    `with new_request as (
       insert into maintenance_request (room_id, category_id, reported_by_id, title, description, urgency)
       values ($1, $2, $3, $4, $5, $6)
       returning request_id, reported_by_id
     )
     insert into status_update (request_id, author_id, note_text, new_status)
     select request_id, reported_by_id, 'Problem reported.', 'Reported' from new_request
     returning request_id`,
    [roomId, categoryId, req.user.person_id, title, description, urgency]
  );

  res.status(201).json({ request_id: created.request_id, message: `Report #${created.request_id} was saved.` });
});


// ------------------------------------------------------------
// 6. READ — lists, with filter and search
// ------------------------------------------------------------
// GET /api/requests?scope=mine|all&status=open|<status>&room_id=&search=
//   scope=mine  any signed-in person: only reports THEY made
//   scope=all   staff only: every report (the maintenance queue)

const REQUEST_COLUMNS = `
  r.request_id, r.title, r.description, r.urgency, r.status,
  r.date_reported, r.date_resolved,
  r.room_id, room.room_name, room.floor,
  r.category_id, category.category_name,
  r.reported_by_id, reporter.full_name as reported_by,
  r.assigned_to_id, assignee.full_name as assigned_to`;

const REQUEST_JOINS = `
  from maintenance_request r
  join room                 on room.room_id = r.room_id
  join category             on category.category_id = r.category_id
  join person reporter      on reporter.person_id = r.reported_by_id
  left join person assignee on assignee.person_id = r.assigned_to_id`;

app.get('/api/requests', requireLogin, async function (req, res) {
  const scope = req.query.scope === 'all' ? 'all' : 'mine';
  if (scope === 'all' && req.user.person_type !== 'Staff') {
    return res.status(403).json({ error: 'Only Wellspring staff can see every report. Use "My reports" to see yours.' });
  }

  const status = text(req.query.status);
  if (status && status !== 'open' && !STATUSES.includes(status)) {
    throw new ValidationError({ status: 'Choose Open, All, or one of: ' + STATUSES.join(', ') + '.' });
  }
  const roomId = req.query.room_id ? positiveInt(req.query.room_id) : null;
  if (req.query.room_id && !roomId) throw new ValidationError({ room_id: 'Choose a room from the list.' });
  const search = text(req.query.search).slice(0, 100);

  const rows = await db.query(
    `select ${REQUEST_COLUMNS}
     ${REQUEST_JOINS}
     where ($1::int is null or r.reported_by_id = $1)
       and ($2::text is null or ($2 = 'open' and r.status <> 'Resolved') or r.status = $2)
       and ($3::int is null or r.room_id = $3)
       and ($4::text is null or r.title ilike '%' || $4 || '%')
     order by case r.urgency when 'Urgent' then 1 when 'High' then 2 when 'Medium' then 3 else 4 end,
              r.date_reported desc`,
    [scope === 'mine' ? req.user.person_id : null, status || null, roomId, search || null]
  );

  res.json(rows);
});


// GET /api/requests/:id — one request with its history.
// Staff may open any request; everyone else only their own.
app.get('/api/requests/:id', requireLogin, async function (req, res) {
  const [request] = await db.query(`select ${REQUEST_COLUMNS} ${REQUEST_JOINS} where r.request_id = $1`, [req.requestId]);
  if (!request) {
    return res.status(404).json({ error: `Report #${req.requestId} does not exist.` });
  }
  if (req.user.person_type !== 'Staff' && request.reported_by_id !== req.user.person_id) {
    return res.status(403).json({ error: 'You can only view reports you made.' });
  }

  const history = await db.query(
    `select su.update_id, su.created_at, su.new_status, su.note_text, author.full_name as author
     from status_update su
     join person author on author.person_id = su.author_id
     where su.request_id = $1
     order by su.created_at, su.update_id`,
    [req.requestId]
  );

  res.json({ ...request, history });
});


// ------------------------------------------------------------
// 7. UPDATE — staff change status and/or assignee
// ------------------------------------------------------------
// PATCH /api/requests/:id  { status, assigned_to_id?, note_text? }
// The request row keeps the current state; a status_update row keeps
// the history. The database also refuses changes that break Rules 2-4.

app.patch('/api/requests/:id', requireLogin, requireStaff, async function (req, res) {
  const [current] = await db.query(
    'select request_id, status, assigned_to_id from maintenance_request where request_id = $1',
    [req.requestId]
  );
  if (!current) {
    return res.status(404).json({ error: `Report #${req.requestId} does not exist.` });
  }

  const status = req.body.status;
  const note = text(req.body.note_text);
  const hasAssignee = req.body.assigned_to_id !== undefined && req.body.assigned_to_id !== null && req.body.assigned_to_id !== '';
  const assignedTo = hasAssignee ? positiveInt(req.body.assigned_to_id) : current.assigned_to_id;

  const fields = {};
  if (!STATUSES.includes(status)) fields.status = 'Choose a status: ' + STATUSES.join(', ') + '.';
  else if (STATUSES.indexOf(status) < STATUSES.indexOf(current.status)) {
    fields.status = `Status only moves forward. This report is already ${current.status}.`;
  }
  if (hasAssignee && !assignedTo) fields.assigned_to_id = 'Choose a staff member from the list.';
  else if (hasAssignee) {
    const [staff] = await db.query("select 1 from person where person_id = $1 and person_type = 'Staff'", [assignedTo]);
    if (!staff) fields.assigned_to_id = 'Requests can only be assigned to Wellspring staff.';
  }
  if (!fields.status && !fields.assigned_to_id && status !== 'Reported' && !assignedTo) {
    fields.assigned_to_id = `Assign a staff member before moving this report to ${status}.`;
  }
  if (note.length > 2000) fields.note_text = 'Keep the note to 2000 characters or fewer.';
  if (!Object.keys(fields).length && status === current.status && assignedTo === current.assigned_to_id) {
    fields.status = 'Nothing changed. Choose a new status or a different staff member.';
  }
  if (Object.keys(fields).length) throw new ValidationError(fields);

  const statusChanged = status !== current.status;
  const [assignee] = await db.query('select full_name from person where person_id = $1', [assignedTo]);
  const assigneeName = assignee ? assignee.full_name : 'nobody';
  const autoNote = statusChanged
    ? `Status changed to ${status}.` + (assignedTo !== current.assigned_to_id ? ` Assigned to ${assigneeName}.` : '')
    : `Reassigned to ${assigneeName}.`;

  // UPDATE and history INSERT run as ONE statement: both save or neither does.
  await db.query(
    `with updated as (
       update maintenance_request
       set status = $2, assigned_to_id = $3
       where request_id = $1
       returning request_id
     )
     insert into status_update (request_id, author_id, note_text, new_status)
     select request_id, $4, $5, $6 from updated`,
    [req.requestId, status, assignedTo, req.user.person_id, note || autoNote, statusChanged ? status : null]
  );

  res.json({
    request_id: req.requestId,
    status,
    assigned_to: assigneeName,
    message: `Saved: report #${req.requestId} is now ${status}, assigned to ${assigneeName}.`
  });
});


// ------------------------------------------------------------
// 8. ERRORS
// ------------------------------------------------------------
// Validation problems explain what to fix. Database rule errors are
// translated into plain messages. Anything unexpected is logged on
// the server only, without exposing details to the browser.

const CONSTRAINT_MESSAGES = {
  request_assigned_before_progress: { field: 'assigned_to_id', message: 'Assign a staff member before moving past Reported.' },
  request_resolved_after_reported: { field: 'status', message: 'The resolved date cannot be before the reported date.' }
};

app.use('/api', function (req, res) {
  res.status(404).json({ error: 'There is no such API route.' });
});

app.use(function (error, req, res, next) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.message, fields: error.fields });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body must be valid JSON.' });
  }
  if (error.code === 'P0001') { // a business rule trigger in wellspring.sql
    const message = error.message.replace(/^Rule \d+: /, '');
    return res.status(409).json({ error: message.charAt(0).toUpperCase() + message.slice(1) + '.', rule: error.message });
  }
  if (error.code === '23514') { // check constraint
    const known = Object.entries(CONSTRAINT_MESSAGES).find(([name]) => error.message.includes(name));
    if (known) return res.status(400).json({ error: known[1].message, fields: { [known[1].field]: known[1].message } });
    return res.status(400).json({ error: 'A value is not allowed by the database rules.' });
  }
  if (error.code === '23503') {
    return res.status(400).json({ error: 'A linked room, category or person does not exist.' });
  }

  console.error(error);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});


// ------------------------------------------------------------
// 9. START
// ------------------------------------------------------------

const port = Number(process.env.PORT) || 3000;

if (require.main === module) {
  ready.then(function (connection) {
    app.listen(port, function () {
      console.log(`Wellspring maintenance running on http://localhost:${port} (database: ${connection.mode})`);
    });
  }).catch(function (error) {
    console.error('Could not start:', error.message);
    process.exit(1);
  });
}

module.exports = { app, ready };
