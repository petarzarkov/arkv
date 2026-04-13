import { Module, Global } from '@nestjs/common';
import { Database } from 'bun:sqlite';
import { drizzle, BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import { seed } from 'drizzle-seed';
import * as schema from './schema.js';

export const DB_TOKEN = 'DATABASE';
export type AppDb = BunSQLiteDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    {
      provide: DB_TOKEN,
      useFactory: async (): Promise<AppDb> => {
        const sqlite = new Database(
          process.env['SQLITE_DB_PATH'] ?? ':memory:',
        );
        const db = drizzle(sqlite, { schema });

        sqlite.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            published INTEGER NOT NULL DEFAULT 0,
            author_id INTEGER NOT NULL REFERENCES users(id),
            metadata TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
        `);

        const existing = sqlite.query('SELECT id FROM users LIMIT 1').get();
        if (!existing) {
          await seedDatabase(sqlite, db);
        }

        return db;
      },
    },
  ],
  exports: [DB_TOKEN],
})
export class DatabaseModule {}

async function seedDatabase(sqlite: Database, db: AppDb): Promise<void> {
  // Seed regular users first — drizzle-seed generates explicit ids starting from 1,
  // so the admin is inserted after to avoid a primary key conflict
  const userHash = Bun.password.hashSync('password123', {
    algorithm: 'bcrypt',
    cost: 10,
  });

  // drizzle-seed's types don't accept a schema-typed BunSQLiteDatabase —
  // pass a schema-less instance wrapping the same connection to satisfy the overload
  const dbForSeed = drizzle(sqlite);
  const now = Date.now();
  const pastDates = Array.from({ length: 30 }, (_, i) =>
    new Date(now - i * 24 * 60 * 60 * 1000).toISOString(),
  );

  await seed(dbForSeed, schema).refine((f) => ({
    users: {
      count: 9,
      columns: {
        email: f.email(),
        name: f.fullName(),
        password: f.default({ defaultValue: userHash }),
        role: f.valuesFromArray({ values: ['user', 'admin'] }),
        createdAt: f.valuesFromArray({ values: pastDates }),
      },
      with: {
        posts: [
          { weight: 0.5, count: [2, 3, 4] },
          { weight: 0.4, count: [5, 6, 7] },
          { weight: 0.1, count: [8, 9, 10] },
        ],
      },
    },
    posts: {
      columns: {
        title: f.loremIpsum({ sentencesCount: 1 }),
        content: f.loremIpsum({ sentencesCount: 3 }),
        published: f.boolean(),
        createdAt: f.valuesFromArray({ values: pastDates }),
        metadata: f.valuesFromArray({
          values: [
            JSON.stringify({ views: 42, tags: ['tech', 'news'] }),
            JSON.stringify({ views: 7, featured: true }),
            JSON.stringify({ views: 120, rating: 4.5, tags: ['science'] }),
            undefined,
            undefined,
          ],
        }),
      },
    },
    categories: {
      count: 0,
    },
  }));

  const adminHash = Bun.password.hashSync('admin123', {
    algorithm: 'bcrypt',
    cost: 10,
  });
  await db.insert(schema.users).values({
    email: 'admin@example.com',
    password: adminHash,
    name: 'Admin',
    role: 'admin',
  });

  await db
    .insert(schema.categories)
    .values([
      { name: 'Technology' },
      { name: 'Science' },
      { name: 'Sports' },
      { name: 'Arts' },
      { name: 'Music' },
      { name: 'Travel' },
      { name: 'Food' },
      { name: 'Health' },
      { name: 'Finance' },
      { name: 'Education' },
      { name: 'Politics' },
      { name: 'Environment' },
      { name: 'Entertainment' },
      { name: 'Gaming' },
      { name: 'Fashion' },
      { name: 'Architecture' },
      { name: 'Photography' },
      { name: 'History' },
    ]);
}
