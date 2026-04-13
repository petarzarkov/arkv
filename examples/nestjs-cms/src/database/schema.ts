import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  password: text('password').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'user'] })
    .notNull()
    .default('user'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
