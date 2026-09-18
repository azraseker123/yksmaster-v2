import pg from 'pg';

const { Pool } = pg;

function createPool() {
  const rawConnectionString =
    process.env.DATABASE_URL;

  if (!rawConnectionString) {
    throw new Error(
      'DATABASE_URL environment variable is missing'
    );
  }

  const url =
    new URL(rawConnectionString);

  url.searchParams.set(
    'sslmode',
    'verify-full'
  );

  const connectionString =
    url.toString();

  return new Pool({
    connectionString,
    max: 4,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000
  });
}

const globalForDb = globalThis;

export const db =
  globalForDb.__yksMasterV2Pool ||
  createPool();

globalForDb.__yksMasterV2Pool = db;

db.on('error', err => {
  console.error(
    'PostgreSQL pool error:',
    err
  );
});

export const query = (
  text,
  params = []
) => {
  return db.query(
    text,
    params
  );
};
