import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'gateway01.us-west-2.prod.aws.tidbcloud.com',
  port: Number(process.env.DB_PORT) || 4000,
  user: process.env.DB_USERNAME || '3QXFzFQH8TqH9a1.root',
  password: process.env.DB_PASSWORD || 'kd43MhC5v1ipepdJ',
  database: process.env.DB_DATABASE || 'sys',
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
});

export const executeQuery = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};
