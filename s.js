import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const sslRejectUnauthorized =
  process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' ? false : true;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'gateway01.us-west-2.prod.aws.tidbcloud.com',
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USERNAME || '3QXFzFQH8TqH9a1.root',
  password: process.env.DB_PASSWORD || 'kd43MhC5v1ipepdJ',
  database: process.env.DB_DATABASE || 'sys',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 5),
  queueLimit: 0,
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: sslRejectUnauthorized,
  },
});

const CREATE_USER_STARTUP_SQL = `
  CREATE TABLE IF NOT EXISTS user_startup (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    uid VARCHAR(128) NOT NULL,
    name VARCHAR(255) NOT NULL,
    tagline VARCHAR(255) NULL,
    domain VARCHAR(255) NULL,
    details_form LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_startup_uid_created (uid, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

let tableInitPromise = null;

export const ensureStartupTable = async () => {
  if (!tableInitPromise) {
    tableInitPromise = pool
      .execute(CREATE_USER_STARTUP_SQL)
      .catch((err) => {
        tableInitPromise = null;
        throw err;
      });
  }
  await tableInitPromise;
};

export const query = async (sql, params = []) => {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('Database Error:', error.message, { code: error.code });
    throw error;
  }
};

export const executeQuery = async (sql, params = []) => {
  const trimmedSql = sql.trim().toUpperCase();
  if (!trimmedSql.startsWith('CREATE TABLE') && sql.includes('user_startup')) {
    await ensureStartupTable();
  }
  return query(sql, params);
};

export const transaction = async (callback) => {
  await ensureStartupTable();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export default pool;
