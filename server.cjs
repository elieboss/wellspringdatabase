// ============================================================
// WELLSPRING MAINTENANCE — EXPRESS SERVER
// ============================================================
// This server receives requests from the browser and sends
// JSON responses. All data lives in ONE PostgreSQL database
// (see database/schema.sql). It can run on an in-memory copy
// (local mode) or on Supabase (supabase mode).
// ============================================================


// ------------------------------------------------------------
// 1. SET UP THE SERVER
// ------------------------------------------------------------

// Load settings from the .env file.
require('dotenv').config({ quiet: true });

// Import Express and create the server application.
const express = require('express');
const { connect } = require('./db.cjs');
const app = express();

// Choose where records will be stored.
let mode = process.env.DATA_MODE;

if (!mode) {
  mode = 'local';
}

if (mode !== 'local' && mode !== 'supabase') {
  throw new Error('DATA_MODE must be local or supabase');
}

// Read JSON sent by the browser in POST and PATCH requests.
app.use(express.json());

// Requests without a JSON body get an empty object instead.
app.use(function (req, res, next) {
  if (req.body === undefined) {
    req.body = {};
  }
  next();
});

// Serve the HTML, CSS, and browser JavaScript in public/.
app.use(express.static('public'));


// ------------------------------------------------------------
// 2. CONNECT TO THE DATABASE
// ------------------------------------------------------------

// db.query(sql, params) runs SQL and returns an array of rows.
let db;

// ready finishes once the database is loaded and connected.
const ready = connect(mode).then(function (connection) {
  db = connection;
  return connection;
});


// ------------------------------------------------------------
// 3. HELPER FUNCTIONS
// ------------------------------------------------------------

// cleanText() accepts text, removes surrounding spaces,
// and limits its length. Other input types become empty text.
function cleanText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmedText = value.trim();
  return trimmedText.slice(0, maxLength);
}


// badRequest() creates an error that becomes a 400 response.
function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}


// readId() checks that a value is a positive whole number.
// Empty values are allowed only when required is false.
function readId(value, fieldName, required = true) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw badRequest(`${fieldName} is required`);
    }
    return null;
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw badRequest(`${fieldName} must be a positive integer`);
  }

  return id;
}


// readDate() accepts dates written as YYYY-MM-DD.
function readDate(value, fieldName, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw badRequest(`${fieldName} is required`);
    }
    return null;
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${fieldName} must be a date like 2026-10-31`);
  }

  return value;
}


// readCost() accepts a money amount of 0 or more (Rule 10).
function readCost(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const cost = Number(value);

  if (!Number.isFinite(cost) || cost < 0) {
    throw badRequest(`${fieldName} must be 0 or more`);
  }

  return cost;
}


// These lists match the check rules in schema.sql.
const REQUEST_STATUSES = ['Reported', 'Assigned', 'In Progress', 'Resolved'];
const URGENCIES = ['Low', 'Medium', 'High', 'Urgent'];


// app.param() checks the :id part of routes such as
// /api/requests/5 before the matching route handler runs.
app.param('id', function (req, res, next, value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1) {
    return res.status(400).json({
      error: 'ID must be a positive integer'
    });
  }

  // Save the checked ID so the route can use it later.
  req.recordId = id;

  // next() tells Express to continue processing the request.
  next();
});


// ============================================================
// 4. SECURITY DEMONSTRATION
// Authentication, Authorization, and Protected Routes
//
// FOR TEACHING ONLY:
// This simulates a signed-in user.
// It does not verify real login credentials.
// ============================================================


// STEP 1: Simulate a signed-in user.

const currentUser = {
  name: 'Alex',
  role: 'staff'
};


// STEP 2: Authentication check.
// Determine whether a user exists.

function requireLogin(req, res, next) {

  if (currentUser === null) {

    return res.status(401).json({
      error: 'You must sign in.'
    });

  }

  // Allow Express to continue.
  next();
}


// STEP 3: Authorization check.
// Determine whether the user is a manager.

function requireManager(req, res, next) {

  if (currentUser.role !== 'manager') {

    return res.status(403).json({
      error: 'Manager permission required.'
    });

  }

  // Allow Express to continue.
  next();
}


// STEP 4: Create a protected route.
// Express checks login and role before responding.

app.get(
  '/api/admin',
  requireLogin,
  requireManager,
  function (req, res) {

    res.json({
      message: 'Welcome to the manager area!'
    });

  }
);


// ------------------------------------------------------------
// 5. TEST ROUTE — DOES THE SERVER RESPOND?
// ------------------------------------------------------------

// GET /api/hello
app.get('/api/hello', function (req, res) {
  res.json({
    message: 'Hello from the Wellspring server!',
    mode: mode
  });
});


// ------------------------------------------------------------
// 6. LOOKUP LISTS — GET /api/lookups
// ------------------------------------------------------------

// The browser uses these lists to fill its drop-down menus,
// so staff choose existing rooms, people and vendors instead
// of retyping them.
app.get('/api/lookups', async function (req, res) {
  const rooms = await db.query(
    'select room_id, room_name, floor from room where is_active order by room_name'
  );
  const categories = await db.query(
    'select category_id, category_name from category order by category_name'
  );
  const people = await db.query(
    'select person_id, full_name, person_type from person order by full_name'
  );
  const serviceTypes = await db.query(
    'select service_type_id, service_name from service_type order by service_name'
  );
  const vendors = await db.query(
    'select vendor_id, vendor_name from vendor where is_active order by vendor_name'
  );

  res.json({
    rooms,
    categories,
    people,
    serviceTypes,
    vendors,
    statuses: REQUEST_STATUSES,
    urgencies: URGENCIES
  });
});


// ------------------------------------------------------------
// 7. READ REQUESTS — GET /api/requests?room_id=1&status=open
// ------------------------------------------------------------

// The columns every request list shows, with names instead of IDs.
const REQUEST_COLUMNS = `
  r.request_id, r.title, r.description, r.urgency, r.status,
  r.date_reported, r.date_resolved,
  r.room_id, room.room_name,
  r.category_id, category.category_name,
  r.reported_by_id, reporter.full_name as reported_by,
  r.assigned_to_id, assignee.full_name as assigned_to
`;

const REQUEST_JOINS = `
  from maintenance_request r
  join room                 on room.room_id = r.room_id
  join category             on category.category_id = r.category_id
  join person reporter      on reporter.person_id = r.reported_by_id
  left join person assignee on assignee.person_id = r.assigned_to_id
`;

// Requirement 2: see open problems in one room before booking it.
app.get('/api/requests', async function (req, res) {
  const roomId = readId(req.query.room_id, 'room_id', false);
  const search = cleanText(req.query.search, 100);
  const status = cleanText(req.query.status, 20);

  if (status && status !== 'open' && !REQUEST_STATUSES.includes(status)) {
    throw badRequest('status must be open or one of: ' + REQUEST_STATUSES.join(', '));
  }

  // Each filter is skipped when its value is null.
  const rows = await db.query(
    `select ${REQUEST_COLUMNS}
     ${REQUEST_JOINS}
     where ($1::int is null or r.room_id = $1)
       and ($2::text is null or r.title ilike '%' || $2 || '%')
       and ($3::text is null
            or ($3 = 'open' and r.status <> 'Resolved')
            or r.status = $3)
     order by r.date_reported desc`,
    [roomId, search || null, status || null]
  );

  res.json(rows);
});


// GET /api/requests/:id — one request with its full history,
// vendor jobs and deliveries.
app.get('/api/requests/:id', async function (req, res) {
  const found = await db.query(
    `select ${REQUEST_COLUMNS} ${REQUEST_JOINS} where r.request_id = $1`,
    [req.recordId]
  );

  if (found.length === 0) {
    return res.sendStatus(404);
  }

  // StatusUpdate rows, oldest first, form the request's history.
  const history = await db.query(
    `select su.update_id, su.created_at, su.new_status, su.note_text,
            su.author_id, author.full_name as author
     from status_update su
     join person author on author.person_id = su.author_id
     where su.request_id = $1
     order by su.created_at, su.update_id`,
    [req.recordId]
  );

  const jobs = await db.query(
    `select j.job_id, j.vendor_id, v.vendor_name, j.job_description,
            j.scheduled_date::text, j.completed_date::text,
            j.final_cost::float8 as final_cost
     from vendor_job j
     join vendor v on v.vendor_id = j.vendor_id
     where j.request_id = $1
     order by j.job_id`,
    [req.recordId]
  );

  const deliveries = await db.query(
    `select d.delivery_id, d.job_id, d.vendor_id, v.vendor_name, d.item_description,
            d.status, d.date_expected::text, d.date_received::text,
            signer.full_name as received_by, d.cost::float8 as cost
     from delivery d
     join vendor v             on v.vendor_id = d.vendor_id
     join vendor_job j         on j.job_id = d.job_id
     left join person signer   on signer.person_id = d.received_by_id
     where j.request_id = $1
     order by d.delivery_id`,
    [req.recordId]
  );

  res.json({ ...found[0], history, jobs, deliveries });
});


// ------------------------------------------------------------
// 8. CREATE A REQUEST — POST /api/requests
// ------------------------------------------------------------

// Requirement 1: report a new problem (what, where, what kind,
// how urgent). The first StatusUpdate is written at the same time,
// so every request's history starts with "Reported".
app.post('/api/requests', async function (req, res) {
  const title = cleanText(req.body.title, 120);
  const description = cleanText(req.body.description, 2000);
  const urgency = req.body.urgency;
  const roomId = readId(req.body.room_id, 'room_id');
  const categoryId = readId(req.body.category_id, 'category_id');
  const reportedById = readId(req.body.reported_by_id, 'reported_by_id');

  // Rule 1: check required values before storing anything.
  if (!title || !description) {
    throw badRequest('Title and description are required');
  }

  if (!URGENCIES.includes(urgency)) {
    throw badRequest('urgency must be one of: ' + URGENCIES.join(', '));
  }

  // One SQL statement inserts the request AND its first history row,
  // so the two are always saved together.
  const created = await db.query(
    `with new_request as (
       insert into maintenance_request
         (room_id, category_id, reported_by_id, title, description, urgency)
       values ($1, $2, $3, $4, $5, $6)
       returning request_id, reported_by_id
     )
     insert into status_update (request_id, author_id, note_text, new_status)
     select request_id, reported_by_id, 'Problem reported.', 'Reported'
     from new_request
     returning request_id`,
    [roomId, categoryId, reportedById, title, description, urgency]
  );

  // 201 means a new record was created successfully.
  res.status(201).json({ request_id: created[0].request_id });
});


// ------------------------------------------------------------
// 9. CHANGE STATUS — PATCH /api/requests/:id/status
// ------------------------------------------------------------

// Requirement 3: move a request forward (Reported -> Assigned ->
// In Progress -> Resolved) while PRESERVING its history.
// The request row keeps only the current status; a new
// StatusUpdate row records who changed it, when, and why.
// The database refuses moves that break Rules 2-5.
app.patch('/api/requests/:id/status', async function (req, res) {
  const status = req.body.status;
  const authorId = readId(req.body.author_id, 'author_id');
  const assignedToId = readId(req.body.assigned_to_id, 'assigned_to_id', false);
  let note = cleanText(req.body.note_text, 2000);

  if (!REQUEST_STATUSES.includes(status)) {
    throw badRequest('status must be one of: ' + REQUEST_STATUSES.join(', '));
  }

  if (!note) {
    note = `Status changed to ${status}.`;
  }

  // UPDATE and INSERT run as one statement: both succeed or neither does.
  const changed = await db.query(
    `with updated as (
       update maintenance_request
       set status = $2,
           assigned_to_id = coalesce($3, assigned_to_id)
       where request_id = $1
       returning request_id, status
     )
     insert into status_update (request_id, author_id, note_text, new_status)
     select request_id, $4, $5, status
     from updated
     returning update_id`,
    [req.recordId, status, assignedToId, authorId, note]
  );

  if (changed.length === 0) {
    return res.sendStatus(404);
  }

  res.json({ request_id: req.recordId, status, update_id: changed[0].update_id });
});


// ------------------------------------------------------------
// 10. ADD A NOTE — POST /api/requests/:id/updates
// ------------------------------------------------------------

// Requirement 5: add a dated note without changing the status.
app.post('/api/requests/:id/updates', async function (req, res) {
  const authorId = readId(req.body.author_id, 'author_id');
  const note = cleanText(req.body.note_text, 2000);

  if (!note) {
    throw badRequest('note_text is required');
  }

  const created = await db.query(
    `insert into status_update (request_id, author_id, note_text)
     values ($1, $2, $3)
     returning update_id, created_at`,
    [req.recordId, authorId, note]
  );

  res.status(201).json(created[0]);
});


// ------------------------------------------------------------
// 11. FIND VENDORS — GET /api/vendors?service_type_id=1
// ------------------------------------------------------------

// Requirement 8: look up active vendors by the service they offer.
// VendorService is the many-to-many link between the two tables.
app.get('/api/vendors', async function (req, res) {
  const serviceTypeId = readId(req.query.service_type_id, 'service_type_id', false);

  const rows = await db.query(
    `select v.vendor_id, v.vendor_name, v.contact_name, v.email, v.phone,
            string_agg(s.service_name, ', ' order by s.service_name) as services
     from vendor v
     join vendor_service vs on vs.vendor_id = v.vendor_id
     join service_type s    on s.service_type_id = vs.service_type_id
     where v.is_active
       and ($1::int is null or exists (
         select 1 from vendor_service match
         where match.vendor_id = v.vendor_id and match.service_type_id = $1
       ))
     group by v.vendor_id
     order by v.vendor_name`,
    [serviceTypeId]
  );

  res.json(rows);
});


// ------------------------------------------------------------
// 12. VENDOR JOBS — POST /api/jobs, PATCH /api/jobs/:id
// ------------------------------------------------------------

// Requirement 9: record a vendor job connected to its request.
// The foreign key guarantees the request exists (Rule 7) and
// the database refuses inactive vendors (Rule 9).
app.post('/api/jobs', async function (req, res) {
  const vendorId = readId(req.body.vendor_id, 'vendor_id');
  const requestId = readId(req.body.request_id, 'request_id');
  const description = cleanText(req.body.job_description, 2000);
  const scheduledDate = readDate(req.body.scheduled_date, 'scheduled_date');

  if (!description) {
    throw badRequest('job_description is required');
  }

  const created = await db.query(
    `insert into vendor_job (vendor_id, request_id, job_description, scheduled_date)
     values ($1, $2, $3, $4)
     returning job_id`,
    [vendorId, requestId, description, scheduledDate]
  );

  res.status(201).json(created[0]);
});

// Requirement 10: finish a job with its completed date and final cost.
app.patch('/api/jobs/:id', async function (req, res) {
  const completedDate = readDate(req.body.completed_date, 'completed_date', true);
  const finalCost = readCost(req.body.final_cost, 'final_cost');

  const updated = await db.query(
    `update vendor_job
     set completed_date = $2,
         final_cost = coalesce($3, final_cost)
     where job_id = $1
     returning job_id, completed_date::text, final_cost::float8 as final_cost`,
    [req.recordId, completedDate, finalCost]
  );

  if (updated.length === 0) {
    return res.sendStatus(404);
  }

  res.json(updated[0]);
});


// ------------------------------------------------------------
// 13. DELIVERIES — POST /api/deliveries, PATCH /api/deliveries/:id
// ------------------------------------------------------------

// Requirement 11: record a delivery, then mark it received.
app.post('/api/deliveries', async function (req, res) {
  const vendorId = readId(req.body.vendor_id, 'vendor_id');
  const jobId = readId(req.body.job_id, 'job_id', false);
  const item = cleanText(req.body.item_description, 500);
  const dateExpected = readDate(req.body.date_expected, 'date_expected', true);
  const cost = readCost(req.body.cost, 'cost');

  if (!item) {
    throw badRequest('item_description is required');
  }

  const created = await db.query(
    `insert into delivery (vendor_id, job_id, item_description, date_expected, cost)
     values ($1, $2, $3, $4, $5)
     returning delivery_id, status`,
    [vendorId, jobId, item, dateExpected, cost]
  );

  res.status(201).json(created[0]);
});

// Rule 8: Received needs a received date and the person who signed.
app.patch('/api/deliveries/:id', async function (req, res) {
  const status = req.body.status;
  let dateReceived = null;
  let receivedById = null;

  if (status === 'Received') {
    dateReceived = readDate(req.body.date_received, 'date_received', true);
    receivedById = readId(req.body.received_by_id, 'received_by_id');
  } else if (status !== 'Cancelled') {
    throw badRequest('status must be Received or Cancelled');
  }

  const updated = await db.query(
    `update delivery
     set status = $2, date_received = $3, received_by_id = $4
     where delivery_id = $1
     returning delivery_id, status, date_expected::text, date_received::text`,
    [req.recordId, status, dateReceived, receivedById]
  );

  if (updated.length === 0) {
    return res.sendStatus(404);
  }

  res.json(updated[0]);
});


// ------------------------------------------------------------
// 14. REPORTS — GET /api/reports/:name
// ------------------------------------------------------------

// Requirements 6 and 12: questions leadership asks. These are the
// same queries as database/queries.sql (Assignment 5).
const REPORTS = {
  // Which maintenance requests remain unresolved?
  'unresolved': `
    select r.request_id, r.title, room.room_name, r.urgency, r.status,
           assignee.full_name as assigned_to, r.date_reported
    from maintenance_request r
    join room                 on room.room_id = r.room_id
    left join person assignee on assignee.person_id = r.assigned_to_id
    where r.status <> 'Resolved'
    order by r.date_reported`,

  // How many maintenance requests have occurred in each room?
  'requests-by-room': `
    select room.room_name,
           count(r.request_id)::int as total_requests,
           (count(r.request_id) filter (where r.status <> 'Resolved'))::int as open_requests
    from room
    left join maintenance_request r on r.room_id = room.room_id
    group by room.room_id, room.room_name
    order by total_requests desc, room.room_name`,

  // Which room and problem type keep coming back?
  'repeat-problems': `
    select room.room_name, category.category_name, count(*)::int as times_reported
    from maintenance_request r
    join room     on room.room_id = r.room_id
    join category on category.category_id = r.category_id
    group by room.room_name, category.category_name
    having count(*) > 1
    order by times_reported desc`,

  // What is the total repair cost for each vendor?
  'vendor-costs': `
    select v.vendor_name,
           coalesce(jobs.job_count, 0)::int as jobs,
           coalesce(jobs.job_total, 0)::float8 as job_cost,
           coalesce(parts.delivery_total, 0)::float8 as delivery_cost,
           (coalesce(jobs.job_total, 0) + coalesce(parts.delivery_total, 0))::float8 as total_cost
    from vendor v
    left join (
      select vendor_id, count(*) as job_count, sum(final_cost) as job_total
      from vendor_job group by vendor_id
    ) jobs on jobs.vendor_id = v.vendor_id
    left join (
      select vendor_id, sum(cost) as delivery_total
      from delivery where status = 'Received' group by vendor_id
    ) parts on parts.vendor_id = v.vendor_id
    order by total_cost desc, v.vendor_name`,

  // Which deliveries arrived after their expected dates?
  'late-deliveries': `
    select d.delivery_id, v.vendor_name, d.item_description,
           d.date_expected::text, d.date_received::text,
           d.date_received - d.date_expected as days_late
    from delivery d
    join vendor v on v.vendor_id = d.vendor_id
    where d.status = 'Received' and d.date_received > d.date_expected
    order by days_late desc`
};

app.get('/api/reports/:name', async function (req, res) {
  const sql = REPORTS[req.params.name];

  if (!sql) {
    return res.status(404).json({
      error: 'Unknown report. Try: ' + Object.keys(REPORTS).join(', ')
    });
  }

  res.json(await db.query(sql));
});


// ------------------------------------------------------------
// 15. ERROR HANDLING
// ------------------------------------------------------------

// Friendly messages for the named check rules in schema.sql.
const CONSTRAINT_MESSAGES = {
  request_assigned_before_progress: 'Rule 2: assign a staff member before moving past Reported',
  request_resolved_date_matches_status: 'Rule 5: date_resolved is only filled in when Resolved',
  request_resolved_after_reported: 'Rule 5: date_resolved cannot be before date_reported',
  job_completed_after_scheduled: 'Rule 10: completed date cannot be before the scheduled date',
  delivery_received_details: 'Rule 8: a received delivery needs a received date and who signed for it'
};

// Express sends any error thrown in a route here.
// Business-rule errors are explained to the browser. Anything
// unexpected is logged in the terminal without exposing details.
app.use(function (error, req, res, next) {
  // Our own validation errors from badRequest().
  if (error.status === 400) {
    return res.status(400).json({ error: error.message });
  }

  // Malformed JSON sent by the browser.
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }

  // PostgreSQL error codes for broken rules.
  switch (error.code) {
    case 'P0001':   // raise exception in a schema.sql trigger
      return res.status(409).json({ error: error.message });
    case '23514': { // check rule
      const name = error.constraint || (error.message.match(/constraint "([^"]+)"/) || [])[1];
      return res.status(400).json({
        error: CONSTRAINT_MESSAGES[name] || `A value breaks a database rule (${name})`
      });
    }
    case '23503':   // foreign key
      return res.status(400).json({ error: 'A linked record (room, person, vendor, request, ...) does not exist' });
    case '23505':   // unique
      return res.status(409).json({ error: 'That name is already used' });
    case '23502':   // not null
      return res.status(400).json({ error: 'A required value is missing' });
  }

  console.error(error);
  res.status(500).json({ error: 'Database operation failed; check server logs' });
});


// ------------------------------------------------------------
// 16. START LISTENING FOR REQUESTS
// ------------------------------------------------------------

// Use the configured port, or port 3000 when none is provided.
let port = Number(process.env.PORT);

if (!port) {
  port = 3000;
}

// Only listen when run with `npm start`, not when tests load this file.
if (require.main === module) {
  ready.then(function () {
    app.listen(port, function () {
      console.log(`Wellspring running on http://localhost:${port} (${mode})`);
    });
  });
}

module.exports = { app, ready };
