-- ============================================================
-- WELLSPRING MAINTENANCE & VENDOR COORDINATION — SCHEMA
-- ============================================================
-- One PostgreSQL database (Supabase) with ten tables.
--
-- The Assignment 3 plan split this into two databases
-- (Maintenance, and Vendors & Deliveries). Following instructor
-- feedback, everything now lives in ONE database as separate
-- tables. That turns the two cross-database links that the
-- program had to check (marked FK* in the plan) into real
-- foreign keys:
--   vendor_job.request_id     -> maintenance_request
--   delivery.received_by_id   -> person
--
-- Run this file once on an empty database (Supabase SQL Editor,
-- or let the server load it automatically in local mode).
-- To start over, run reset.sql first.
--
-- Business rule numbers (Rule 1 ... Rule 10) match Deliverable 4.
-- ============================================================


-- ------------------------------------------------------------
-- MAINTENANCE TABLES
-- ------------------------------------------------------------

-- Person: anyone who reports a problem, handles it, writes an
-- update on it, or signs for a delivery.
create table person (
  person_id   int generated always as identity primary key,
  full_name   text not null check (btrim(full_name) <> ''),
  person_type text not null check (person_type in ('Staff', 'Volunteer', 'Board')),
  email       text check (email like '%_@_%'),
  phone       text check (phone ~ '^[0-9 ()-]+$')
);

-- Room: a room or space where a problem can happen.
-- Closed rooms are deactivated, not deleted, so old requests keep their link.
create table room (
  room_id   int generated always as identity primary key,
  room_name text not null unique check (btrim(room_name) <> ''),   -- Rule 6
  floor     text not null check (btrim(floor) <> ''),
  is_active boolean not null default true
);

-- Category: a kind of problem (HVAC, A/V, Plumbing, ...).
create table category (
  category_id   int generated always as identity primary key,
  category_name text not null unique check (btrim(category_name) <> ''),   -- Rule 6
  description   text
);

-- MaintenanceRequest: one report of one problem, from first
-- report until it is resolved.
create table maintenance_request (
  request_id     int generated always as identity primary key,
  room_id        int not null references room (room_id),            -- Rule 1
  category_id    int not null references category (category_id),    -- Rule 1
  reported_by_id int not null references person (person_id),        -- Rule 1
  assigned_to_id int references person (person_id),
  title          text not null check (btrim(title) <> ''),          -- Rule 1
  description    text not null check (btrim(description) <> ''),    -- Rule 1
  urgency        text not null check (urgency in ('Low', 'Medium', 'High', 'Urgent')),
  status         text not null default 'Reported'
                 check (status in ('Reported', 'Assigned', 'In Progress', 'Resolved')),
  date_reported  timestamptz not null default now(),
  date_resolved  timestamptz,

  -- Rule 2: cannot move past Reported without an assigned person.
  constraint request_assigned_before_progress
    check (status = 'Reported' or assigned_to_id is not null),

  -- Rule 5: date_resolved is filled in only when Resolved,
  -- and cannot be earlier than date_reported.
  constraint request_resolved_date_matches_status
    check ((status = 'Resolved') = (date_resolved is not null)),
  constraint request_resolved_after_reported
    check (date_resolved is null or date_resolved >= date_reported)
);

-- StatusUpdate: a dated note added to a request. Together these
-- rows are the request's history (like an order-tracking page).
-- Rows are append-only: see the trigger further down.
create table status_update (
  update_id  int generated always as identity primary key,
  request_id int not null references maintenance_request (request_id),   -- Rule 1
  author_id  int not null references person (person_id),                 -- Rule 1
  note_text  text not null check (btrim(note_text) <> ''),
  new_status text check (new_status in ('Reported', 'Assigned', 'In Progress', 'Resolved')),
  created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- VENDOR & DELIVERY TABLES
-- ------------------------------------------------------------

-- Vendor: an outside company Wellspring hires or buys from.
-- Vendors are deactivated, never deleted (Rule 9).
create table vendor (
  vendor_id    int generated always as identity primary key,
  vendor_name  text not null unique check (btrim(vendor_name) <> ''),   -- Rule 6
  contact_name text,
  email        text check (email like '%_@_%'),
  phone        text check (phone ~ '^[0-9 ()-]+$'),
  is_active    boolean not null default true
);

-- ServiceType: a kind of service a vendor can offer.
create table service_type (
  service_type_id int generated always as identity primary key,
  service_name    text not null unique check (btrim(service_name) <> '')   -- Rule 6
);

-- VendorService: links vendors and service types (many-to-many).
-- The composite primary key makes each (vendor, service) pair unique.
create table vendor_service (
  vendor_id       int not null references vendor (vendor_id),
  service_type_id int not null references service_type (service_type_id),
  primary key (vendor_id, service_type_id)
);

-- VendorJob: one piece of work a vendor does for one request.
create table vendor_job (
  job_id          int generated always as identity primary key,
  vendor_id       int not null references vendor (vendor_id),                 -- Rule 7
  request_id      int not null references maintenance_request (request_id),  -- Rule 7 (now a real FK)
  job_description text not null check (btrim(job_description) <> ''),
  scheduled_date  date,
  completed_date  date,
  final_cost      numeric(10, 2) check (final_cost >= 0),                     -- Rule 10

  -- Rule 10: completed date cannot be before the scheduled date.
  constraint job_completed_after_scheduled
    check (completed_date is null or scheduled_date is null or completed_date >= scheduled_date)
);

-- Delivery: one delivery of parts or supplies from a vendor.
create table delivery (
  delivery_id      int generated always as identity primary key,
  vendor_id        int not null references vendor (vendor_id),
  job_id           int references vendor_job (job_id),
  item_description text not null check (btrim(item_description) <> ''),
  status           text not null default 'Ordered'
                   check (status in ('Ordered', 'Received', 'Cancelled')),
  date_expected    date not null,
  date_received    date,
  received_by_id   int references person (person_id),   -- now a real FK
  cost             numeric(10, 2) check (cost >= 0),    -- Rule 10

  -- Rule 8: Received needs a received date and a signer; otherwise both stay empty.
  constraint delivery_received_details
    check (
      (status = 'Received' and date_received is not null and received_by_id is not null)
      or
      (status <> 'Received' and date_received is null and received_by_id is null)
    )
);


-- ------------------------------------------------------------
-- INDEXES FOR COMMON LOOKUPS
-- ------------------------------------------------------------
-- Foreign keys are not indexed automatically in PostgreSQL.

create index maintenance_request_room_idx   on maintenance_request (room_id);
create index maintenance_request_status_idx on maintenance_request (status);
create index status_update_request_idx      on status_update (request_id, created_at);
create index vendor_service_service_idx     on vendor_service (service_type_id);
create index vendor_job_request_idx         on vendor_job (request_id);
create index vendor_job_vendor_idx          on vendor_job (vendor_id);
create index delivery_vendor_idx            on delivery (vendor_id);


-- ------------------------------------------------------------
-- RULES THE PLAN LEFT TO "THE PROGRAM"
-- ------------------------------------------------------------
-- With one database these can be enforced here instead, so they
-- hold no matter which program (or SQL Editor user) changes data.

-- Rules 2, 3, 4 and 5 on maintenance_request.
create function check_maintenance_request() returns trigger
language plpgsql as $$
declare
  status_order constant text[] := array['Reported', 'Assigned', 'In Progress', 'Resolved'];
begin
  -- Rule 2: the assigned person must be Staff.
  if new.assigned_to_id is not null and not exists (
    select 1 from person
    where person_id = new.assigned_to_id and person_type = 'Staff'
  ) then
    raise exception 'Rule 2: requests can only be assigned to Staff';
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    -- Rule 3: status can only move forward.
    if array_position(status_order, new.status) < array_position(status_order, old.status) then
      raise exception 'Rule 3: status cannot move backward from % to %', old.status, new.status;
    end if;

    -- Rule 4: cannot resolve while a vendor job is unfinished.
    if new.status = 'Resolved' and exists (
      select 1 from vendor_job
      where request_id = new.request_id and completed_date is null
    ) then
      raise exception 'Rule 4: every vendor job must have a completed date before the request is Resolved';
    end if;
  end if;

  -- Rule 5 helper: fill in date_resolved when the request is resolved.
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


-- History is permanent: status updates cannot be edited or deleted
-- ("filled in automatically; cannot be edited" in the data dictionary).
create function block_status_update_changes() returns trigger
language plpgsql as $$
begin
  raise exception 'Status updates are permanent history and cannot be changed or deleted';
end;
$$;

create trigger status_update_append_only
  before update or delete on status_update
  for each row execute function block_status_update_changes();


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


-- ------------------------------------------------------------
-- ACCESS
-- ------------------------------------------------------------
-- Row level security with no policies: the browser-facing Supabase
-- API keys cannot read or write these tables. Only the Express
-- server, connecting with the database connection string kept in
-- .env, can reach them. Never put that string in browser code or Git.
-- Finer access (e.g. only coordinators and leadership see vendor
-- costs) can be added later with roles or policies.

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
