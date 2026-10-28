-- ============================================================
-- ASSIGNMENT 5 — SQL AND DATA OPERATIONS
-- ============================================================
-- Run after wellspring.sql. Each query answers one of
-- the practice questions and uses WHERE, JOIN, COUNT, SUM,
-- GROUP BY, or UPDATE. The Express server runs the same queries
-- for its /api/reports routes.
-- ============================================================


-- ------------------------------------------------------------
-- Q1. Which maintenance requests remain unresolved?
--     WHERE + JOIN
-- ------------------------------------------------------------
select r.request_id,
       r.title,
       room.room_name,
       r.urgency,
       r.status,
       assignee.full_name as assigned_to,
       r.date_reported
from maintenance_request r
join room                 on room.room_id = r.room_id
left join person assignee on assignee.person_id = r.assigned_to_id
where r.status <> 'Resolved'
order by r.date_reported;


-- ------------------------------------------------------------
-- Q2. How many maintenance requests have occurred in each room?
--     JOIN + COUNT + GROUP BY
--     LEFT JOIN keeps rooms with zero requests in the list.
-- ------------------------------------------------------------
select room.room_name,
       count(r.request_id)                                as total_requests,
       count(r.request_id) filter (where r.status <> 'Resolved') as open_requests
from room
left join maintenance_request r on r.room_id = room.room_id
group by room.room_id, room.room_name
order by total_requests desc, room.room_name;

-- Follow-up (Requirement 6): repeat problems by room AND category.
select room.room_name,
       category.category_name,
       count(*) as times_reported
from maintenance_request r
join room     on room.room_id = r.room_id
join category on category.category_id = r.category_id
group by room.room_name, category.category_name
having count(*) > 1
order by times_reported desc;


-- ------------------------------------------------------------
-- Q3. Which vendors provide HVAC services?
--     JOIN through the many-to-many VendorService table + WHERE
-- ------------------------------------------------------------
select v.vendor_name,
       v.contact_name,
       v.phone,
       v.email
from vendor v
join vendor_service vs on vs.vendor_id = v.vendor_id
join service_type s    on s.service_type_id = vs.service_type_id
where s.service_name = 'HVAC'
  and v.is_active
order by v.vendor_name;


-- ------------------------------------------------------------
-- Q4. What is the total repair cost for each vendor?
--     JOIN + SUM + GROUP BY
--     Job costs and delivery costs are summed separately first,
--     so joining the two tables does not double-count anything.
-- ------------------------------------------------------------
select v.vendor_name,
       coalesce(jobs.job_count, 0)                                   as jobs,
       coalesce(jobs.job_total, 0)                                   as job_cost,
       coalesce(parts.delivery_total, 0)                             as delivery_cost,
       coalesce(jobs.job_total, 0) + coalesce(parts.delivery_total, 0) as total_cost
from vendor v
left join (
  select vendor_id, count(*) as job_count, sum(final_cost) as job_total
  from vendor_job
  group by vendor_id
) jobs on jobs.vendor_id = v.vendor_id
left join (
  select vendor_id, sum(cost) as delivery_total
  from delivery
  where status = 'Received'
  group by vendor_id
) parts on parts.vendor_id = v.vendor_id
order by total_cost desc, v.vendor_name;


-- ------------------------------------------------------------
-- Q5. Which deliveries arrived after their expected dates?
--     JOIN + WHERE comparing two dates
-- ------------------------------------------------------------
select d.delivery_id,
       v.vendor_name,
       d.item_description,
       d.date_expected,
       d.date_received,
       d.date_received - d.date_expected as days_late
from delivery d
join vendor v on v.vendor_id = d.vendor_id
where d.status = 'Received'
  and d.date_received > d.date_expected
order by days_late desc;

-- Follow-up: deliveries that are overdue and still have not arrived.
select d.delivery_id, v.vendor_name, d.item_description, d.date_expected
from delivery d
join vendor v on v.vendor_id = d.vendor_id
where d.status = 'Ordered'
  and d.date_expected < current_date;


-- ------------------------------------------------------------
-- Q6. How can staff update a request's status and preserve its history?
--     UPDATE + INSERT in one transaction
-- ------------------------------------------------------------
-- The request row stores the CURRENT status. Every change also adds
-- a status_update row, so the full history stays (like an order-
-- tracking page). Status updates cannot be edited or deleted.
--
-- Both statements run in one transaction: either both are saved
-- or neither is. The schema's triggers also refuse moves that
-- break Rules 2-4 (no assignee, backward move, unfinished job).

begin;

update maintenance_request
set assigned_to_id = (select person_id from person where full_name = 'Marcus Hill'),
    status = 'Assigned'
where title = 'Flickering ceiling light';

insert into status_update (request_id, author_id, note_text, new_status)
select request_id,
       (select person_id from person where full_name = 'Marcus Hill'),
       'Assigned to Marcus; will check the ballast.',
       'Assigned'
from maintenance_request
where title = 'Flickering ceiling light';

commit;

-- See the request's history, oldest first.
select su.created_at,
       author.full_name as written_by,
       su.new_status,
       su.note_text
from status_update su
join person author           on author.person_id = su.author_id
join maintenance_request r   on r.request_id = su.request_id
where r.title = 'Flickering ceiling light'
order by su.created_at;
