// ============================================================
// GREENBRIDGE REQUEST MANAGER — EXPRESS SERVER
// ============================================================
// This server receives requests from the browser and sends
// JSON responses. It can store records temporarily (local mode)
// or use the Supabase database (supabase mode).
// ============================================================


// ------------------------------------------------------------
// 1. SET UP THE SERVER
// ------------------------------------------------------------

// Load settings from the .env file.
require('dotenv').config();

// Import Express and create the server application.
const express = require('express');
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

// Serve the HTML, CSS, and browser JavaScript in public/.
app.use(express.static('public'));


// ------------------------------------------------------------
// 2. PREPARE SAMPLE RECORDS FOR LOCAL MODE
// ------------------------------------------------------------

// These records act like database rows while we practice.
const seed = [
  {
    id: 1,
    title: 'Broken light',
    location: 'Lobby',
    description: 'Light flickers',
    status: 'submitted'
  },
  {
    id: 2,
    title: 'Leaking faucet',
    location: 'Kitchen',
    description: 'Dripping tap',
    status: 'in_progress'
  }
];

// Make a working copy. Changes disappear when the server restarts.
let records = seed.map(function (record) {
  return { ...record };
});

// Give each newly created local record a unique number.
let nextId = 3;


// ------------------------------------------------------------
// 3. CONNECT TO SUPABASE (ONLY WHEN SELECTED)
// ------------------------------------------------------------

let db;

if (mode === 'supabase') {
  const { createClient } = require('@supabase/supabase-js');

  // Database credentials belong on the server, never in app.js.
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase mode needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  }

  // createClient() prepares the connection to Supabase.
  db = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false
      }
    }
  );
}




// ------------------------------------------------------------
// 4. HELPER FUNCTIONS
// ------------------------------------------------------------

// table() selects the database table for a Supabase query.
// Example: table().select('*') reads rows from this table.
function table() {
  return db.from('maintenance_requests');
}


// cleanText() accepts text, removes surrounding spaces,
// and limits its length. Other input types become empty text.
function cleanText(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmedText = value.trim();
  return trimmedText.slice(0, maxLength);
}


// fail() reports a database error without exposing its details
// to the browser. The details appear in the server terminal.
function fail(res, error) {
  console.error(error);

  return res.status(500).json({
    error: 'Database operation failed; check server logs'
  });
}


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
// 5. SECURITY DEMONSTRATION
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
// 6. TEST ROUTE — DOES THE SERVER RESPOND?
// ------------------------------------------------------------

// GET /api/hello
// res.json() sends a JSON response back to the browser.
app.get('/api/hello', function (req, res) {
  res.json({
    message: 'Hello from Express!',
    mode: mode
  });
});








// ------------------------------------------------------------
// 7. READ — GET /api/requests?search=light
// ------------------------------------------------------------

// GET reads records. A search value can be sent in the URL.
app.get('/api/requests', async function (req, res) {
  // req.query.search reads the search text after ?search=.
  const search = cleanText(req.query.search, 100);

  if (mode === 'local') {
    // filter() keeps records whose titles match the search.
    const matchingRecords = records.filter(function (record) {
      return record.title.toLowerCase().includes(search.toLowerCase());
    });

    return res.json(matchingRecords);
  }

  // .select() chooses the columns to return.
  // .is() excludes archived records.
  // .order() sorts the results by ID.
  let query = table()
    .select('id,title,location,description,status')
    .is('archived_at', null)
    .order('id');

  if (search) {
    // Remove wildcard characters for a simple literal search.
    const safeSearch = search.replace(/[%_,]/g, '');

    // .ilike() performs a case-insensitive title search.
    query = query.ilike('title', `%${safeSearch}%`);
  }

  // await waits for Supabase to return data or an error.
  const { data, error } = await query;

  if (error) {
    return fail(res, error);
  }

  res.json(data);
});








// ------------------------------------------------------------
// 8. CREATE — POST /api/requests
// ------------------------------------------------------------

// POST creates a new record from JSON sent by the browser.
app.post('/api/requests', async function (req, res) {
  // req.body contains the JSON values from the request.
  const title = cleanText(req.body.title, 120);
  const location = cleanText(req.body.location, 100);
  const description = cleanText(req.body.description, 2000);

  // Check required values before storing anything.
  if (!title || !location || !description) {
    return res.status(400).json({
      error: 'Title, location and description are required'
    });
  }

  if (mode === 'local') {
    const newRecord = {
      id: nextId,
      title: title,
      location: location,
      description: description,
      status: 'submitted'
    };

    nextId = nextId + 1;

    // push() adds the new record to our temporary array.
    records.push(newRecord);

    // 201 means a new record was created successfully.
    return res.status(201).json(newRecord);
  }

  // .insert() adds a new row to the database.
  // .select() asks Supabase to return the created row.
  // .single() returns one object rather than an array.
  const { data, error } = await table()
    .insert({ title, location, description, status: 'submitted' })
    .select('id,title,location,description,status')
    .single();

  if (error) {
    return fail(res, error);
  }

  res.status(201).json(data);
});








// ------------------------------------------------------------
// 9. UPDATE — PATCH /api/requests/:id
// ------------------------------------------------------------

// PATCH changes the status of an existing record.
app.patch('/api/requests/:id', async function (req, res) {
  const status = req.body.status;

  // Only these three status values are allowed.
  const allowedStatuses = ['submitted', 'in_progress', 'completed'];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  if (mode === 'local') {
    // find() locates the record with the requested ID.
    const record = records.find(function (item) {
      return item.id === req.recordId;
    });

    if (!record) {
      return res.sendStatus(404);
    }

    record.status = status;
    return res.json(record);
  }

  // .update() supplies the changed value.
  // .eq('id', ...) targets one ID.
  // .is('archived_at', null) targets only active records.
  // .maybeSingle() returns one row, or null if none matched.
  const { data, error } = await table()
    .update({ status: status })
    .eq('id', req.recordId)
    .is('archived_at', null)
    .select('id,title,location,description,status')
    .maybeSingle();

  if (error) {
    return fail(res, error);
  }

  if (!data) {
    return res.sendStatus(404);
  }

  res.json(data);
});








// ------------------------------------------------------------
// 10. DELETE — DELETE /api/requests/:id
// ------------------------------------------------------------

// DELETE permanently removes a record. Use test records only.
app.delete('/api/requests/:id', async function (req, res) {
  if (mode === 'local') {
    const countBefore = records.length;

    // filter() creates an array without the selected record.
    records = records.filter(function (record) {
      return record.id !== req.recordId;
    });

    if (countBefore === records.length) {
      return res.sendStatus(404);
    }

    return res.json({ deleted: req.recordId });
  }

  // .delete() removes matching database rows.
  // .eq() limits the deletion to the requested ID.
  const { data, error } = await table()
    .delete()
    .eq('id', req.recordId)
    .select('id')
    .maybeSingle();

  if (error) {
    return fail(res, error);
  }

  if (!data) {
    return res.sendStatus(404);
  }

  res.json({ deleted: data.id });
});







// ------------------------------------------------------------
// 11. START LISTENING FOR REQUESTS
// ------------------------------------------------------------

// Use the configured port, or port 3000 when none is provided.
let port = Number(process.env.PORT);

if (!port) {
  port = 3000;
}

// app.listen() starts the server. This message appears in
// the terminal when the server is ready.
app.listen(port, function () {
  console.log(`Greenbridge running on http://localhost:${port} (${mode})`);
});
