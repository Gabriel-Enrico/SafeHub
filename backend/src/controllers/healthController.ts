import { database } from '../config/database.js';

export async function getHealthStatus() {
  const result = await database.query<{ now: string }>('select now() as now');

  return {
    status: 'OK',
    database: 'connected',
    timestamp: result.rows[0].now,
  };
}
