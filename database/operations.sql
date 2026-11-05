-- Wellspring on Main - SQL Operations (Assignment 5)
-- Run database/wellspring.sql first, then run Op 1 to Op 14 in order, once each.
-- Run each Op on its own (highlight it, then Run). If the whole file is run at
-- once, Op 14's expected error cancels Ops 1-13 and nothing is saved.
-- To undo the changes: run database/reset.sql, then database/wellspring.sql again.

-- ------------------------------------------------------------
-- Op 1: Create.
-- Purpose: A volunteer reports a new problem: create the request and its first history entry.
-- Explanation: This is how new information enters the system. The request and its first history entry are saved together in one statement, so a request never exists without its starting history.
-- Result: Creates request 10 "Dishwasher leaking" (Urgent, status Reported) with its first history entry.
-- ------------------------------------------------------------
with new_request as (
  insert into maintenance_request
    (room_id, category_id, reported_by_id, title, description, urgency)
  values ((select room_id from room where room_name = 'Kitchen'),
          (select category_id from category where category_name = 'Plumbing'),
          (select person_id from person where full_name = 'Priya Shah'),
          'Dishwasher leaking',
          'Water on the floor in front of the dishwasher after every cycle.',
          'Urgent')
  returning request_id, title, status, urgency
), first_note as (
  insert into status_update (request_id, author_id, note_text, new_status)
  select request_id, (select person_id from person where full_name = 'Priya Shah'), 'Problem reported.', 'Reported'
  from new_request
  returning update_id
)
select n.request_id, n.title, n.status, n.urgency, f.update_id as first_update_id
from new_request n, first_note f;

-- ------------------------------------------------------------
-- Op 2: Create.
-- Purpose: Staff book a plumber for the new request: connect a vendor job.
-- Explanation: Links outside work to the problem it solves, so the cost and result stay connected to the request. Only an active vendor can be chosen (Rule 9).
-- Result: Creates vendor job 7: FlowRight Plumbing, scheduled 2026-11-10, for request 10.
-- ------------------------------------------------------------
insert into vendor_job (vendor_id, request_id, job_description, scheduled_date)
select v.vendor_id, r.request_id, 'Repair leaking dishwasher connection', date '2026-11-10'
from vendor v, maintenance_request r
where v.vendor_name = 'FlowRight Plumbing'
  and r.title = 'Dishwasher leaking'
returning job_id, vendor_id, request_id, job_description, scheduled_date;

-- ------------------------------------------------------------
-- Op 3: Read (also: Join).
-- Purpose: Which maintenance requests are still unresolved, and who has them?
-- Explanation: Gives staff a daily to-do list. The LEFT JOIN keeps requests nobody has taken yet, so unassigned problems cannot hide.
-- Result: Lists 4 unresolved requests; two are unassigned (Flickering ceiling light and Dishwasher leaking).
-- ------------------------------------------------------------
select r.request_id, r.title, room.room_name, r.urgency, r.status,
       assignee.full_name as assigned_to, r.date_reported
from maintenance_request r
join room                 on room.room_id = r.room_id
left join person assignee on assignee.person_id = r.assigned_to_id
where r.status <> 'Resolved'
order by r.date_reported;

-- ------------------------------------------------------------
-- Op 4: Search and filter.
-- Purpose: Which open requests are Urgent or High, most urgent first?
-- Explanation: Lets the front desk see what must be handled first. It combines AND, OR and ORDER BY to filter and rank the list.
-- Result: Returns 2 rows: Dishwasher leaking (Urgent) first, then Projector will not turn on (High).
-- ------------------------------------------------------------
select r.request_id, r.title, room.room_name, r.urgency, r.status
from maintenance_request r
join room on room.room_id = r.room_id
where r.status <> 'Resolved'
  and (r.urgency = 'Urgent' or r.urgency = 'High')
order by case r.urgency when 'Urgent' then 1 else 2 end, r.date_reported;

-- ------------------------------------------------------------
-- Op 5: Search and filter (also: Join).
-- Purpose: What HVAC problems has the Main Hall had since June 2026?
-- Explanation: Shows repeat problems in one room before it is booked for an event. A date comparison and two text conditions narrow the search.
-- Result: Returns 3 resolved Main Hall HVAC requests, newest first (AC not cooling, Thermostat display blank, AC unit rattling).
-- ------------------------------------------------------------
select r.request_id, r.title, r.status, r.date_reported
from maintenance_request r
join room     on room.room_id = r.room_id
join category on category.category_id = r.category_id
where room.room_name = 'Main Hall'
  and category.category_name = 'HVAC'
  and r.date_reported >= '2026-06-01'
order by r.date_reported desc;

-- ------------------------------------------------------------
-- Op 6: Update.
-- Purpose: Staff take the request: assign it to Marcus Hill, change the status and keep the history.
-- Explanation: A meaningful workflow change. The WHERE clause targets one request and only if it is still Reported. The current status changes while the old status stays in the history (status_update) like an order-tracking page.
-- Result: Request 10 is now Assigned to Marcus Hill, and a new history entry is added.
-- ------------------------------------------------------------
with changed as (
  update maintenance_request
  set assigned_to_id = (select person_id from person where full_name = 'Marcus Hill'),
      status = 'Assigned'
  where title = 'Dishwasher leaking'
    and status = 'Reported'
  returning request_id, title, status, assigned_to_id
), note as (
  insert into status_update (request_id, author_id, note_text, new_status)
  select request_id, (select person_id from person where full_name = 'Marcus Hill'), 'Assigned to Marcus; plumber booked for Nov 10.', 'Assigned'
  from changed
  returning update_id
)
select c.request_id, c.title, c.status,
       (select full_name from person where person_id = c.assigned_to_id) as assigned_to,
       n.update_id
from changed c, note n;

-- ------------------------------------------------------------
-- Op 7: Update.
-- Purpose: A late delivery finally arrives: mark the projector lamp as received and record who signed.
-- Explanation: Updates information as the real world changes. The database requires a received date and a person for any Received delivery (Rule 8), so the update cannot be half finished.
-- Result: Projector lamp (expected 2026-10-26) is now Received on 2026-11-05, signed for by Ava Thompson.
-- ------------------------------------------------------------
update delivery
set status = 'Received',
    date_received = date '2026-11-05',
    received_by_id = (select person_id from person where full_name = 'Ava Thompson')
where item_description = 'Projector lamp'
  and status = 'Ordered'
returning delivery_id, item_description, status, date_received, received_by_id;

-- ------------------------------------------------------------
-- Op 8: Read (also: Join).
-- Purpose: What is the full history of the new request, oldest first?
-- Explanation: Shows that the earlier status (Reported) is still there after the update in Op 6, so anyone can see who did what and when.
-- Result: Shows 2 history entries: Reported by Priya Shah, then Assigned by Marcus Hill; the old status is kept.
-- ------------------------------------------------------------
select su.created_at, author.full_name as written_by, su.new_status, su.note_text
from status_update su
join person author         on author.person_id = su.author_id
join maintenance_request r on r.request_id = su.request_id
where r.title = 'Dishwasher leaking'
order by su.created_at, su.update_id;

-- ------------------------------------------------------------
-- Op 9: Join (also: Read).
-- Purpose: Which vendor is working on each request, in which room, and for how much?
-- Explanation: Connects five tables so a request, its location, its vendor and its cost appear on one line. This is the reason the data is split into related tables. Requests with no vendor still appear.
-- Result: One row per request with its room, category, vendor and cost; requests with no job show blank vendor and cost.
-- ------------------------------------------------------------
select r.title, room.room_name, category.category_name,
       v.vendor_name, j.job_description, j.completed_date, j.final_cost
from maintenance_request r
join room     on room.room_id = r.room_id
join category on category.category_id = r.category_id
left join vendor_job j on j.request_id = r.request_id
left join vendor v     on v.vendor_id = j.vendor_id
order by r.date_reported, r.title;

-- ------------------------------------------------------------
-- Op 10: Join (also: Search and filter).
-- Purpose: Which deliveries arrived after their expected date, and how late were they?
-- Explanation: Shows which vendors run late, which matters when a late part delays a repair before an event.
-- Result: 3 late deliveries; the Projector lamp from StageSound AV was the latest at 10 days.
-- ------------------------------------------------------------
select d.delivery_id, v.vendor_name, d.item_description,
       d.date_expected, d.date_received,
       d.date_received - d.date_expected as days_late
from delivery d
join vendor v on v.vendor_id = d.vendor_id
where d.status = 'Received'
  and d.date_received > d.date_expected
order by days_late desc;

-- ------------------------------------------------------------
-- Op 11: Aggregation (COUNT) (also: Join).
-- Purpose: How many requests has each room had, and how many are still open?
-- Explanation: Reveals rooms with repeat problems. The LEFT JOIN keeps rooms with zero requests (the closed Studio B) in the list.
-- Result: Main Hall has the most requests (4, none open); Kitchen has 2 open; Studio B has 0.
-- ------------------------------------------------------------
select room.room_name,
       count(r.request_id) as total_requests,
       count(r.request_id) filter (where r.status <> 'Resolved') as open_requests
from room
left join maintenance_request r on r.room_id = room.room_id
group by room.room_id, room.room_name
order by total_requests desc, room.room_name;

-- ------------------------------------------------------------
-- Op 12: Aggregation (SUM) (also: Join).
-- Purpose: What is the total cost for each vendor (jobs plus received deliveries)?
-- Explanation: Supports budget decisions. Jobs and deliveries are summed separately first so joining the two tables does not count anything twice.
-- Result: CoolAir Mechanical costs the most ($1,080.00); Sparkle Cleaning Co. has no cost ($0).
-- ------------------------------------------------------------
select v.vendor_name,
       coalesce(jobs.job_count, 0)       as jobs,
       coalesce(jobs.job_total, 0)       as job_cost,
       coalesce(parts.delivery_total, 0) as delivery_cost,
       coalesce(jobs.job_total, 0) + coalesce(parts.delivery_total, 0) as total_cost
from vendor v
left join (select vendor_id, count(*) as job_count, sum(final_cost) as job_total
           from vendor_job group by vendor_id) jobs on jobs.vendor_id = v.vendor_id
left join (select vendor_id, sum(cost) as delivery_total
           from delivery where status = 'Received' group by vendor_id) parts on parts.vendor_id = v.vendor_id
order by total_cost desc, v.vendor_name;

-- ------------------------------------------------------------
-- Op 13: Deactivate.
-- Purpose: Metro Climate Services is no longer used: deactivate the vendor instead of deleting it.
-- Explanation: Deactivating keeps the vendor's past jobs, costs and deliveries for reports, while the vendor stops being offered for new work and cannot be given new jobs (Rule 9).
-- Result: Metro Climate Services is now inactive (is_active = false) and its records are kept.
-- ------------------------------------------------------------
update vendor
set is_active = false
where vendor_name = 'Metro Climate Services'
returning vendor_id, vendor_name, is_active;

-- ------------------------------------------------------------
-- Op 14: Deactivate (delete refused).
-- Purpose: What happens if someone tries to delete a vendor permanently?
-- Explanation: The database refuses (Rule 9), so vendor history cannot be lost by accident. A refused delete is a successful test, because it shows the rule is enforced and why deactivating is the right approach.
-- Result: The delete is refused with the error "Rule 9: vendors are never deleted"; nothing is lost.
-- EXPECTED: an error. A refused delete is a successful test.
-- ------------------------------------------------------------
delete from vendor
where vendor_name = 'Metro Climate Services';
