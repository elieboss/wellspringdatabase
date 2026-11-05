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

test('operations.sql runs every operation and leaves the sample data unchanged (Assignment 5)', async function () {
  const db = await connect('local');
  const results = await db.exec(readSql('operations.sql'));
  const rowsOf = function (columnName) {
    return results.filter(function (result) {
      return result.fields.some(function (field) { return field.name === columnName; });
    }).map(function (result) { return result.rows; });
  };

  // Operation 19: after deactivating Metro Climate, one HVAC vendor is left.
  const [hvac] = rowsOf('contact_name').slice(-1);
  assert.deepEqual(hvac.map((r) => r.vendor_name), ['CoolAir Mechanical']);

  // Operation 21: the projector was resolved and the stage lights added.
  const [byStatus] = rowsOf('requests');
  assert.deepEqual(byStatus.map((r) => [r.status, Number(r.requests)]), [
    ['Reported', 1], ['Assigned', 1], ['In Progress', 1], ['Resolved', 7]
  ]);

  // Operation 22: the repeat problem.
  const [repeats] = rowsOf('times_reported');
  assert.deepEqual(repeats.map((r) => [r.room_name, r.category_name, Number(r.times_reported)]), [['Main Hall', 'HVAC', 4]]);

  // Operation 23: cost per vendor.
  const [costs] = rowsOf('average_job');
  assert.equal(costs[0].vendor_name, 'CoolAir Mechanical');
  assert.equal(Number(costs[0].total_cost), 1080);

  // Operation 25: late deliveries, worst first.
  const [late] = rowsOf('days_late');
  assert.deepEqual(late.map((r) => [r.item_description, r.days_late]), [
    ['Projector lamp', 9], ['Pipe fittings', 3], ['Replacement capacitor', 1]
  ]);

  // The file ends with ROLLBACK, so the original sample data is preserved.
  const [check] = rowsOf('metro_still_active');
  assert.deepEqual(check[0], {
    requests: 9, status_updates: 33, vendor_jobs: 6, deliveries: 6, vendors: 6, metro_still_active: true
  });

  // Running it a second time gives the same answers.
  const again = await db.exec(readSql('operations.sql'));
  assert.deepEqual(again.at(-1).rows, check);
  await db.close();
});

test('a failing check in workflow-test.sql is reported', async function () {
  const db = await connect('local');

  // Remove a rule, then confirm the test script notices.
  await db.exec('alter table room drop constraint room_room_name_key');
  await assert.rejects(db.exec(readSql('workflow-test.sql')), /FAILED: Rule 6/);
  await db.close();
});
