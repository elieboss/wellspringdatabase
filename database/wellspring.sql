-- ============================================================
-- WELLSPRING MAINTENANCE & VENDOR COORDINATION DATABASE
-- ============================================================
-- Follows a maintenance problem from first report to resolution,
-- and keeps every vendor job, delivery and cost connected to the
-- problem it belongs to.
--
-- PostgreSQL (Supabase). Run this whole file once on an empty
-- database to recreate it. To start over, run reset.sql first.
--
-- Sections
--   1. Create tables          columns, data types, primary keys,
--                             NOT NULL / UNIQUE / single-column CHECKs
--   2. Relationships          foreign keys between tables
--   3. Business rules         constraints and triggers for Rules 1-10
--   4. Indexes
--   5. Access
--   6. Sample data
--
-- Design decision: the planning document split this into two
-- databases (Maintenance, and Vendors & Deliveries). Following
-- instructor feedback it is now ONE database, so the two links
-- the program had to check by hand (vendor_job.request_id and
-- delivery.received_by_id) are real foreign keys.
--
-- "Rule N" in comments refers to the Business Rules table in the
-- planning document and docs/data-dictionary.md.
-- ============================================================


-- ============================================================
-- 1. CREATE TABLES
-- ============================================================
-- IDs are created by the database (identity columns) and never
-- reused. Text that is required may not be blank, not only
-- non-null. Fixed lists of values (statuses, urgency, person
-- type) are enforced with CHECK.


-- ------------------------------------------------------------
-- MAINTENANCE
-- ------------------------------------------------------------

-- PERSON
-- Anyone who reports a problem, handles it, writes a status
-- update, or signs for a delivery. One table for everyone keeps
-- each person in one place whatever their role.
create table person (
  person_id   int generated always as identity primary key,
  full_name   text not null check (btrim(full_name) <> ''),
  person_type text not null check (person_type in ('Staff', 'Volunteer', 'Board')),
  email       text check (email like '%_@_%'),
  phone       text check (phone ~ '^[0-9 ()-]+$')
);

-- ROOM
-- A room or space where a problem can happen. Closed rooms are
-- set to is_active = false instead of deleted, so their old
-- requests keep their link.
create table room (
  room_id   int generated always as identity primary key,
  room_name text not null unique check (btrim(room_name) <> ''),
  floor     text not null check (btrim(floor) <> ''),
  is_active boolean not null default true
);

-- CATEGORY
-- A kind of problem (HVAC, A/V, Plumbing, ...). Grouping requests
-- by category is what reveals repeat problems.
create table category (
  category_id   int generated always as identity primary key,
  category_name text not null unique check (btrim(category_name) <> ''),
  description   text
);

-- MAINTENANCE REQUEST
-- The centre of the workflow: one report of one problem, from
-- the first report until it is resolved. It holds the CURRENT
-- status; the history of how it got there is in status_update.
create table maintenance_request (
  request_id     int generated always as identity primary key,
  room_id        int not null,
  category_id    int not null,
  reported_by_id int not null,
  assigned_to_id int,                 -- empty until someone takes it
  title          text not null check (btrim(title) <> ''),
  description    text not null check (btrim(description) <> ''),
  urgency        text not null check (urgency in ('Low', 'Medium', 'High', 'Urgent')),
  status         text not null default 'Reported'
                 check (status in ('Reported', 'Assigned', 'In Progress', 'Resolved')),
  date_reported  timestamptz not null default now(),
  date_resolved  timestamptz          -- empty until Resolved (Rule 5)
);

-- STATUS UPDATE
-- A dated note on a request. Status updates are never edited or
-- deleted, so together they form a permanent history of who did
-- what and when (like an order-tracking page). new_status is
-- filled in only when the update changed the request's status.
create table status_update (
  update_id  int generated always as identity primary key,
  request_id int not null,
  author_id  int not null,
  note_text  text not null check (btrim(note_text) <> ''),
  new_status text check (new_status in ('Reported', 'Assigned', 'In Progress', 'Resolved')),
  created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- VENDORS & DELIVERIES
-- ------------------------------------------------------------

-- VENDOR
-- An outside company Wellspring hires or buys from. Vendors are
-- deactivated, never deleted, so past jobs and costs stay (Rule 9).
create table vendor (
  vendor_id    int generated always as identity primary key,
  vendor_name  text not null unique check (btrim(vendor_name) <> ''),
  contact_name text,
  email        text check (email like '%_@_%'),
  phone        text check (phone ~ '^[0-9 ()-]+$'),
  is_active    boolean not null default true
);

-- SERVICE TYPE
-- A kind of service a vendor can offer (HVAC, A/V, Cleaning, ...).
create table service_type (
  service_type_id int generated always as identity primary key,
  service_name    text not null unique check (btrim(service_name) <> '')
);

-- VENDOR SERVICE
-- Link table for the many-to-many relationship between vendors
-- and service types: one vendor can offer many services, and one
-- service can be offered by many vendors. The two-column primary
-- key stops the same pair being listed twice.
create table vendor_service (
  vendor_id       int not null,
  service_type_id int not null,
  primary key (vendor_id, service_type_id)
);

-- VENDOR JOB
-- One piece of work a vendor does for one maintenance request.
-- Its link to the request keeps every repair (and its cost)
-- connected to the problem it solved.
create table vendor_job (
  job_id          int generated always as identity primary key,
  vendor_id       int not null,
  request_id      int not null,
  job_description text not null check (btrim(job_description) <> ''),
  scheduled_date  date,
  completed_date  date,               -- empty until the work is done
  final_cost      numeric(10, 2) check (final_cost >= 0)          -- Rule 10
);

-- DELIVERY
-- One delivery of parts or supplies from a vendor. It may belong
-- to a vendor job (a part for a repair) or not (general stock).
-- Comparing date_expected with date_received shows late deliveries.
create table delivery (
  delivery_id      int generated always as identity primary key,
  vendor_id        int not null,
  job_id           int,               -- optional: not every order is for a repair
  item_description text not null check (btrim(item_description) <> ''),
  status           text not null default 'Ordered'
                   check (status in ('Ordered', 'Received', 'Cancelled')),
  date_expected    date not null,
  date_received    date,
  received_by_id   int,
  cost             numeric(10, 2) check (cost >= 0)               -- Rule 10
);


-- ============================================================
-- 2. RELATIONSHIPS
-- ============================================================
-- Foreign keys make the database refuse a link to a record that
-- does not exist (Rules 1 and 7). With no ON DELETE action, a
-- record that others point to cannot be deleted either.

-- A request belongs to one room, one category, and one reporter,
-- and may be assigned to one person.
alter table maintenance_request
  add constraint request_room_fk     foreign key (room_id)        references room (room_id),
  add constraint request_category_fk foreign key (category_id)    references category (category_id),
  add constraint request_reporter_fk foreign key (reported_by_id) references person (person_id),
  add constraint request_assignee_fk foreign key (assigned_to_id) references person (person_id);

-- One request has many status updates; each is written by a person.
alter table status_update
  add constraint update_request_fk foreign key (request_id) references maintenance_request (request_id),
  add constraint update_author_fk  foreign key (author_id)  references person (person_id);

-- Many-to-many: vendors <-> service types, through vendor_service.
alter table vendor_service
  add constraint vendor_service_vendor_fk  foreign key (vendor_id)       references vendor (vendor_id),
  add constraint vendor_service_service_fk foreign key (service_type_id) references service_type (service_type_id);

-- A vendor job is done by one vendor for one request.
-- (request_id was a cross-database FK* in the plan; now a real FK.)
alter table vendor_job
  add constraint job_vendor_fk  foreign key (vendor_id)  references vendor (vendor_id),
  add constraint job_request_fk foreign key (request_id) references maintenance_request (request_id);

-- A delivery comes from one vendor, may belong to one job, and is
-- signed for by one person.
-- (received_by_id was a cross-database FK* in the plan; now a real FK.)
alter table delivery
  add constraint delivery_vendor_fk   foreign key (vendor_id)      references vendor (vendor_id),
  add constraint delivery_job_fk      foreign key (job_id)         references vendor_job (job_id),
  add constraint delivery_receiver_fk foreign key (received_by_id) references person (person_id);


-- ============================================================
-- 3. BUSINESS RULES
-- ============================================================
-- Rules 1, 6 and 10 are already covered by NOT NULL, UNIQUE and
-- the cost CHECKs in section 1, and Rule 7 by the foreign keys in
-- section 2. The rules below involve more than one column or
-- table. The plan left some of them to "the program"; with one
-- database they are enforced here, so they hold for every user.


-- Rule 2 (part 1): a request cannot move past Reported until
-- someone is assigned to it.
alter table maintenance_request
  add constraint request_assigned_before_progress
    check (status = 'Reported' or assigned_to_id is not null);

-- Rule 5: date_resolved is filled in only when the request is
-- Resolved, and cannot be earlier than date_reported.
alter table maintenance_request
  add constraint request_resolved_date_matches_status
    check ((status = 'Resolved') = (date_resolved is not null)),
  add constraint request_resolved_after_reported
    check (date_resolved is null or date_resolved >= date_reported);

-- Rule 8: a Received delivery must have a received date and the
-- person who signed for it; otherwise both stay empty.
alter table delivery
  add constraint delivery_received_details
    check (
      (status = 'Received' and date_received is not null and received_by_id is not null)
      or
      (status <> 'Received' and date_received is null and received_by_id is null)
    );

-- Rule 10: a job cannot be completed before its scheduled date.
alter table vendor_job
  add constraint job_completed_after_scheduled
    check (completed_date is null or scheduled_date is null or completed_date >= scheduled_date);


-- Rules 2 (part 2), 3 and 4 need to look at other rows or the
-- previous value, which a CHECK cannot do, so a trigger checks
-- them every time a request is saved:
--   Rule 2: the assigned person must be Staff.
--   Rule 3: status only moves forward
--           (Reported -> Assigned -> In Progress -> Resolved).
--   Rule 4: a request cannot be Resolved while any of its vendor
--           jobs has no completed date.
-- It also fills in date_resolved when a request is resolved.
create function check_maintenance_request() returns trigger
language plpgsql as $$
declare
  status_order constant text[] := array['Reported', 'Assigned', 'In Progress', 'Resolved'];
begin
  if new.assigned_to_id is not null and not exists (
    select 1 from person
    where person_id = new.assigned_to_id and person_type = 'Staff'
  ) then
    raise exception 'Rule 2: requests can only be assigned to Staff';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if array_position(status_order, new.status) < array_position(status_order, old.status) then
      raise exception 'Rule 3: status cannot move backward from % to %', old.status, new.status;
    end if;

    if new.status = 'Resolved' and exists (
      select 1 from vendor_job
      where request_id = new.request_id and completed_date is null
    ) then
      raise exception 'Rule 4: every vendor job must have a completed date before the request is Resolved';
    end if;
  end if;

  if new.status = 'Resolved' and new.date_resolved is null then
    new.date_resolved := now();
  end if;

  return new;
end;
$$;

create trigger maintenance_request_rules
  before insert or update on maintenance_request
  for each row execute function check_maintenance_request();


-- Rule 9: only active vendors can be given new jobs.
create function check_vendor_job() returns trigger
language plpgsql as $$
begin
  if not exists (
    select 1 from vendor where vendor_id = new.vendor_id and is_active
  ) then
    raise exception 'Rule 9: only active vendors can be given new jobs';
  end if;

  return new;
end;
$$;

create trigger vendor_job_active_vendor
  before insert or update of vendor_id on vendor_job
  for each row execute function check_vendor_job();


-- Rule 9: vendors are deactivated, never deleted.
create function block_vendor_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Rule 9: vendors are never deleted; set is_active = false instead';
end;
$$;

create trigger vendor_never_deleted
  before delete on vendor
  for each row execute function block_vendor_delete();


-- Status updates are permanent history: they cannot be edited or
-- deleted ("cannot be edited" in the data dictionary).
create function block_status_update_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Status updates are permanent history and cannot be changed or deleted';
end;
$$;

create trigger status_update_append_only
  before update or delete on status_update
  for each row execute function block_status_update_changes();


-- ============================================================
-- 4. INDEXES
-- ============================================================
-- PostgreSQL does not index foreign keys automatically. These
-- support the common lookups: open requests in a room, a
-- request's history, vendors by service, and costs per vendor.

create index maintenance_request_room_idx   on maintenance_request (room_id);
create index maintenance_request_status_idx on maintenance_request (status);
create index status_update_request_idx      on status_update (request_id, created_at);
create index vendor_service_service_idx     on vendor_service (service_type_id);
create index vendor_job_request_idx         on vendor_job (request_id);
create index vendor_job_vendor_idx          on vendor_job (vendor_id);
create index delivery_vendor_idx            on delivery (vendor_id);


-- ============================================================
-- 5. ACCESS
-- ============================================================
-- Row level security with no policies: Supabase's public API keys
-- cannot read or write these tables. Only the Express server,
-- using the private connection string in .env, can reach them.
-- One database still allows finer access later (for example,
-- only coordinators and leadership see vendor costs) with roles
-- or policies, which was the reason for two databases in the plan.

alter table person              enable row level security;
alter table room                enable row level security;
alter table category            enable row level security;
alter table maintenance_request enable row level security;
alter table status_update       enable row level security;
alter table vendor              enable row level security;
alter table service_type        enable row level security;
alter table vendor_service      enable row level security;
alter table vendor_job          enable row level security;
alter table delivery            enable row level security;


-- ============================================================
-- 6. SAMPLE DATA
-- ============================================================
-- Fictional people, vendors and contact details (example.com /
-- .example domains, 555 phone numbers).
--
-- Rows are linked by name instead of typed-in ID numbers, so the
-- data reads like the real workflow. It demonstrates:
--   * every request status (Reported, Assigned, In Progress,
--     Resolved), every urgency, and every person type
--   * the planning document's scenario: "AC not cooling" in the
--     Main Hall before a Saturday booking, step by step
--   * a repeat problem: four HVAC requests in the Main Hall
--   * a request fixed by staff with no vendor, and one still
--     waiting on an unfinished vendor job
--   * deliveries that are on time, late, overdue, cancelled, and
--     one bought for stock rather than for a repair
--   * a closed room and an inactive vendor kept for history


-- ------------------------------------------------------------
-- People, rooms and categories
-- ------------------------------------------------------------

insert into person (full_name, person_type, email, phone) values
  ('Dana Lee',      'Staff',     'dana.lee@wellspring.example',      '(555) 201-0101'),  -- front desk
  ('Marcus Hill',   'Staff',     'marcus.hill@wellspring.example',   '(555) 201-0102'),  -- facilities
  ('Ava Thompson',  'Staff',     'ava.thompson@wellspring.example',  '(555) 201-0103'),  -- bookings
  ('Priya Shah',    'Volunteer', 'priya.shah@example.com',           null),
  ('Jordan Ruiz',   'Board',     'jordan.ruiz@example.com',          '555-201-0199');

insert into room (room_name, floor, is_active) values
  ('Main Hall',      '1',        true),
  ('Cellar Theater', 'Basement', true),
  ('Gallery',        '2',        true),
  ('Kitchen',        '1',        true),
  ('Lobby',          '1',        true),
  ('Studio B',       '2',        false);   -- closed room: kept, not deleted

insert into category (category_name, description) values
  ('HVAC',       'Heating, air conditioning, ventilation, thermostats'),
  ('A/V',        'Projectors, speakers, microphones, stage sound'),
  ('Plumbing',   'Sinks, toilets, pipes, leaks'),
  ('Lighting',   'Light fixtures, bulbs, stage lights'),
  ('Electrical', 'Outlets, breakers, wiring');


-- ------------------------------------------------------------
-- Vendors and the services they offer
-- ------------------------------------------------------------

insert into service_type (service_name) values
  ('HVAC'), ('A/V'), ('Plumbing'), ('Electrical'), ('Cleaning');

insert into vendor (vendor_name, contact_name, email, phone, is_active) values
  ('CoolAir Mechanical',     'Sam Ortiz',    'service@coolair.example',      '(555) 300-1000', true),
  ('Metro Climate Services', 'Renee Park',   'dispatch@metroclimate.example','(555) 300-2000', true),
  ('StageSound AV',          'Leo Grant',    'help@stagesound.example',      '(555) 300-3000', true),
  ('FlowRight Plumbing',     'Tasha Brooks', 'jobs@flowright.example',       '(555) 300-4000', true),
  ('Bright Spark Electric',  'Omar Haddad',  'office@brightspark.example',   '(555) 300-5000', true),
  ('Sparkle Cleaning Co.',   null,           null,                           '(555) 300-6000', false);  -- no longer used

-- Two vendors offer HVAC, and two vendors offer more than one service.
insert into vendor_service (vendor_id, service_type_id)
select v.vendor_id, s.service_type_id
from (values
  ('CoolAir Mechanical',     'HVAC'),
  ('Metro Climate Services', 'HVAC'),
  ('Metro Climate Services', 'Plumbing'),
  ('StageSound AV',          'A/V'),
  ('StageSound AV',          'Electrical'),
  ('FlowRight Plumbing',     'Plumbing'),
  ('Bright Spark Electric',  'Electrical'),
  ('Sparkle Cleaning Co.',   'Cleaning')
) as pair (vendor_name, service_name)
join vendor v       on v.vendor_name = pair.vendor_name
join service_type s on s.service_name = pair.service_name;


-- ------------------------------------------------------------
-- Maintenance requests, at every stage of the workflow
-- ------------------------------------------------------------

insert into maintenance_request
  (room_id, category_id, reported_by_id, assigned_to_id,
   title, description, urgency, status, date_reported, date_resolved)
select room.room_id, category.category_id, reporter.person_id, assignee.person_id,
       r.title, r.description, r.urgency, r.status,
       r.date_reported::timestamptz, r.date_resolved::timestamptz
from (values
  -- Earlier Main Hall HVAC problems: together with the scenario
  -- below they show a repeat problem.
  ('Main Hall', 'HVAC', 'Dana Lee', 'Marcus Hill',
   'AC blowing warm air', 'Air conditioning runs but blows warm air during the afternoon.',
   'High', 'Resolved', '2026-02-09 10:05', '2026-02-12 15:30'),

  ('Main Hall', 'HVAC', 'Priya Shah', 'Marcus Hill',
   'AC unit rattling', 'Loud rattling from the ceiling unit near the stage.',
   'Medium', 'Resolved', '2026-06-15 13:20', '2026-06-19 11:00'),

  -- Fixed by staff, no vendor needed.
  ('Main Hall', 'HVAC', 'Ava Thompson', 'Marcus Hill',
   'Thermostat display blank', 'Thermostat by the main doors shows nothing.',
   'Low', 'Resolved', '2026-08-20 09:00', '2026-08-20 14:10'),

  ('Cellar Theater', 'Plumbing', 'Ava Thompson', 'Marcus Hill',
   'Leak under stage stairs', 'Water pooling under the stairs to the stage after rain.',
   'Urgent', 'Resolved', '2026-07-02 08:40', '2026-07-10 16:00'),

  ('Gallery', 'Electrical', 'Dana Lee', 'Marcus Hill',
   'Outlet by window not working', 'Wall outlet by the east window has no power.',
   'Medium', 'Resolved', '2026-09-10 11:15', '2026-09-16 10:30'),

  -- Planning document scenario (Deliverable 5).
  ('Main Hall', 'HVAC', 'Dana Lee', 'Dana Lee',
   'AC not cooling', 'AC is running but the room is not cooling down.',
   'High', 'Resolved', '2026-10-05 08:55', '2026-10-09 16:45'),

  -- Still open: In Progress with an unfinished vendor job.
  ('Cellar Theater', 'A/V', 'Ava Thompson', 'Marcus Hill',
   'Projector will not turn on', 'Booth projector clicks but the lamp never lights.',
   'High', 'In Progress', '2026-10-19 17:30', null),

  -- Still open: Assigned, no vendor yet.
  ('Kitchen', 'Plumbing', 'Priya Shah', 'Marcus Hill',
   'Sink draining slowly', 'Main kitchen sink takes several minutes to drain.',
   'Medium', 'Assigned', '2026-10-21 12:10', null),

  -- Still open: Reported by a board member, nobody assigned yet.
  ('Lobby', 'Lighting', 'Jordan Ruiz', null,
   'Flickering ceiling light', 'Ceiling light over the front desk flickers constantly.',
   'Low', 'Reported', '2026-10-23 18:05', null)
) as r (room_name, category_name, reporter, assignee,
        title, description, urgency, status, date_reported, date_resolved)
join room                 on room.room_name = r.room_name
join category             on category.category_name = r.category_name
join person reporter      on reporter.full_name = r.reporter
left join person assignee on assignee.full_name = r.assignee
order by r.date_reported::timestamptz;


-- ------------------------------------------------------------
-- Status updates: each request's history
-- ------------------------------------------------------------
-- Rows with a new_status record a status change; rows without one
-- are plain notes.

insert into status_update (request_id, author_id, note_text, new_status, created_at)
select req.request_id, author.person_id, u.note_text, u.new_status, u.created_at::timestamptz
from (values
  ('AC blowing warm air', 'Dana Lee',    'Problem reported.',                                   'Reported',    '2026-02-09 10:05'),
  ('AC blowing warm air', 'Marcus Hill', 'Taking this one.',                                    'Assigned',    '2026-02-09 11:00'),
  ('AC blowing warm air', 'Marcus Hill', 'Refrigerant low; CoolAir booked.',                    'In Progress', '2026-02-10 09:30'),
  ('AC blowing warm air', 'Marcus Hill', 'CoolAir recharged the unit; cooling normally.',       'Resolved',    '2026-02-12 15:30'),

  ('AC unit rattling', 'Priya Shah',  'Problem reported.',                                      'Reported',    '2026-06-15 13:20'),
  ('AC unit rattling', 'Marcus Hill', 'Assigned to me.',                                        'Assigned',    '2026-06-15 14:00'),
  ('AC unit rattling', 'Marcus Hill', 'Loose fan mount; CoolAir unavailable, using Metro Climate.', 'In Progress', '2026-06-16 10:00'),
  ('AC unit rattling', 'Marcus Hill', 'Fan mount replaced.',                                    'Resolved',    '2026-06-19 11:00'),

  ('Leak under stage stairs', 'Ava Thompson', 'Problem reported.',                              'Reported',    '2026-07-02 08:40'),
  ('Leak under stage stairs', 'Marcus Hill',  'Assigned; placed buckets and closed the stairs.','Assigned',    '2026-07-02 09:15'),
  ('Leak under stage stairs', 'Marcus Hill',  'FlowRight found a cracked fitting; parts ordered.', 'In Progress', '2026-07-03 13:00'),
  ('Leak under stage stairs', 'Marcus Hill',  'Parts arrived late (Jul 9); fitting replaced Jul 10.', null,       '2026-07-10 15:00'),
  ('Leak under stage stairs', 'Marcus Hill',  'No more leaking after rain test.',               'Resolved',    '2026-07-10 16:00'),

  ('Thermostat display blank', 'Ava Thompson', 'Problem reported.',                             'Reported',    '2026-08-20 09:00'),
  ('Thermostat display blank', 'Marcus Hill',  'Assigned.',                                     'Assigned',    '2026-08-20 09:30'),
  ('Thermostat display blank', 'Marcus Hill',  'Replaced thermostat batteries; no vendor needed.', 'Resolved', '2026-08-20 14:10'),

  ('Outlet by window not working', 'Dana Lee',    'Problem reported.',                          'Reported',    '2026-09-10 11:15'),
  ('Outlet by window not working', 'Marcus Hill', 'Assigned.',                                  'Assigned',    '2026-09-10 12:00'),
  ('Outlet by window not working', 'Marcus Hill', 'Breaker is fine; calling Bright Spark.',     'In Progress', '2026-09-11 09:00'),
  ('Outlet by window not working', 'Marcus Hill', 'Outlet replaced by Bright Spark.',           'Resolved',    '2026-09-16 10:30'),

  -- Planning document scenario, step by step
  ('AC not cooling', 'Dana Lee', 'Problem reported. Room booked Saturday by a community group.',      'Reported',    '2026-10-05 08:55'),
  ('AC not cooling', 'Dana Lee', 'Assigned to myself.',                                               'Assigned',    '2026-10-05 09:20'),
  ('AC not cooling', 'Dana Lee', 'Checked the thermostat and filter; problem needs a technician.',    null,          '2026-10-05 10:00'),
  ('AC not cooling', 'Dana Lee', 'CoolAir Mechanical booked for Wednesday.',                          'In Progress', '2026-10-05 11:30'),
  ('AC not cooling', 'Dana Lee', 'Technician found a failed capacitor; replacement ordered for Thursday.', null,     '2026-10-07 14:00'),
  ('AC not cooling', 'Dana Lee', 'Capacitor arrived Friday (one day late) and was installed. Cooling works; Saturday event can go ahead.', 'Resolved', '2026-10-09 16:45'),

  ('Projector will not turn on', 'Ava Thompson', 'Problem reported.',                           'Reported',    '2026-10-19 17:30'),
  ('Projector will not turn on', 'Marcus Hill',  'Assigned.',                                   'Assigned',    '2026-10-20 09:00'),
  ('Projector will not turn on', 'Marcus Hill',  'Lamp is dead; StageSound ordering a new one.','In Progress', '2026-10-20 15:00'),

  ('Sink draining slowly', 'Priya Shah',  'Problem reported.',                                  'Reported',    '2026-10-21 12:10'),
  ('Sink draining slowly', 'Marcus Hill', 'Assigned; will try a snake first.',                  'Assigned',    '2026-10-22 08:30'),
  ('Sink draining slowly', 'Marcus Hill', 'Cancelled the auger rental; our own snake should do.', null,        '2026-10-22 10:00'),

  ('Flickering ceiling light', 'Jordan Ruiz', 'Problem reported after the board meeting.',      'Reported',    '2026-10-23 18:05')
) as u (title, author, note_text, new_status, created_at)
join maintenance_request req on req.title = u.title
join person author           on author.full_name = u.author
order by u.created_at::timestamptz;


-- ------------------------------------------------------------
-- Vendor jobs: each connected to the request it fixes
-- ------------------------------------------------------------

insert into vendor_job
  (vendor_id, request_id, job_description, scheduled_date, completed_date, final_cost)
select v.vendor_id, req.request_id, j.job_description,
       j.scheduled_date::date, j.completed_date::date, j.final_cost::numeric
from (values
  ('CoolAir Mechanical',     'AC blowing warm air',          'Recharge refrigerant in Main Hall unit',             '2026-02-11', '2026-02-12', '380.00'),
  ('Metro Climate Services', 'AC unit rattling',             'Replace loose fan mount on Main Hall unit',          '2026-06-18', '2026-06-19', '240.00'),
  ('FlowRight Plumbing',     'Leak under stage stairs',      'Find and repair leak under Cellar Theater stairs',   '2026-07-03', '2026-07-10', '420.00'),
  ('Bright Spark Electric',  'Outlet by window not working', 'Replace Gallery window outlet',                      '2026-09-15', '2026-09-16', '150.00'),
  ('CoolAir Mechanical',     'AC not cooling',               'Diagnose and repair AC not cooling in the Main Hall','2026-10-07', '2026-10-09', '615.00'),
  -- Unfinished: keeps the projector request from being resolved (Rule 4).
  ('StageSound AV',          'Projector will not turn on',   'Replace projector lamp in Cellar Theater booth',     '2026-10-29', null,         null)
) as j (vendor_name, title, job_description, scheduled_date, completed_date, final_cost)
join vendor v                on v.vendor_name = j.vendor_name
join maintenance_request req on req.title = j.title
order by j.scheduled_date::date;


-- ------------------------------------------------------------
-- Deliveries: on time, late, overdue, cancelled, and for stock
-- ------------------------------------------------------------

insert into delivery
  (vendor_id, job_id, item_description, status,
   date_expected, date_received, received_by_id, cost)
select v.vendor_id, job.job_id, d.item_description, d.status,
       d.date_expected::date, d.date_received::date, signer.person_id, d.cost::numeric
from (values
  -- Late by 3 days
  ('FlowRight Plumbing', 'Find and repair leak under Cellar Theater stairs',
   'Pipe fittings',             'Received',  '2026-07-06', '2026-07-09', 'Marcus Hill', '60.00'),
  -- Stock order, not for a repair job
  ('Metro Climate Services', null,
   'Spare HVAC filters (box of 12)', 'Received', '2026-08-01', '2026-07-31', 'Ava Thompson', '64.00'),
  -- On time
  ('Bright Spark Electric', 'Replace Gallery window outlet',
   'Tamper-resistant outlet',   'Received',  '2026-09-15', '2026-09-15', 'Marcus Hill', '18.50'),
  -- Scenario: late by 1 day
  ('CoolAir Mechanical', 'Diagnose and repair AC not cooling in the Main Hall',
   'Replacement capacitor',     'Received',  '2026-10-08', '2026-10-09', 'Dana Lee',    '85.00'),
  -- Cancelled before it arrived
  ('FlowRight Plumbing', null,
   'Drain auger rental',        'Cancelled', '2026-10-23', null,         null,          '45.00'),
  -- Overdue: expected Oct 26, still not here
  ('StageSound AV', 'Replace projector lamp in Cellar Theater booth',
   'Projector lamp',            'Ordered',   '2026-10-26', null,         null,          '210.00')
) as d (vendor_name, job_description, item_description, status,
        date_expected, date_received, signer, cost)
join vendor v            on v.vendor_name = d.vendor_name
left join vendor_job job on job.job_description = d.job_description
left join person signer  on signer.full_name = d.signer
order by d.date_expected::date;
