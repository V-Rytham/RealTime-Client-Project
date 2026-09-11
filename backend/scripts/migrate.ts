import fs from 'fs';
import path from 'path';
import { pool } from '../src/config/db';

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[migrate] schema applied');
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
