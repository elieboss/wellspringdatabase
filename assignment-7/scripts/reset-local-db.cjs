// Deletes the local PGlite database folder. The next `npm start`
// recreates it from database/wellspring.sql and accounts.sql.
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'data', 'pgdata');
fs.rmSync(dir, { recursive: true, force: true });
console.log(`Removed ${dir}. Run npm start to recreate it with the sample data.`);
