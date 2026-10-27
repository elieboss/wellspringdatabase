// ============================================================
// SECTION 1: BROWSER SETUP
// ============================================================
// This file runs in the browser, not on the Express server.
// Database credentials must stay on the server.

// Find one HTML element using its CSS selector.
function getElement(selector) {
  return document.querySelector(selector);
}


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

  // Show the request and response so students can trace the flow.
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
// SECTION 5: READ AND DISPLAY REQUESTS (GET)
// ============================================================
// refresh() asks Express for requests and displays the results.
async function refresh(search = '') {
  // encodeURIComponent() makes search text safe to place in a URL.
  const searchText = encodeURIComponent(search);
  const data = await api(`/api/requests?search=${searchText}`);

  const rowsElement = getElement('#rows');
  rowsElement.replaceChildren();

  if (data.length === 0) {
    rowsElement.textContent = 'No matching requests.';
    return;
  }

  // Create visible HTML elements for each returned record.
  for (const request of data) {
    const article = document.createElement('article');
    const heading = document.createElement('strong');
    const details = document.createElement('div');

    heading.textContent = `#${request.id} · ${request.title}`;
    details.textContent = `${request.location} · ${request.status}`;

    // textContent displays stored text safely as text, not HTML.
    article.append(heading, details);
    rowsElement.append(article);
  }
}


// ============================================================
// SECTION 6: TEST THE BROWSER-TO-SERVER CONNECTION
// ============================================================
// Clicking Hello sends a GET request to the simple test route.
getElement('#hello').addEventListener('click', function () {
  perform(async function () {
    const data = await api('/api/hello');
    getElement('#connection').textContent = data.message;
  });
});


// ============================================================
// SECTION 7: SEARCH FOR REQUESTS (GET)
// ============================================================
// Read the search box and request matching records from Express.
getElement('#read').addEventListener('click', function () {
  perform(async function () {
    const search = getElement('#search').value;
    await refresh(search);
  });
});


// ============================================================
// SECTION 8: CREATE A REQUEST (POST)
// ============================================================
// Read form fields, send JSON to Express, then refresh the list.
getElement('#create').addEventListener('submit', function (event) {
  // Prevent the browser's default form submission and page reload.
  event.preventDefault();

  const form = event.currentTarget;

  perform(async function () {
    const newRequest = {
      title: form.elements.title.value,
      location: form.elements.location.value,
      description: form.elements.description.value
    };

    await api('/api/requests', 'POST', newRequest);
    await refresh();
  });
});


// ============================================================
// SECTION 9: UPDATE A REQUEST (PATCH)
// ============================================================
// Use the record ID in the URL and send its new status as JSON.
getElement('#update').addEventListener('submit', function (event) {
  event.preventDefault();

  const form = event.currentTarget;

  perform(async function () {
    const id = form.elements.id.value;
    const updatedFields = {
      status: form.elements.status.value
    };

    await api(`/api/requests/${id}`, 'PATCH', updatedFields);
    await refresh();
  });
});


// ============================================================
// SECTION 10: DELETE A TEST REQUEST (DELETE)
// ============================================================
// Ask for confirmation before permanently deleting a test record.
getElement('#delete').addEventListener('submit', function (event) {
  event.preventDefault();

  const form = event.currentTarget;
  const id = form.elements.id.value;

  // confirm() displays a browser dialog with OK and Cancel.
  const confirmed = window.confirm(
    `Permanently delete test record #${id}?`
  );

  if (confirmed) {
    perform(async function () {
      await api(`/api/requests/${id}`, 'DELETE');
      await refresh();
    });
  }
});


// ============================================================
// SECTION 11: INITIAL PAGE LOAD
// ============================================================
// Display sample records when the page first opens.
// Later actions update the trace with their own request/response.
refresh().catch(function (error) {
  announce(error.message, true);
});
