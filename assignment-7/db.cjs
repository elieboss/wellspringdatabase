// ============================================================
// WELLSPRING — DATABASE CONNECTION
// ============================================================
// Both modes are real PostgreSQL, so the same SQL runs in each:
//
//   local    — PGlite: a full PostgreSQL that runs inside Node and
//              stores its files in ./data/pgdata. On the first run
//              it loads database/wellspring.sql and accounts.sql.
//              Data stays saved across page reloads AND restarts.
//
//   postgres — your PostgreSQL or Supabase database, reached with
//              DATABASE_URL. Run the two SQL files there first.
// ============================================================

const fs = require('node:fs');
const path = require('node:path');

const SQL_FOLDER = path.join(__dirname, 'database');

function readSql(fileName) {
  return fs.readFileSync(path.join(SQL_FOLDER, fileName), 'utf8');
}

// connect() returns { mode, query(sql, params) -> rows, close() }.
// Always pass user input as $1, $2, ... parameters, never inside the
// SQL text, so it is treated as data and never as SQL code.
async function connect() {
  const mode = process.env.DATA_MODE || 'local';

  if (mode === 'local') {
    const { PGlite } = require('@electric-sql/pglite');
    // PGLITE_DIR=memory:// gives a throwaway database (used by the tests).
    const dataDir = process.env.PGLITE_DIR || path.join(__dirname, 'data', 'pgdata');
    if (!dataDir.startsWith('memory://')) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new PGlite(dataDir);
    await db.waitReady;

    // First run: create the tables and load the sample data.
    const [{ has_person, has_account }] = (await db.query(`
      select to_regclass('public.person') is not null as has_person,
             to_regclass('public.account') is not null as has_account`)).rows;
    if (!has_person) await db.exec(readSql('wellspring.sql'));
    if (!has_account) await db.exec(readSql('accounts.sql'));

    return {
      mode,
      query: async (sql, params = []) => (await db.query(sql, params)).rows,
      close: () => db.close()
    };
  }

  if (mode === 'postgres') {
    const { Pool } = require('pg');
    if (!process.env.DATABASE_URL) {
      throw new Error('DATA_MODE=postgres needs DATABASE_URL in .env');
    }

    const options = { connectionString: process.env.DATABASE_URL };
    if (process.env.DATABASE_CA_CERT) {
      options.ssl = { ca: fs.readFileSync(process.env.DATABASE_CA_CERT, 'utf8') };
    }
    const pool = new Pool(options);

    // Fail early with a clear message if the SQL files were not run.
    const [check] = (await pool.query("select to_regclass('public.account') is not null as ready")).rows;
    if (!check.ready) {
      throw new Error('Database is missing tables: run database/wellspring.sql, then database/accounts.sql');
    }

    return {
      mode,
      query: async (sql, params = []) => (await pool.query(sql, params)).rows,
      close: () => pool.end()
    };
  }

  throw new Error('DATA_MODE must be local or postgres');
}

module.exports = { connect };
