import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { SQLITE_SCHEMA_SQL } from './sqlite-init';

export type SqlParam = string | number | boolean | null;

export interface DbExecutor {
  dialect: 'postgres' | 'sqlite';
  query<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParam[]
  ): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: SqlParam[]
  ): Promise<T | null>;
  execute(sql: string, params?: SqlParam[]): Promise<void>;
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
}

interface SqliteStatement {
  all(...params: (string | number | null)[]): Record<string, unknown>[];
  get(...params: (string | number | null)[]): Record<string, unknown> | undefined;
  run(...params: (string | number | null)[]): void;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

function toSqliteParams(params: SqlParam[]): (string | number | null)[] {
  return params.map((p) => {
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function convertPgPlaceholdersToSqlite(sql: string): string {
  return sql.replace(/\$(\d+)/g, '?');
}

class SqliteDbExecutor implements DbExecutor {
  readonly dialect = 'sqlite' as const;
  private inTx = false;

  constructor(private readonly db: SqliteDatabase) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = []
  ): Promise<T[]> {
    const stmt = this.db.prepare(convertPgPlaceholdersToSqlite(sql));
    return stmt.all(...toSqliteParams(params)) as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = []
  ): Promise<T | null> {
    const stmt = this.db.prepare(convertPgPlaceholdersToSqlite(sql));
    const row = stmt.get(...toSqliteParams(params));
    return (row as T | undefined) ?? null;
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<void> {
    const stmt = this.db.prepare(convertPgPlaceholdersToSqlite(sql));
    stmt.run(...toSqliteParams(params));
  }

  async transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    if (this.inTx) {
      return fn(this);
    }
    this.db.exec('BEGIN IMMEDIATE');
    this.inTx = true;
    try {
      const result = await fn(this);
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    } finally {
      this.inTx = false;
    }
  }
}

class PostgresDbExecutor implements DbExecutor {
  readonly dialect = 'postgres' as const;

  constructor(private readonly sqlClient: postgres.Sql) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = []
  ): Promise<T[]> {
    const rows = await this.sqlClient.unsafe(sql, params as never[]);
    return Array.from(rows) as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: SqlParam[] = []
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params: SqlParam[] = []): Promise<void> {
    await this.sqlClient.unsafe(sql, params as never[]);
  }

  async transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    return this.sqlClient.begin(async (txSql) => {
      const txExec = new PostgresDbExecutor(txSql as unknown as postgres.Sql);
      return fn(txExec);
    }) as Promise<T>;
  }
}

let cachedExecutor: DbExecutor | null = null;
let initPromise: Promise<DbExecutor> | null = null;

function createSqliteDatabase(dbPath: string): SqliteDatabase {
  const sqliteModule = process.getBuiltinModule('node:sqlite') as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  if (!sqliteModule?.DatabaseSync) {
    throw new Error('Built-in node:sqlite module is unavailable in this Node runtime.');
  }
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new sqliteModule.DatabaseSync(dbPath);
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SQLITE_SCHEMA_SQL);
  return db;
}

export async function getDb(): Promise<DbExecutor> {
  if (cachedExecutor) return cachedExecutor;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (
      databaseUrl &&
      !databaseUrl.includes('user:password@host') &&
      (databaseUrl.startsWith('postgres://') ||
        databaseUrl.startsWith('postgresql://'))
    ) {
      const pgClient = postgres(databaseUrl, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      const migrationPath = join(
        process.cwd(),
        'db',
        'migrations',
        '0001_init.sql'
      );
      const migrationSql = readFileSync(migrationPath, 'utf8');
      await pgClient.unsafe(migrationSql);
      cachedExecutor = new PostgresDbExecutor(pgClient);
      return cachedExecutor;
    }

    const sqlitePath =
      process.env.RELEASEDOCKET_SQLITE_PATH?.trim() ||
      join(process.cwd(), '.data', 'releasedocket.sqlite');
    const sqliteDb = createSqliteDatabase(sqlitePath);
    cachedExecutor = new SqliteDbExecutor(sqliteDb);
    return cachedExecutor;
  })();

  return initPromise;
}

export function resetDbForTests(dbPath = ':memory:'): DbExecutor {
  const sqliteDb = createSqliteDatabase(dbPath);
  cachedExecutor = new SqliteDbExecutor(sqliteDb);
  initPromise = Promise.resolve(cachedExecutor);
  return cachedExecutor;
}

export function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export function toBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 't';
}

export function toIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toNullableIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
