-- ============================================================
-- ASSIGNMENT 4 — DATABASE TESTS
-- ============================================================
-- Run after wellspring.sql. Everything happens inside
-- one transaction that is ROLLED BACK at the end, so the test
-- leaves no rows behind and can be run again and again.
--
-- Each check raises an error if it fails. If the script reaches
-- the end, every check passed.
--
-- Part A: the instructor's suggested workflow test
--   create a request for a room -> assign it to a staff member ->
--   connect a vendor job -> add a status update documenting the repair
-- Part B: relationship tests
-- Part C: business rules the database refuses to break
-- ============================================================

begin;


-- ------------------------------------------------------------
-- PART A: ONE REQUEST, START TO FINISH
-- ------------------------------------------------------------

do $$
declare
  new_request_id int;
  new_job_id     int;
  update_count   int;
  final_status   text;
begin
  -- 1. Create a maintenance request for a room.
  insert into maintenance_request (room_id, category_id, reported_by_id, title, description, urgency)
  values (
    (select room_id from room where room_name = 'Gallery'),
    (select category_id from category where category_name = 'HVAC'),
    (select person_id from person where full_name = 'Priya Shah'),
    'TEST: Gallery too cold',
    'Vent blows cold air all day.',
    'Medium'
  )
  returning request_id into new_request_id;

  insert into status_update (request_id, author_id, note_text, new_status)
  values (new_request_id, (select person_id from person where full_name = 'Priya Shah'),
          'Problem reported.', 'Reported');

  -- 2. Assign it to a staff member (status + history together).
  update maintenance_request
  set assigned_to_id = (select person_id from person where full_name = 'Marcus Hill'),
      status = 'Assigned'
  where request_id = new_request_id;

  insert into status_update (request_id, author_id, note_text, new_status)
  values (new_request_id, (select person_id from person where full_name = 'Marcus Hill'),
          'Assigned to Marcus.', 'Assigned');

  -- 3. Connect it to a vendor job.
  insert into vendor_job (vendor_id, request_id, job_description, scheduled_date)
  values ((select vendor_id from vendor where vendor_name = 'CoolAir Mechanical'),
          new_request_id, 'TEST: Balance Gallery vents', date '2026-11-02')
  returning job_id into new_job_id;

  update maintenance_request set status = 'In Progress' where request_id = new_request_id;

  -- 4. Add a status update documenting the repair, finish the job, resolve.
  update vendor_job
  set completed_date = date '2026-11-02', final_cost = 175.00
  where job_id = new_job_id;

  insert into status_update (request_id, author_id, note_text, new_status)
  values (new_request_id, (select person_id from person where full_name = 'Marcus Hill'),
          'CoolAir rebalanced the vents; temperature normal.', 'Resolved');

  update maintenance_request set status = 'Resolved' where request_id = new_request_id;

  -- Checks
  select status into final_status from maintenance_request where request_id = new_request_id;
  if final_status <> 'Resolved' then
    raise exception 'Part A failed: expected Resolved, got %', final_status;
  end if;

  if (select date_resolved from maintenance_request where request_id = new_request_id) is null then
    raise exception 'Part A failed: date_resolved was not filled in';
  end if;

  select count(*) into update_count from status_update where request_id = new_request_id;
  if update_count <> 3 then
    raise exception 'Part A failed: expected 3 status updates, found %', update_count;
  end if;

  if (select request_id from vendor_job where job_id = new_job_id) <> new_request_id then
    raise exception 'Part A failed: vendor job is not connected to the request';
  end if;

  raise notice 'Part A passed: request %, job %, % status updates', new_request_id, new_job_id, update_count;
end $$;


-- ------------------------------------------------------------
-- PART B: RELATIONSHIPS
-- ------------------------------------------------------------

do $$
begin
  -- One maintenance request can have many status updates.
  if (select count(*) from status_update su
      join maintenance_request r using (request_id)
      where r.title = 'AC not cooling') < 2 then
    raise exception 'Part B failed: a request should have several status updates';
  end if;

  -- One vendor can offer many services ...
  if (select count(*) from vendor_service vs
      join vendor v using (vendor_id)
      where v.vendor_name = 'Metro Climate Services') < 2 then
    raise exception 'Part B failed: a vendor should offer several services';
  end if;

  -- ... and one service can be offered by many vendors.
  if (select count(*) from vendor_service vs
      join service_type s using (service_type_id)
      where s.service_name = 'HVAC') < 2 then
    raise exception 'Part B failed: a service should have several vendors';
  end if;

  -- Vendor jobs connect to the correct requests.
  if not exists (
    select 1 from vendor_job j
    join maintenance_request r using (request_id)
    join vendor v using (vendor_id)
    where v.vendor_name = 'CoolAir Mechanical'
      and r.title = 'AC not cooling'
      and j.job_description = 'Diagnose and repair AC not cooling in the Main Hall'
  ) then
    raise exception 'Part B failed: the scenario job is not linked to the AC request';
  end if;

  -- Deliveries connect to the job they were ordered for.
  if not exists (
    select 1 from delivery d
    join vendor_job j using (job_id)
    join maintenance_request r using (request_id)
    where d.item_description = 'Replacement capacitor' and r.title = 'AC not cooling'
  ) then
    raise exception 'Part B failed: the capacitor delivery is not linked to the AC repair';
  end if;

  raise notice 'Part B passed: relationships are connected correctly';
end $$;


-- ------------------------------------------------------------
-- PART C: RULES THE DATABASE ENFORCES
-- ------------------------------------------------------------
-- Each block tries something that breaks a rule and expects an error.

do $$
declare
  test_request_id int;
  rules_checked   int := 0;
begin
  select request_id into test_request_id
  from maintenance_request where title = 'Flickering ceiling light';

  -- Rule 1: a request must have a title.
  begin
    insert into maintenance_request (room_id, category_id, reported_by_id, title, description, urgency)
    values (1, 1, 1, '  ', 'blank title', 'Low');
    raise exception 'FAILED: Rule 1 was not enforced';
  exception when check_violation then rules_checked := rules_checked + 1;
  end;

  -- Rule 2: cannot move past Reported without an assigned person.
  begin
    update maintenance_request set status = 'Assigned' where request_id = test_request_id;
    raise exception 'FAILED: Rule 2 (assigned person) was not enforced';
  exception when check_violation then rules_checked := rules_checked + 1;
  end;

  -- Rule 2: the assigned person must be Staff.
  begin
    update maintenance_request
    set assigned_to_id = (select person_id from person where full_name = 'Priya Shah'), status = 'Assigned'
    where request_id = test_request_id;
    raise exception 'FAILED: Rule 2 (staff only) was not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Rule 2%' then raise; end if;
    rules_checked := rules_checked + 1;
  end;

  -- Rule 3: status can only move forward.
  begin
    update maintenance_request set status = 'Reported' where title = 'AC not cooling';
    raise exception 'FAILED: Rule 3 was not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Rule 3%' then raise; end if;
    rules_checked := rules_checked + 1;
  end;

  -- Rule 4: cannot resolve while a vendor job is unfinished.
  begin
    update maintenance_request set status = 'Resolved' where title = 'Projector will not turn on';
    raise exception 'FAILED: Rule 4 was not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Rule 4%' then raise; end if;
    rules_checked := rules_checked + 1;
  end;

  -- Rule 6: names must be unique.
  begin
    insert into room (room_name, floor) values ('Main Hall', '1');
    raise exception 'FAILED: Rule 6 was not enforced';
  exception when unique_violation then rules_checked := rules_checked + 1;
  end;

  -- Rule 7: a vendor job must point to a real request.
  begin
    insert into vendor_job (vendor_id, request_id, job_description) values (1, 999999, 'No such request');
    raise exception 'FAILED: Rule 7 was not enforced';
  exception when foreign_key_violation then rules_checked := rules_checked + 1;
  end;

  -- Rule 8: a Received delivery needs a date and a signer.
  begin
    update delivery set status = 'Received' where item_description = 'Projector lamp';
    raise exception 'FAILED: Rule 8 was not enforced';
  exception when check_violation then rules_checked := rules_checked + 1;
  end;

  -- Rule 9: inactive vendors cannot get new jobs.
  begin
    insert into vendor_job (vendor_id, request_id, job_description)
    values ((select vendor_id from vendor where vendor_name = 'Sparkle Cleaning Co.'),
            test_request_id, 'Should be refused');
    raise exception 'FAILED: Rule 9 was not enforced';
  exception when raise_exception then
    if sqlerrm not like 'Rule 9%' then raise; end if;
    rules_checked := rules_checked + 1;
  end;

  -- Rule 10: costs cannot be negative.
  begin
    update vendor_job set final_cost = -5 where job_description = 'Replace Gallery window outlet';
    raise exception 'FAILED: Rule 10 was not enforced';
  exception when check_violation then rules_checked := rules_checked + 1;
  end;

  -- History: status updates cannot be edited.
  begin
    update status_update set note_text = 'rewritten history';
    raise exception 'FAILED: status history was editable';
  exception when raise_exception then
    if sqlerrm not like 'Status updates are permanent%' then raise; end if;
    rules_checked := rules_checked + 1;
  end;

  raise notice 'Part C passed: % rule checks refused bad data', rules_checked;
end $$;


-- Undo everything this test created.
rollback;
