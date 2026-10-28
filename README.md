# Wellspring Maintenance Database

A database and web app that follows a Wellspring maintenance problem from first report to resolution. Each vendor job, delivery and cost stays connected to the problem it solved.

Team: Annanya Krishnan, Jenifer Back, Ramatoulie Janneh, Elie Bossombo

- **Database:** one PostgreSQL database (Supabase) with 10 tables. Design and changes from the Assignment 3 plan are in [`docs/database-design.md`](docs/database-design.md); the data dictionary is [`docs/data-dictionary.md`](docs/data-dictionary.md).
- **Server:** Express API (`server.cjs`). Every SQL statement uses `$1` placeholders, never pasted-in text.
- **Browser:** `public/`. Report problems, change status with history, find vendors, record jobs and deliveries, and run reports. The trace panel shows each HTTP request and response.

## Run it

Requires Node 22+.

```bash
npm install
cp .env.example .env
npm start            # http://localhost:3000
```

`DATA_MODE=local` (the default) runs a full PostgreSQL in memory (PGlite) and loads `database/wellspring.sql` at startup. No account is needed, and changes reset when the server stops.

### Using Supabase

1. In the Supabase SQL Editor, run `database/wellspring.sql`.
2. In `.env`, set `DATA_MODE=supabase` and paste the connection string from **Connect → Session pooler** as `DATABASE_URL`.
3. Run `npm start`.

`DATABASE_URL` contains the database password. Keep it in `.env` only, and never put it in browser code or Git. To start over, run `database/reset.sql`, which deletes all data.

## Files

| File | What it is |
|---|---|
| `database/wellspring.sql` | **The database**: tables, relationships, Business Rules 1–10, and sample data (including the Deliverable 5 HVAC scenario) |
| `database/workflow-test.sql` | **Assignment 4** tests: full workflow, relationships, rules (rolls back) |
| `database/queries.sql` | **Assignment 5** queries: unresolved, per room, HVAC vendors, vendor cost, late deliveries, status update with history |
| `database/reset.sql` | Drops every table (practice databases only) |
| `db.cjs` | Connects to PGlite (local) or Supabase (pg) |
| `server.cjs` | Express API routes |
| `public/` | Browser page (`index.html`, `app.js`, `style.css`) |
| `tests/` | `npm test`: runs the SQL files and the API workflow automatically |

## API

| Method & path | Purpose | Requirement |
|---|---|---|
| `GET /api/lookups` | Rooms, categories, people, vendors and service types for menus | — |
| `GET /api/requests?room_id=&status=open&search=` | List or filter requests | 2 |
| `GET /api/requests/:id` | One request with its history, jobs and deliveries | 2, 4 |
| `POST /api/requests` | Report a problem | 1 |
| `PATCH /api/requests/:id/status` | Change status and write a history row | 3, 4 |
| `POST /api/requests/:id/updates` | Add a note | 5 |
| `GET /api/vendors?service_type_id=` | Active vendors by service | 7, 8 |
| `POST /api/jobs`, `PATCH /api/jobs/:id` | Book a job for a request, then finish it with date and cost | 9, 10 |
| `POST /api/deliveries`, `PATCH /api/deliveries/:id` | Record an order, then mark it Received or Cancelled | 11 |
| `GET /api/reports/:name` | `unresolved`, `requests-by-room`, `repeat-problems`, `vendor-costs`, `late-deliveries` | 6, 12 |

Rule violations come back as readable errors, for example `Rule 3: status cannot move backward from Resolved to Assigned`.

## Tests

```bash
npm test
```
