import postgres from 'postgres';

export type Database = ReturnType<typeof postgres>;

export function createDatabase(databaseUrl: string): Database {
  return postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 5,
  });
}

export async function checkDatabase(database: Database): Promise<void> {
  await database`SELECT 1`;
}
