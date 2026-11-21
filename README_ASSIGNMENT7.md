# Wellspring Maintenance: Assignment 7

Client: **Wellspring on Main**. Team: Annanya Krishnan, Jenifer Back, Ramatoulie Janneh, Elie Bossombo.

## 1. Feature summary

Wellspring staff, volunteers and board members sign in to report a broken room or piece of equipment, then follow their own reports and see each one's history. Wellspring staff open a maintenance queue of every report, filter it by status, room or title, and update a request's status and who it is assigned to. Every report and change is saved in the Wellspring PostgreSQL database.

This is the reporting and status workflow from our Assignment 6 prototype. Vendor booking was left out to keep the feature focused (see section 4).

## 2. Setup and access

**Required software**
- Node.js 22 or newer (includes npm).
- No database server is needed for the default setup. `DATA_MODE=local` runs a full PostgreSQL inside Node (PGlite) and stores it in `./data/pgdata`, so saved data survives page reloads and server restarts.
- Optional: your own PostgreSQL or a Supabase project (`DATA_MODE=postgres`).

**Install and run**
1. Clone https://github.com/elieboss/wellspringdatabase (or unzip the submitted ZIP) and open a terminal in the project folder.
2. `npm install`
3. Copy `.env.example` to `.env` (Windows: `copy .env.example .env`; macOS/Linux: `cp .env.example .env`).
4. In `.env`, set `SESSION_SECRET` to a long random value. You can generate one with:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
5. `npm start`, then open http://localhost:3000

Optional: `npm test` runs automated checks of all seven requirements against a throwaway in-memory database (about 10 seconds).

**SQL files, in this order**
1. `database/wellspring.sql`: all Wellspring tables, keys, business rules (Rules 1–10) and fictional sample data, from Assignments 4–5.
2. `database/accounts.sql`: the one table this feature adds, `account` (a sign-in for a `person`, with a hashed password), plus the test accounts.

With `DATA_MODE=local` the server runs both files automatically the first time it starts. To start over with fresh sample data, stop the server and run `npm run db:reset-local`. With `DATA_MODE=postgres`, run both files yourself in order (for example in the Supabase SQL Editor); `database/reset.sql` removes everything if you need to start over.

**Configuration variables** (in `.env`; see `.env.example`)

| Variable | Required | Purpose |
|---|---|---|
| `SESSION_SECRET` | Yes | Signs the sign-in cookie. Any long random value. |
| `PORT` | No | Port for the server (default 3000). |
| `DATA_MODE` | No | `local` (default) or `postgres`. |
| `DATABASE_URL` | Only for `postgres` | PostgreSQL connection string. Contains the database password, so it stays in `.env` only. |
| `DATABASE_CA_CERT` | Optional | Path to Supabase's CA certificate, if your connection needs it. |

**Test accounts**

These are fictional accounts created by `database/accounts.sql`. Every one uses the test password **`Wellspring-Test-2026`**.

| Email | Person | Role | May do |
|---|---|---|---|
| `dana.lee@wellspring.example` | Dana Lee | Staff | Report; view the staff queue; update any request |
| `marcus.hill@wellspring.example` | Marcus Hill | Staff | Same as Dana |
| `ava.thompson@wellspring.example` | Ava Thompson | Staff | Same as Dana |
| `priya.shah@example.com` | Priya Shah | Volunteer | Report; view only her own reports |
| `jordan.ruiz@example.com` | Jordan Ruiz | Board | Report; view only his own reports |

**How access is protected**
- **Sign-in:** the password is checked against a scrypt hash in `account`. The server then sets a signed, HttpOnly cookie holding only the person's ID and an expiry time (8 hours).
- **Checks on every request:** each protected route re-reads the person from the database and checks `person.person_type`, using `requireLogin` and `requireStaff` middleware in `auth.cjs`.
- **Hiding a link is not the protection:** the browser hides the Staff queue link from volunteers, but the server refuses those requests anyway. Section 3 shows how to check that.
- **Database safety:** all SQL uses `$1`-style parameters, and database secrets stay in `.env` on the server.

## 3. Try the workflow

1. **Create a record.** Sign in as `priya.shah@example.com`. Choose **Report a problem**. Press **Send report** with the form empty to see each field's error, then fill it in. For example: "Stage lights flickering", Main Hall, Lighting, High, "Two stage spotlights flicker during rehearsals." The page confirms **"Report #10 was saved."** and opens the report.
2. **View the saved information, including related tables.** The report page shows its room and floor (`room`), kind of problem (`category`), who reported it and who it is assigned to (`person`), and its history (`status_update`). Reload the page: everything is read again from the database. **My reports** lists only Priya's own reports.
3. **Update a field and confirm the saved change.** Sign out and sign in as `dana.lee@wellspring.example` (Staff). In **Staff queue**, open report #10. Set **Status** to *In Progress* and **Assigned to** *Nobody yet*, then press **Save change**: the server refuses ("Assign a staff member before moving this report to In Progress."). Choose *Marcus Hill*, add a note, and save. The page confirms **"Saved: report #10 is now In Progress, assigned to Marcus Hill."** Reload: the new status, the assignee and the new history line are still there. Sign back in as Priya to see the update on her report.
4. **Use the filter, sort and search controls.** In **Staff queue** (staff only), change **Status** (Open, All, Reported, Assigned, In Progress, Resolved) and **Room**, or type in **Title contains** (for example `light`). The list changes right away and is always sorted most urgent first, then newest. **Expected:** typing `light` shows only "Flickering ceiling light" (plus "Stage lights flickering" if you created it in step 1); choosing **Resolved** shows only resolved reports; **All** shows every report again. If nothing matches, the list is empty.
5. **Send an invalid request directly to the server.** With the server running, in a second terminal run:

   ```bash
   node scripts/direct-checks.cjs
   ```

   (If your server is not on port 3000: `BASE_URL=http://localhost:PORT node scripts/direct-checks.cjs`.)

   The script signs in as Priya. **Check 1** sends a report with a blank title, an unknown room, an invalid urgency and a too-short description. **Expected: HTTP 400** with one message per field, and nothing is saved. Or with curl (macOS/Linux, or Git Bash on Windows):

   ```bash
   curl -c cookies.txt -H "Content-Type: application/json" \
     -d '{"email":"priya.shah@example.com","password":"Wellspring-Test-2026"}' \
     http://localhost:3000/api/login

   curl -i -b cookies.txt -H "Content-Type: application/json" \
     -d '{"title":"","room_id":999,"urgency":"Whenever","description":"short"}' \
     http://localhost:3000/api/requests
   # HTTP/1.1 400 Bad Request
   # {"error":"Some information is missing or not valid.","fields":{"title":"Enter a short title.", ...}}
   ```

6. **Send a protected request without the required permission.** The same script continues:
   - **Check 2a:** Priya (Volunteer) tries to change request #9's status. **Expected: HTTP 403**, "Only Wellspring staff can do this."
   - **Check 2b:** Priya asks for every report (`scope=all`). **Expected: HTTP 403.**
   - **Check 2c:** a request with no sign-in cookie. **Expected: HTTP 401**, "Please sign in first."

   Or with curl, using the `cookies.txt` from step 5:

   ```bash
   curl -i -b cookies.txt -X PATCH -H "Content-Type: application/json" \
     -d '{"status":"Assigned","assigned_to_id":2}' \
     http://localhost:3000/api/requests/9
   # HTTP/1.1 403 Forbidden

   curl -i -X PATCH -H "Content-Type: application/json" \
     -d '{"status":"Assigned","assigned_to_id":2}' \
     http://localhost:3000/api/requests/9
   # HTTP/1.1 401 Unauthorized
   ```

   A volunteer opening someone else's report (for example `GET /api/requests/7`, reported by Ava Thompson) also gets **HTTP 403**.

## 4. Known limitations

- **No vendor booking in the interface.** Booking a vendor and recording the finished job (in our Assignment 6 prototype) was left out of this version. The vendor tables and their rules are still in the database. Effect: sample request #7 has an unfinished vendor job, so staff cannot resolve it, and the server says why (Rule 4). Other requests can be resolved normally.
- **Reports cannot be edited after they are sent.** Nobody can change a report's title, room, urgency or description, and reporters cannot cancel one. Staff can only change the status and assignee and add a note. Effect: a wrong room or a typo stays in the report; staff can explain it in a history note. Requests are never deleted (resolved requests stay as history).
- **Status only moves forward** (Rule 3). Effect: a resolved request cannot be reopened or given new notes, so a new report has to be made if the problem comes back.
- **Staff cannot clear an assignee.** Choosing "Nobody yet" keeps the current assignee (the server answers "Nothing changed"). Staff can only reassign to a different staff member.
- **Search checks titles only,** not descriptions, and the queue shows every match on one page with no paging. This is fine for the sample data but would get long with hundreds of reports.
- **No account management.** There is no registration, password reset or sign-in rate limiting: repeated wrong passwords are refused each time but never locked out. The evaluator uses the test accounts above. To remove someone's sign-in, set `account.is_active = false`; their reports are kept.
- **Signing out only clears the browser's cookie.** The sign-in cookie is signed but not stored on the server, so a copy of it keeps working until it expires (8 hours) or the account is set inactive.
- **Cookies are sent over plain HTTP locally.** Set `COOKIE_SECURE=true` when the site is served over HTTPS.
- **Local mode is meant for one server at a time,** because `./data/pgdata` is one database folder. Stop the server before starting another.
- **`DATA_MODE=postgres` was not tested** against a live Supabase project; the default local mode and the automated tests were. Supabase may need its CA certificate (`DATABASE_CA_CERT`) for SSL.

## 5. Contributions and AI use

| Member | Main contribution |
|---|---|
| Annanya | Wrote Feature summary and reviewed the README against the assignment instructions and grading criteria. |
| Jenifer | Wrote the Known limitations section and tested the workflow. |
| Rama | Wrote Try the workflow, including the steps and the two direct server checks. |
| Elie | Built the server, database connection and interface with Claude Code, set up the repository and the Wellspring database and tested the workflow. |

**AI use.** Elie used Claude Code to write the server, interface and tests from our Assignment 6 plan and our database. Annanya used Claude to review this README against the grading criteria. Our team chose the workflow, the roles and the rules. We checked the feature by running it in the browser, the direct server checks in section 3, and `npm test`, and we edited the README ourselves.
