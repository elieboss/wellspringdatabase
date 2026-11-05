// Runs the SQL files in database/ against an in-memory PostgreSQL
// (PGlite) so the schema, sample data, Assignment 4 tests and
// Assignment 5 operations are checked automatically with `npm test`.

const test = require('node:test');
const assert = require('node:assert/strict');
const { connect } = require('../db.cjs');
const fs = require('node:fs');
const path = require('node:path');

function readSql(fileName) {
  return fs.readFileSync(path.join(__dirname, '..', 'database', fileName), 'utf8');
}

test('schema and sample data load', async function () {
  const db = await connect('local');

  const counts = await db.query(`
    select (select count(*) from maintenance_request)::int as requests,
           (select count(*) from status_update)::int as updates,
           (select count(*) from vendor_job)::int as jobs,
           (select count(*) from delivery)::int as deliveries`);

  assert.deepEqual(counts[0], { requests: 9, updates: 33, jobs: 6, deliveries: 6 });
  await db.close();
});

test('sample data covers every status and workflow situation', async function () {
  const db = await connect('local');
  const values = async function (sql) {
    return (await db.query(sql)).map(function (row) { return row.v; }).sort();
  };

  assert.deepEqual(await values('select distinct status as v from maintenance_request'),
    ['Assigned', 'In Progress', 'Reported', 'Resolved']);
  assert.deepEqual(await values('select distinct urgency as v from maintenance_request'),
    ['High', 'Low', 'Medium', 'Urgent']);
  assert.deepEqual(await values('select distinct status as v from delivery'),
    ['Cancelled', 'Ordered', 'Received']);
  assert.deepEqual(await values('select distinct person_type as v from person'),
    ['Board', 'Staff', 'Volunteer']);

  // Every person takes part in the workflow somehow.
  const idle = await db.query(`
    select full_name from person p
    where not exists (select 1 from maintenance_request where p.person_id in (reported_by_id, assigned_to_id))
      and not exists (select 1 from status_update where author_id = p.person_id)
      and not exists (select 1 from delivery where received_by_id = p.person_id)`);
  assert.deepEqual(idle, []);

  const situations = (await db.query(`
    select
      exists (select 1 from delivery where job_id is null) as stock_delivery,
      exists (select 1 from delivery where date_received > date_expected) as late_delivery,
      exists (select 1 from delivery where date_received <= date_expected) as on_time_delivery,
      exists (select 1 from room where not is_active) as closed_room,
      exists (select 1 from vendor where not is_active) as inactive_vendor,
      exists (select 1 from vendor_job where completed_date is null) as unfinished_job,
      exists (select 1 from maintenance_request r where status = 'Resolved'
              and not exists (select 1 from vendor_job j where j.request_id = r.request_id)) as fixed_without_vendor,
      exists (select 1 from status_update where new_status is null) as plain_note`))[0];
  for (const [name, present] of Object.entries(situations)) {
    assert.ok(present, `sample data should include: ${name}`);
  }
  await db.close();
});

test('workflow-test.sql passes every check (Assignment 4)', async function () {
  const db = await connect('local');

  // The script raises an error if any check fails.
  await db.exec(readSql('workflow-test.sql'));

  // It rolls back, so the sample data is unchanged afterwards.
  const rows = await db.query("select count(*)::int as n from maintenance_request where title like 'TEST:%'");
  assert.equal(rows[0].n, 0);
  await db.close();
});

test('operations.sql Ops 1-13 give the documented results and Op 14 is refused (Assignment 5)', async function () {
  const db = await connect('local');
  const [ops, op14] = readSql('operations.sql').split(/(?=^-- -+\n-- Op 14:)/m);
  const results = await db.exec(ops);
  const rowsOf = function (columnName) {
    return results.find(function (result) {
      return result.fields.some(function (field) { return field.name === columnName; });
    }).rows;
  };

  // Op 1 and Op 2: the new request and its vendor job.
  assert.equal(rowsOf('first_update_id')[0].title, 'Dishwasher leaking');
  assert.equal(rowsOf('scheduled_date')[0].job_description, 'Repair leaking dishwasher connection');

  // Op 3: four unresolved requests, two unassigned.
  const unresolved = rowsOf('assigned_to');
  assert.equal(unresolved.length, 4);
  assert.equal(unresolved.filter((r) => r.assigned_to === null).length, 2);

  // Op 8: history keeps the old status, in order, even when both rows share a timestamp.
  assert.deepEqual(rowsOf('written_by').map((r) => r.new_status), ['Reported', 'Assigned']);

  // Op 10: late deliveries, worst first.
  assert.deepEqual(rowsOf('days_late').map((r) => [r.item_description, r.days_late]), [
    ['Projector lamp', 10], ['Pipe fittings', 3], ['Replacement capacitor', 1]
  ]);

  // Op 11 and Op 12: aggregates.
  const kitchen = rowsOf('open_requests').find((r) => r.room_name === 'Kitchen');
  assert.equal(Number(kitchen.open_requests), 2);
  assert.equal(rowsOf('delivery_cost')[0].vendor_name, 'CoolAir Mechanical');
  assert.equal(Number(rowsOf('delivery_cost')[0].total_cost), 1080);

  // Op 14: deleting a vendor is refused, and the vendor is kept.
  await assert.rejects(db.exec(op14), /Rule 9: vendors are never deleted/);
  const metro = await db.query("select is_active from vendor where vendor_name = 'Metro Climate Services'");
  assert.deepEqual(metro, [{ is_active: false }]);
  await db.close();
});

test('a failing check in workflow-test.sql is reported', async function () {
  const db = await connect('local');

  // Remove a rule, then confirm the test script notices.
  await db.exec('alter table room drop constraint room_room_name_key');
  await assert.rejects(db.exec(readSql('workflow-test.sql')), /FAILED: Rule 6/);
  await db.close();
});
