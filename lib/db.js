import pg from 'pg';

const { Pool } = pg;

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL environment variable is missing');
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  });
}

const globalForDb = globalThis;
export const db = globalForDb.__yksMasterV2Pool || createPool();
db.on('connect', client => { client.query("SET TIME ZONE 'Europe/Istanbul'").catch(()=>{}); });
if (process.env.NODE_ENV !== 'production') globalForDb.__yksMasterV2Pool = db;

export const query = (text, params=[]) => db.query(text, params);
