// ============================================================
// WELLSPRING — DATABASE CONNECTION
// ============================================================
// Both modes run real PostgreSQL, so the same SQL works in each:
//
//   local    — PGlite, a complete PostgreSQL that runs inside
//              Node. It loads database/schema.sql and seed.sql
//              into memory every time the server starts. Changes
//              disappear when the server stops. No setup needed.
//
//   supabase — the shared Supabase PostgreSQL database, reached
//              with the DATABASE_URL connection string in .env.
//              Run schema.sql and seed.sql there once first.
// ============================================================

const fs = require('node:fs');
const path = require('node:path');

const DATABASE_FOLDER = path.join(__dirname, 'database');


// readSql() loads one of the .sql files in database/.
function readSql(fileName) {
  return fs.readFileSync(path.join(DATABASE_FOLDER, fileName), 'utf8');
}


// connect() returns an object with one method:
//   query(sql, params) -> array of row objects
// Use $1, $2, ... placeholders in sql and pass values in params.
// Placeholders keep user input as data, never as SQL code.
async function connect(mode) {
  if (mode === 'local') {
    const { PGlite } = require('@electric-sql/pglite');
    const db = new PGlite();

    // exec() can run a whole file of statements at once.
    await db.exec(readSql('schema.sql'));
    await db.exec(readSql('seed.sql'));

    return {
      query: async function (sql, params = []) {
        const result = await db.query(sql, params);
        return result.rows;
      },
      exec: function (sql) {
        return db.exec(sql);
      },
      close: function () {
        return db.close();
      }
    };
  }

  if (mode === 'supabase') {
    const { Pool } = require('pg');

    // The connection string belongs on the server, never in app.js.
    if (!process.env.DATABASE_URL) {
      throw new Error('Supabase mode needs DATABASE_URL in .env');
    }

    // A pool keeps a few connections open and reuses them.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    return {
      query: async function (sql, params = []) {
        const result = await pool.query(sql, params);
        return result.rows;
      },
      exec: function (sql) {
        return pool.query(sql);
      },
      close: function () {
        return pool.end();
      }
    };
  }

  throw new Error('DATA_MODE must be local or supabase');
}


module.exports = { connect };
