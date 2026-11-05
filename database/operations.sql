-- ============================================================
-- WELLSPRING — SQL OPERATIONS (Assignment 5)
-- ============================================================
-- 25 operations that use the Wellspring database for real
-- maintenance tasks. Together they cover all seven capabilities:
--
--   A. Create records                 Operations 1-3  (also 11)
--   B. Read records                   Operations 4-5
--   C. Search and filter              Operations 6-9
--   D. Update records                 Operations 10-14
--   E. Delete, archive or deactivate  Operations 15-16
--   F. Relational queries (JOIN)      Operations 17-20
--   G. Aggregation                    Operations 21-25
--
-- The operations follow one week at Wellspring (report date:
-- Thursday 5 November 2026). A new problem is reported in the
-- Main Hall, staff find it, assign it and call a vendor; an open
-- repair is finished; a vendor contract ends; and leadership
-- reviews the numbers. Later operations see the changes made by
-- earlier ones, so run the file in order.
--
-- Each operation is documented with:
--   Purpose      the question or task it addresses
--   SQL          the statement(s)
--   Result       what was returned or what changed, from running
--                this file against database/wellspring.sql
--   Explanation  how it supports the service workflow
--
-- PRESERVING THE ORIGINAL SAMPLE DATA
--   * database/wellspring.sql is the original copy of the sample
--     data. Never edit it to record test changes.
--   * This whole file runs inside one transaction that ends with
--     ROLLBACK, so running it changes nothing: the updates and
--     deletes are undone and the file can be repeated as often as
--     needed. The last query proves the data is back to the original.
--   * To keep the changes instead, replace ROLLBACK with COMMIT.
--     To get the original data back afterwards, run reset.sql and
--     then wellspring.sql.
--
-- Dates are written out (e.g. date '2026-11-05') so the results
-- below can be reproduced. In daily use they would be current_date
-- or now().
-- ============================================================

begin;


-- ============================================================
-- A. CREATE RECORDS
-- ============================================================

-- ------------------------------------------------------------
-- Operation 1 — Report a new problem
-- ------------------------------------------------------------
-- Purpose:     Priya, a volunteer, sees two stage spotlights
--              flickering in the Main Hall on Monday evening,
--              with a concert booked for Saturday. She reports it.
-- SQL:         INSERT the request, then INSERT its first status
--              update. Room, category and reporter are looked up
--              by name, so nobody types ID numbers.
-- Result:      Request 10 "Stage lights flickering" (High) is created with
--              status Reported, no assignee yet, reported 2026-11-02
--              19:40. Status update 34 ("Problem reported.") starts
--              its history.
-- Explanation: This is how every problem enters the system
--              (Requirement 1). The database fills in the ID and
--              the default status Reported, and refuses the row
--              if the room, category, reporter, title or
--              description is missing (Rule 1). The first status
--              update starts the request's permanent history.

insert into maintenance_request
  (room_id, category_id, reported_by_id, title, description, urgency, date_reported)
values (
  (select room_id from room where room_name = 'Main Hall'),
  (select category_id from category where category_name = 'Lighting'),
  (select person_id from person where full_name = 'Priya Shah'),
  'Stage lights flickering',
  'Two stage spotlights flicker during rehearsals. Concert booked for Saturday.',
  'High',
  timestamptz '2026-11-02 19:40'
)
returning request_id, title, urgency, status, assigned_to_id, date_reported;

insert into status_update (request_id, author_id, note_text, new_status, created_at)
select request_id, reported_by_id, 'Problem reported.', 'Reported', date_reported
from maintenance_request
where title = 'Stage lights flickering'
returning update_id, request_id, new_status, note_text;


-- ------------------------------------------------------------
-- Operation 2 — Add a new vendor and the services it offers
-- ------------------------------------------------------------
-- Purpose:     None of Wellspring's vendors handles stage
--              lighting. Ava adds a specialist, Lumen Stage
--              Lighting, with its contact details and services.
-- SQL:         INSERT a new service type, the vendor, and two
--              rows in the vendor_service link table.
-- Result:      Service type 6 "Lighting" is added, then vendor 7 "Lumen
--              Stage Lighting" (contact Grace Okafor, active), then
--              two vendor_service rows: vendor 7 offers Electrical
--              (4) and Lighting (6).
-- Explanation: Vendor contacts now live in one place instead of
--              someone's phone (Requirement 7). The link table
--              records that one vendor offers several services,
--              so staff can later look vendors up by service.

insert into service_type (service_name)
values ('Lighting')
returning service_type_id, service_name;

insert into vendor (vendor_name, contact_name, email, phone)
values ('Lumen Stage Lighting', 'Grace Okafor', 'bookings@lumenstage.example', '(555) 300-7000')
returning vendor_id, vendor_name, contact_name, is_active;

insert into vendor_service (vendor_id, service_type_id)
select v.vendor_id, s.service_type_id
from vendor v
cross join service_type s
where v.vendor_name = 'Lumen Stage Lighting'
  and s.service_name in ('Lighting', 'Electrical')
returning vendor_id, service_type_id;


-- ------------------------------------------------------------
-- Operation 3 — Add a note to an open request
-- ------------------------------------------------------------
-- Purpose:     StageSound calls to confirm the projector lamp
--              repair. Marcus records it without changing the
--              request's status.
-- SQL:         INSERT a status update with no new_status.
-- Result:      Status update 35 is added to request 7 with an empty
--              new_status, so the request stays In Progress.
-- Explanation: Notes build a dated record of what happened and
--              when (Requirement 5), so the next person to pick up
--              the request does not have to ask around.

insert into status_update (request_id, author_id, note_text, created_at)
values (
  (select request_id from maintenance_request where title = 'Projector will not turn on'),
  (select person_id from person where full_name = 'Marcus Hill'),
  'StageSound confirmed the technician will come once the new lamp arrives.',
  timestamptz '2026-11-03 09:15'
)
returning update_id, new_status, note_text, created_at;


-- ============================================================
-- B. READ RECORDS
-- ============================================================

-- ------------------------------------------------------------
-- Operation 4 — Vendor contact directory
-- ------------------------------------------------------------
-- Purpose:     Who can we call, and how?
-- SQL:         SELECT only the columns a caller needs, for
--              active vendors, in alphabetical order.
-- Result:      6 vendors, A to Z: Bright Spark Electric, CoolAir
--              Mechanical, FlowRight Plumbing, Lumen Stage Lighting
--              (added in Operation 2), Metro Climate Services and
--              StageSound AV, each with contact, phone and email.
--              Sparkle Cleaning Co. (inactive) is not listed.
-- Explanation: Inactive vendors are left out, so staff only see
--              companies Wellspring still uses (Rule 9).

select vendor_name, contact_name, phone, email
from vendor
where is_active
order by vendor_name;


-- ------------------------------------------------------------
-- Operation 5 — Recent activity feed
-- ------------------------------------------------------------
-- Purpose:     What has happened on maintenance requests most
--              recently?
-- SQL:         SELECT the five newest status updates.
-- Result:      5 rows, newest first: Marcus's projector note (Nov 3),
--              the stage lights report (Nov 2), the Lobby light
--              report (Oct 23), and two Kitchen sink updates (Oct 22).
-- Explanation: A coordinator starting the day sees the latest
--              reports, changes and notes at a glance.

select created_at, request_id, new_status, note_text
from status_update
order by created_at desc
limit 5;


-- ============================================================
-- C. SEARCH AND FILTER
-- ============================================================

-- ------------------------------------------------------------
-- Operation 6 — Can the Main Hall be booked this weekend?
-- ------------------------------------------------------------
-- Purpose:     Ava handles bookings. Before confirming Saturday's
--              concert she checks for open problems in the room.
-- SQL:         WHERE with AND and <> (not equal), ORDER BY date.
-- Result:      1 row: request 10 "Stage lights flickering", High,
--              Reported. The Main Hall's four earlier problems are
--              all Resolved, so this is the only risk to Saturday.
-- Explanation: Requirement 2: staff see what is still broken in a
--              room before booking it, and can warn the group or
--              prepare a backup room in time.

select request_id, title, urgency, status, date_reported
from maintenance_request
where room_id = (select room_id from room where room_name = 'Main Hall')
  and status <> 'Resolved'
order by date_reported;


-- ------------------------------------------------------------
-- Operation 7 — Priority work queue
-- ------------------------------------------------------------
-- Purpose:     Which open requests need attention first? Anything
--              High or Urgent, and anything nobody has taken yet.
-- SQL:         WHERE with AND, OR, IN and IS NULL. ORDER BY puts
--              Urgent first, then High, Medium, Low, and older
--              reports first within the same urgency.
-- Result:      3 rows, in priority order:
--                7  Projector will not turn on  High  In Progress
--                10 Stage lights flickering     High  Reported (unassigned)
--                9  Flickering ceiling light    Low   Reported (unassigned)
--              The Kitchen sink (Medium, assigned) is left out.
-- Explanation: Facilities staff work from the top of this list,
--              so urgent and forgotten problems are not missed.

select request_id, title, urgency, status, assigned_to_id, date_reported
from maintenance_request
where status <> 'Resolved'
  and (urgency in ('High', 'Urgent') or assigned_to_id is null)
order by case urgency
           when 'Urgent' then 1
           when 'High'   then 2
           when 'Medium' then 3
           else 4
         end,
         date_reported;


-- ------------------------------------------------------------
-- Operation 8 — Overdue deliveries to chase
-- ------------------------------------------------------------
-- Purpose:     Which ordered parts should have arrived by today
--              but have not?
-- SQL:         WHERE status = 'Ordered' AND date_expected < today,
--              ORDER BY the oldest expected date first.
-- Result:      1 row: delivery 6, "Projector lamp", expected 2026-10-26
--              ($210.00), still Ordered: 10 days overdue.
-- Explanation: Requirement 11: everyone can see what is still on
--              the way, and the coordinator knows whom to call.

select delivery_id, item_description, date_expected, cost
from delivery
where status = 'Ordered'
  and date_expected < date '2026-11-05'
order by date_expected;


-- ------------------------------------------------------------
-- Operation 9 — Has this happened before?
-- ------------------------------------------------------------
-- Purpose:     Marcus wonders whether the Main Hall's cooling has
--              failed before this year.
-- SQL:         Keyword search with ILIKE (case-insensitive) and
--              OR, a date comparison (>=), and ORDER BY.
-- Result:      3 rows, all Resolved: "AC blowing warm air" (Feb 9),
--              "AC unit rattling" (Jun 15) and "AC not cooling"
--              (Oct 5): the cooling has failed three times this year.
-- Explanation: Past reports help diagnose new ones and show when
--              a problem keeps coming back (Requirement 6).

select request_id, title, status, date_reported
from maintenance_request
where room_id = (select room_id from room where room_name = 'Main Hall')
  and (title ilike '%AC%' or description ilike '%cool%' or description ilike '%air%')
  and date_reported >= timestamptz '2026-01-01'
order by date_reported;


-- ============================================================
-- D. UPDATE RECORDS
-- ============================================================
-- Every status change is two steps: UPDATE the request (its
-- current state) and INSERT a status update (its history).
-- WHERE conditions name one record AND its expected current state,
-- so a statement cannot change the wrong row or one that has
-- already moved on.

-- ------------------------------------------------------------
-- Operation 10 — Assign the new request to a staff member
-- ------------------------------------------------------------
-- Purpose:     Marcus takes the stage lights problem.
-- SQL:         UPDATE assigned_to_id and status; INSERT history.
-- Result:      Request 10 now has status Assigned and assigned_to_id 2
--              (Marcus Hill); 1 row updated. A new status update
--              records the change.
-- Explanation: Requirements 3 and 4: everyone can see who is
--              handling the problem. The database refuses
--              Assigned without an assignee, or with a
--              non-Staff assignee (Rule 2).

update maintenance_request
set assigned_to_id = (select person_id from person where full_name = 'Marcus Hill'),
    status = 'Assigned'
where title = 'Stage lights flickering'
  and status = 'Reported'
returning request_id, title, status, assigned_to_id;

insert into status_update (request_id, author_id, note_text, new_status, created_at)
values (
  (select request_id from maintenance_request where title = 'Stage lights flickering'),
  (select person_id from person where full_name = 'Marcus Hill'),
  'Assigned to me. Dimmer pack looks fine; calling a lighting specialist.',
  'Assigned',
  timestamptz '2026-11-03 08:30'
);


-- ------------------------------------------------------------
-- Operation 11 — Book the vendor and move the request forward
-- ------------------------------------------------------------
-- Purpose:     Marcus books Lumen Stage Lighting for Friday.
-- SQL:         INSERT a vendor job linked to the request; UPDATE
--              the status to In Progress; INSERT history.
-- Result:      Vendor job 7 is created for request 10 (scheduled
--              2026-11-06); request 10 moves to In Progress; a new
--              status update records it.
-- Explanation: Requirement 9: the repair is connected to the
--              problem it solves, so its cost will be traceable
--              to this request. Only active vendors can be booked
--              (Rule 9).

insert into vendor_job (vendor_id, request_id, job_description, scheduled_date)
values (
  (select vendor_id from vendor where vendor_name = 'Lumen Stage Lighting'),
  (select request_id from maintenance_request where title = 'Stage lights flickering'),
  'Inspect and repair flickering stage spotlights in the Main Hall',
  date '2026-11-06'
)
returning job_id, request_id, job_description, scheduled_date;

update maintenance_request
set status = 'In Progress'
where title = 'Stage lights flickering'
  and status = 'Assigned'
returning request_id, status;

insert into status_update (request_id, author_id, note_text, new_status, created_at)
values (
  (select request_id from maintenance_request where title = 'Stage lights flickering'),
  (select person_id from person where full_name = 'Marcus Hill'),
  'Lumen Stage Lighting booked for Friday morning.',
  'In Progress',
  timestamptz '2026-11-03 11:00'
);


-- ------------------------------------------------------------
-- Operation 12 — Mark an overdue delivery as received
-- ------------------------------------------------------------
-- Purpose:     The projector lamp found in Operation 8 finally
--              arrives on Wednesday and Marcus signs for it.
-- SQL:         UPDATE status, date_received and received_by_id
--              for that one delivery, only if still Ordered.
-- Result:      Delivery 6 "Projector lamp" changes from Ordered to
--              Received on 2026-11-04 (expected 2026-10-26).
-- Explanation: Requirement 11. The database will not accept
--              Received without a date and a signer (Rule 8), and
--              the gap between the expected and received dates
--              records that it was late.

update delivery
set status = 'Received',
    date_received = date '2026-11-04',
    received_by_id = (select person_id from person where full_name = 'Marcus Hill')
where item_description = 'Projector lamp'
  and status = 'Ordered'
returning delivery_id, item_description, status, date_expected, date_received;


-- ------------------------------------------------------------
-- Operation 13 — Finish a vendor job and resolve its request
-- ------------------------------------------------------------
-- Purpose:     StageSound installs the lamp on Wednesday. Marcus
--              records the finished job and closes the request.
-- SQL:         UPDATE the job's completed date and final cost;
--              UPDATE the request to Resolved; INSERT history.
-- Result:      Job 6 gets completed_date 2026-11-04 and final_cost
--              $135.00; request 7 changes to Resolved with
--              date_resolved 2026-11-04 16:00; a final status
--              update closes its history.
-- Explanation: Requirement 10: Wellspring knows what the repair
--              cost. The request could not be Resolved while this
--              job was unfinished (Rule 4), and the resolved date
--              cannot be before the reported date (Rule 5).

update vendor_job
set completed_date = date '2026-11-04',
    final_cost = 135.00
where job_description = 'Replace projector lamp in Cellar Theater booth'
  and completed_date is null
returning job_id, completed_date, final_cost;

update maintenance_request
set status = 'Resolved',
    date_resolved = timestamptz '2026-11-04 16:00'
where title = 'Projector will not turn on'
  and status = 'In Progress'
returning request_id, title, status, date_resolved;

insert into status_update (request_id, author_id, note_text, new_status, created_at)
values (
  (select request_id from maintenance_request where title = 'Projector will not turn on'),
  (select person_id from person where full_name = 'Marcus Hill'),
  'New lamp installed and tested. Projector works.',
  'Resolved',
  timestamptz '2026-11-04 16:00'
);


-- ------------------------------------------------------------
-- Operation 14 — Change an assignment
-- ------------------------------------------------------------
-- Purpose:     Marcus is busy with the stage lights, so the slow
--              kitchen sink moves to Ava.
-- SQL:         UPDATE assigned_to_id for that request only;
--              INSERT a note explaining the handover.
-- Result:      Request 8 "Sink draining slowly" stays Assigned, but
--              assigned_to_id changes from 2 (Marcus) to 3 (Ava);
--              a note records the handover.
-- Explanation: The current assignee is always correct, and the
--              history keeps who held the request before, so the
--              handover is never lost.

update maintenance_request
set assigned_to_id = (select person_id from person where full_name = 'Ava Thompson')
where title = 'Sink draining slowly'
  and assigned_to_id = (select person_id from person where full_name = 'Marcus Hill')
returning request_id, title, status, assigned_to_id;

insert into status_update (request_id, author_id, note_text, created_at)
values (
  (select request_id from maintenance_request where title = 'Sink draining slowly'),
  (select person_id from person where full_name = 'Marcus Hill'),
  'Handed over to Ava while I work on the Main Hall stage lights.',
  timestamptz '2026-11-04 08:00'
);


-- ============================================================
-- E. DELETE, ARCHIVE, OR DEACTIVATE RECORDS
-- ============================================================
-- Wellspring keeps history. Requests, status updates, vendor jobs
-- and deliveries are NEVER deleted:
--   * a resolved request is "archived" by its Resolved status:
--     it drops out of open lists (Operations 6-7) but still counts
--     in reports (Operations 21-25);
--   * status updates cannot be changed or deleted (a trigger
--     refuses), so the history is permanent;
--   * rooms and vendors are deactivated with is_active = false.
-- A permanent DELETE is used only for a record that describes the
-- present and has no history of its own (Operation 16).

-- ------------------------------------------------------------
-- Operation 15 — Deactivate a vendor whose contract has ended
-- ------------------------------------------------------------
-- Purpose:     Wellspring stops using Metro Climate Services.
-- SQL:         UPDATE is_active to false for that vendor.
-- Result:      Vendor 2 "Metro Climate Services" now has is_active =
--              false; 1 row updated. Its finished job and delivery
--              stay in the database.
-- Explanation: Deactivating instead of deleting keeps the vendor's
--              past jobs and costs for reporting (Requirement 12),
--              while removing it from the directory (Operation 4)
--              and the HVAC lookup (Operation 19). The database
--              now refuses new jobs for it (Rule 9). A DELETE would
--              be refused too:
--                delete from vendor where vendor_name = 'Metro Climate Services';
--                -> ERROR: Rule 9: vendors are never deleted; set is_active = false instead

update vendor
set is_active = false
where vendor_name = 'Metro Climate Services'
  and is_active
returning vendor_id, vendor_name, is_active;


-- ------------------------------------------------------------
-- Operation 16 — Remove a service a vendor no longer offers
-- ------------------------------------------------------------
-- Purpose:     StageSound AV tells Wellspring it no longer does
--              electrical work.
-- SQL:         DELETE the one vendor_service row for that pair.
-- Result:      1 row deleted: vendor 3 (StageSound AV) with service
--              type 4 (Electrical). StageSound still offers A/V.
-- Explanation: A vendor_service row only says what a vendor offers
--              today; it has no history of its own. Past jobs are
--              stored in vendor_job and are untouched, so deleting
--              this row loses nothing and keeps lookups accurate.

delete from vendor_service
where vendor_id = (select vendor_id from vendor where vendor_name = 'StageSound AV')
  and service_type_id = (select service_type_id from service_type where service_name = 'Electrical')
returning vendor_id, service_type_id;


-- ============================================================
-- F. RELATIONAL QUERIES (JOIN)
-- ============================================================
-- Each fact is stored once, in its own table (a room's name in
-- room, a vendor's phone in vendor). Joins put them back together
-- for a task. In one big table, renaming a room or changing a
-- vendor's phone would mean editing every request that mentions it.

-- ------------------------------------------------------------
-- Operation 17 — The complete record of one repair
-- ------------------------------------------------------------
-- Purpose:     For the Main Hall AC repair (the planning
--              document's scenario): who reported it, who handled
--              it, which vendor fixed it, what part was needed,
--              and what it cost.
-- SQL:         JOIN maintenance_request to room, category, person
--              (twice: reporter and assignee), vendor_job, vendor
--              and delivery. LEFT JOIN keeps the row even when a
--              request has no job or delivery.
-- Result:      1 row: request 6 "AC not cooling", Main Hall, HVAC,
--              reported and handled by Dana Lee, fixed by CoolAir
--              Mechanical for $615.00, with a Replacement capacitor
--              part for $85.00.
-- Explanation: Because every job points to its request, the
--              repair never becomes disconnected from the problem
--              it solved, and the history stays with Wellspring
--              when staff change.

select r.request_id,
       r.title,
       room.room_name,
       category.category_name,
       reporter.full_name as reported_by,
       assignee.full_name as handled_by,
       v.vendor_name,
       j.final_cost       as job_cost,
       d.item_description as part,
       d.cost             as part_cost
from maintenance_request r
join room                 on room.room_id = r.room_id
join category             on category.category_id = r.category_id
join person reporter      on reporter.person_id = r.reported_by_id
left join person assignee on assignee.person_id = r.assigned_to_id
left join vendor_job j    on j.request_id = r.request_id
left join vendor v        on v.vendor_id = j.vendor_id
left join delivery d      on d.job_id = j.job_id
where r.title = 'AC not cooling';


-- ------------------------------------------------------------
-- Operation 18 — A request's full history
-- ------------------------------------------------------------
-- Purpose:     What happened on the projector repair, step by
--              step, and who did each step?
-- SQL:         JOIN status_update to person (author) and to
--              maintenance_request, ORDER BY time.
-- Result:      5 rows, oldest first:
--                Oct 19  Ava Thompson  Reported     Problem reported.
--                Oct 20  Marcus Hill   Assigned     Assigned.
--                Oct 20  Marcus Hill   In Progress  Lamp is dead; StageSound ordering a new one.
--                Nov 3   Marcus Hill   (note)       StageSound confirmed the technician ...
--                Nov 4   Marcus Hill   Resolved     New lamp installed and tested. ...
-- Explanation: The request row only holds its current status; the
--              status_update rows keep every step, like an order-
--              tracking page.

select su.created_at,
       author.full_name as written_by,
       su.new_status,
       su.note_text
from status_update su
join person author         on author.person_id = su.author_id
join maintenance_request r on r.request_id = su.request_id
where r.title = 'Projector will not turn on'
order by su.created_at;


-- ------------------------------------------------------------
-- Operation 19 — Which vendors provide HVAC services?
-- ------------------------------------------------------------
-- Purpose:     The AC fails again: who should we call?
-- SQL:         JOIN vendor -> vendor_service -> service_type (the
--              many-to-many relationship), active vendors only.
-- Result:      1 row: CoolAir Mechanical (Sam Ortiz, (555) 300-1000).
--              Before Operation 15 this returned two vendors.
-- Explanation: Requirement 8 turns "who do we use for AC?" into a
--              lookup. After Operation 15, Metro Climate Services
--              no longer appears.

select v.vendor_name, v.contact_name, v.phone
from vendor v
join vendor_service vs on vs.vendor_id = v.vendor_id
join service_type s    on s.service_type_id = vs.service_type_id
where s.service_name = 'HVAC'
  and v.is_active
order by v.vendor_name;


-- ------------------------------------------------------------
-- Operation 20 — Open work board
-- ------------------------------------------------------------
-- Purpose:     For every unresolved request: where it is, who has
--              it, and which vendor (if any) is booked.
-- SQL:         JOIN to room; LEFT JOIN to person and vendor_job /
--              vendor, because some requests have no assignee or
--              vendor yet.
-- Result:      3 rows:
--                8  Sink draining slowly      Kitchen    Assigned     Ava Thompson   (no vendor)
--                9  Flickering ceiling light  Lobby      Reported     (nobody yet)   (no vendor)
--                10 Stage lights flickering   Main Hall  In Progress  Marcus Hill    Lumen Stage Lighting, Nov 6
--              The projector is gone: it was resolved in Operation 13.
-- Explanation: One view answers "who is handling what?" without
--              anyone asking around (Requirement 4).

select r.request_id,
       r.title,
       room.room_name,
       r.status,
       coalesce(assignee.full_name, '(nobody yet)') as assigned_to,
       coalesce(v.vendor_name, '(no vendor)')       as vendor,
       j.scheduled_date
from maintenance_request r
join room                 on room.room_id = r.room_id
left join person assignee on assignee.person_id = r.assigned_to_id
left join vendor_job j    on j.request_id = r.request_id and j.completed_date is null
left join vendor v        on v.vendor_id = j.vendor_id
where r.status <> 'Resolved'
order by r.date_reported;


-- ============================================================
-- G. AGGREGATION AND OPERATIONAL QUESTIONS
-- ============================================================

-- ------------------------------------------------------------
-- Operation 21 — How many requests are at each stage?
-- ------------------------------------------------------------
-- Purpose:     A one-line summary of the maintenance workload.
-- SQL:         COUNT with GROUP BY status, in workflow order.
-- Result:      Reported 1, Assigned 1, In Progress 1, Resolved 7
--              (10 requests in total).
-- Explanation: Leadership sees at a glance how much is waiting,
--              in progress and done.

select status, count(*) as requests
from maintenance_request
group by status
order by case status
           when 'Reported'    then 1
           when 'Assigned'    then 2
           when 'In Progress' then 3
           else 4
         end;


-- ------------------------------------------------------------
-- Operation 22 — Requests per room, and repeat problems
-- ------------------------------------------------------------
-- Purpose:     How many requests has each room had, and which room
--              and problem type keep coming back?
-- SQL:         COUNT with LEFT JOIN and GROUP BY (rooms with no
--              requests still appear); then GROUP BY room and
--              category with HAVING to keep repeats only.
-- Result:      Requests per room: Main Hall 5 (1 open), Cellar
--              Theater 2, Gallery 1, Kitchen 1 (1 open), Lobby 1
--              (1 open), Studio B 0. Repeat problems: 1 row, Main
--              Hall + HVAC reported 4 times.
-- Explanation: Requirement 6: four HVAC problems in the Main Hall
--              in one year suggest replacing the unit instead of
--              repairing it again.

select room.room_name,
       count(r.request_id)                                        as total_requests,
       count(r.request_id) filter (where r.status <> 'Resolved') as open_requests
from room
left join maintenance_request r on r.room_id = room.room_id
group by room.room_name
order by total_requests desc, room.room_name;

select room.room_name, category.category_name, count(*) as times_reported
from maintenance_request r
join room     on room.room_id = r.room_id
join category on category.category_id = r.category_id
group by room.room_name, category.category_name
having count(*) > 1
order by times_reported desc;


-- ------------------------------------------------------------
-- Operation 23 — What does each vendor cost?
-- ------------------------------------------------------------
-- Purpose:     Total and average repair cost per vendor, with
--              parts, for vendors Wellspring has paid.
-- SQL:         COUNT, SUM and AVG over finished jobs, plus SUM of
--              received deliveries. Each is summed in its own
--              subquery first so joining them cannot double-count.
-- Result:      5 vendors, most expensive first:
--                CoolAir Mechanical      2 jobs  $995.00  avg $497.50  parts $85.00   total $1,080.00
--                FlowRight Plumbing      1 job   $420.00  avg $420.00  parts $60.00   total $480.00
--                StageSound AV           1 job   $135.00  avg $135.00  parts $210.00  total $345.00
--                Metro Climate Services  1 job   $240.00  avg $240.00  parts $64.00   total $304.00
--                Bright Spark Electric   1 job   $150.00  avg $150.00  parts $18.50   total $168.50
--              Metro still appears although deactivated: its history is kept.
-- Explanation: Requirement 12: leadership compares what vendors
--              cost when deciding whom to keep using.

select v.vendor_name,
       jobs.finished_jobs,
       jobs.job_total,
       jobs.average_job,
       coalesce(parts.parts_total, 0)                 as parts_total,
       jobs.job_total + coalesce(parts.parts_total, 0) as total_cost
from vendor v
join (
  select vendor_id,
         count(*)                   as finished_jobs,
         sum(final_cost)            as job_total,
         round(avg(final_cost), 2)  as average_job
  from vendor_job
  where completed_date is not null
  group by vendor_id
) jobs on jobs.vendor_id = v.vendor_id
left join (
  select vendor_id, sum(cost) as parts_total
  from delivery
  where status = 'Received'
  group by vendor_id
) parts on parts.vendor_id = v.vendor_id
order by total_cost desc;


-- ------------------------------------------------------------
-- Operation 24 — How long do repairs take, by urgency?
-- ------------------------------------------------------------
-- Purpose:     Are urgent problems really fixed faster?
-- SQL:         AVG of (date_resolved - date_reported) in days,
--              COUNT, and MAX, grouped by urgency, resolved
--              requests only.
-- Result:      Urgent: 1 resolved, 8.3 days on average. High: 3, 7.8
--              days (longest 15.9, the projector). Medium: 2, 4.9
--              days. Low: 1, 0.2 days. Urgent and High problems take
--              the longest, because they needed vendors and parts
--              that arrived late; this is worth raising with
--              leadership.
-- Explanation: Shows whether the urgency labels change how fast
--              staff respond, and where response times are slow.

select urgency,
       count(*) as resolved_requests,
       round(avg(extract(epoch from date_resolved - date_reported) / 86400)::numeric, 1) as average_days,
       round(max(extract(epoch from date_resolved - date_reported) / 86400)::numeric, 1) as longest_days
from maintenance_request
where status = 'Resolved'
group by urgency
order by average_days desc;


-- ------------------------------------------------------------
-- Operation 25 — Which deliveries arrived late, and how reliable
--                is each vendor?
-- ------------------------------------------------------------
-- Purpose:     List the late deliveries, then each vendor's on-time
--              record.
-- SQL:         WHERE date_received > date_expected; then COUNT with
--              FILTER and GROUP BY vendor, and AVG of days late.
-- Result:      Late deliveries (3 rows): Projector lamp from StageSound
--              AV, 9 days late; Pipe fittings from FlowRight, 3 days;
--              Replacement capacitor from CoolAir, 1 day. Per vendor:
--              CoolAir, FlowRight and StageSound were each late on
--              their 1 received delivery (StageSound by 9 days on
--              average); Bright Spark and Metro Climate were on time.
-- Explanation: Requirement 12: leadership sees how often each
--              vendor's parts are late when deciding whether to
--              keep using them.

select v.vendor_name,
       d.item_description,
       d.date_expected,
       d.date_received,
       d.date_received - d.date_expected as days_late
from delivery d
join vendor v on v.vendor_id = d.vendor_id
where d.status = 'Received'
  and d.date_received > d.date_expected
order by days_late desc;

select v.vendor_name,
       count(*)                                                as received,
       count(*) filter (where d.date_received > d.date_expected) as late,
       round(avg(greatest(d.date_received - d.date_expected, 0)), 1) as average_days_late
from delivery d
join vendor v on v.vendor_id = d.vendor_id
where d.status = 'Received'
group by v.vendor_name
order by late desc, v.vendor_name;


-- ============================================================
-- UNDO ALL CHANGES
-- ============================================================
-- Everything above is undone, so the original sample data is
-- preserved and this file can be run again. (Use COMMIT instead to
-- keep the changes.)

rollback;

-- Check: the sample data is back to the original
-- (9 requests, 33 status updates, 6 vendor jobs, 6 deliveries,
-- 6 vendors, and Metro Climate Services still active).
-- Result:      requests 9, status_updates 33, vendor_jobs 6,
--              deliveries 6, vendors 6, metro_still_active true:
--              identical to the original sample data.
select (select count(*) from maintenance_request) as requests,
       (select count(*) from status_update)       as status_updates,
       (select count(*) from vendor_job)          as vendor_jobs,
       (select count(*) from delivery)            as deliveries,
       (select count(*) from vendor)              as vendors,
       (select is_active from vendor where vendor_name = 'Metro Climate Services') as metro_still_active;
