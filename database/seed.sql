-- ============================================================
-- WELLSPRING — SAMPLE DATA
-- ============================================================
-- Run after schema.sql. Rows are linked by name (not by typed-in
-- ID numbers) so the file reads like the real workflow.
--
-- Request "AC not cooling" is the Deliverable 5 scenario: the
-- Main Hall air conditioning fails before a Saturday booking.
-- Earlier HVAC requests in the Main Hall make the "repeat problem"
-- pattern visible, and other rooms give the SQL practice
-- questions something to find.
-- ============================================================


-- ------------------------------------------------------------
-- LOOKUP TABLES
-- ------------------------------------------------------------

insert into person (full_name, person_type, email, phone) values
  ('Dana Lee',      'Staff',     'dana.lee@wellspring.example',      '(555) 201-0101'),
  ('Marcus Hill',   'Staff',     'marcus.hill@wellspring.example',   '(555) 201-0102'),
  ('Ava Thompson',  'Staff',     'ava.thompson@wellspring.example',  '(555) 201-0103'),
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

insert into service_type (service_name) values
  ('HVAC'), ('A/V'), ('Plumbing'), ('Electrical'), ('Cleaning');

insert into vendor (vendor_name, contact_name, email, phone, is_active) values
  ('CoolAir Mechanical',     'Sam Ortiz',    'service@coolair.example',     '(555) 300-1000', true),
  ('Metro Climate Services', 'Renee Park',   'dispatch@metroclimate.example','(555) 300-2000', true),
  ('StageSound AV',          'Leo Grant',    'help@stagesound.example',      '(555) 300-3000', true),
  ('FlowRight Plumbing',     'Tasha Brooks', 'jobs@flowright.example',       '(555) 300-4000', true),
  ('Bright Spark Electric',  'Omar Haddad',  'office@brightspark.example',   '(555) 300-5000', true),
  ('Sparkle Cleaning Co.',   null,           null,                           '(555) 300-6000', false);  -- no longer used

-- Many-to-many: one vendor can offer many services,
-- and one service can be offered by many vendors.
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
-- MAINTENANCE REQUESTS
-- ------------------------------------------------------------

insert into maintenance_request
  (room_id, category_id, reported_by_id, assigned_to_id,
   title, description, urgency, status, date_reported, date_resolved)
select room.room_id, category.category_id, reporter.person_id, assignee.person_id,
       r.title, r.description, r.urgency, r.status,
       r.date_reported::timestamptz, r.date_resolved::timestamptz
from (values
  ('Main Hall', 'HVAC', 'Dana Lee', 'Marcus Hill',
   'AC blowing warm air', 'Air conditioning runs but blows warm air during the afternoon.',
   'High', 'Resolved', '2026-02-09 10:05', '2026-02-12 15:30'),

  ('Cellar Theater', 'Plumbing', 'Ava Thompson', 'Marcus Hill',
   'Leak under stage stairs', 'Water pooling under the stairs to the stage after rain.',
   'Urgent', 'Resolved', '2026-07-02 08:40', '2026-07-10 16:00'),

  ('Main Hall', 'HVAC', 'Priya Shah', 'Marcus Hill',
   'AC unit rattling', 'Loud rattling from the ceiling unit near the stage.',
   'Medium', 'Resolved', '2026-06-15 13:20', '2026-06-19 11:00'),

  ('Main Hall', 'HVAC', 'Ava Thompson', 'Marcus Hill',
   'Thermostat display blank', 'Thermostat by the main doors shows nothing.',
   'Low', 'Resolved', '2026-08-20 09:00', '2026-08-20 14:10'),

  ('Gallery', 'Electrical', 'Dana Lee', 'Marcus Hill',
   'Outlet by window not working', 'Wall outlet by the east window has no power.',
   'Medium', 'Resolved', '2026-09-10 11:15', '2026-09-16 10:30'),

  -- Deliverable 5 scenario
  ('Main Hall', 'HVAC', 'Dana Lee', 'Dana Lee',
   'AC not cooling', 'AC is running but the room is not cooling down.',
   'High', 'Resolved', '2026-10-05 08:55', '2026-10-09 16:45'),

  ('Cellar Theater', 'A/V', 'Ava Thompson', 'Marcus Hill',
   'Projector will not turn on', 'Booth projector clicks but the lamp never lights.',
   'High', 'In Progress', '2026-10-19 17:30', null),

  ('Kitchen', 'Plumbing', 'Priya Shah', 'Marcus Hill',
   'Sink draining slowly', 'Main kitchen sink takes several minutes to drain.',
   'Medium', 'Assigned', '2026-10-21 12:10', null),

  ('Lobby', 'Lighting', 'Priya Shah', null,
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
-- STATUS UPDATES (each request's history)
-- ------------------------------------------------------------

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

  -- Deliverable 5 scenario, step by step
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

  ('Flickering ceiling light', 'Priya Shah', 'Problem reported.',                               'Reported',    '2026-10-23 18:05')
) as u (title, author, note_text, new_status, created_at)
join maintenance_request req on req.title = u.title
join person author           on author.full_name = u.author
order by u.created_at::timestamptz;


-- ------------------------------------------------------------
-- VENDOR JOBS (each connected to the request it fixes)
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
  ('StageSound AV',          'Projector will not turn on',   'Replace projector lamp in Cellar Theater booth',     '2026-10-29', null,         null)
) as j (vendor_name, title, job_description, scheduled_date, completed_date, final_cost)
join vendor v                on v.vendor_name = j.vendor_name
join maintenance_request req on req.title = j.title
order by j.scheduled_date::date;


-- ------------------------------------------------------------
-- DELIVERIES
-- ------------------------------------------------------------

insert into delivery
  (vendor_id, job_id, item_description, status,
   date_expected, date_received, received_by_id, cost)
select v.vendor_id, job.job_id, d.item_description, d.status,
       d.date_expected::date, d.date_received::date, signer.person_id, d.cost::numeric
from (values
  ('FlowRight Plumbing', 'Find and repair leak under Cellar Theater stairs',
   'Pipe fittings',          'Received', '2026-07-06', '2026-07-09', 'Marcus Hill', '60.00'),
  ('Bright Spark Electric', 'Replace Gallery window outlet',
   'Tamper-resistant outlet', 'Received', '2026-09-15', '2026-09-15', 'Marcus Hill', '18.50'),
  ('CoolAir Mechanical', 'Diagnose and repair AC not cooling in the Main Hall',
   'Replacement capacitor',  'Received', '2026-10-08', '2026-10-09', 'Dana Lee',    '85.00'),
  ('StageSound AV', 'Replace projector lamp in Cellar Theater booth',
   'Projector lamp',         'Ordered',  '2026-10-26', null,         null,          '210.00')
) as d (vendor_name, job_description, item_description, status,
        date_expected, date_received, signer, cost)
join vendor v           on v.vendor_name = d.vendor_name
left join vendor_job job on job.job_description = d.job_description
left join person signer  on signer.full_name = d.signer
order by d.date_expected::date;
