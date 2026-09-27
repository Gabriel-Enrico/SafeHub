import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('A variável DATABASE_URL não foi definida.');
}

export const database = new Pool({
  connectionString,
  max: 10,
});

database.on('error', (error) => {
  console.error('Erro inesperado no pool do PostgreSQL:', error);
});
