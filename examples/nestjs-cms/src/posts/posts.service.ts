import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, gt, asc } from 'drizzle-orm';
import { DB_TOKEN, type AppDb } from '../database/database.module.js';
import { posts } from '../database/schema.js';
import type { CreatePostDto, UpdatePostDto } from './dto/post.dto.js';

@Injectable()
export class PostsService {
  constructor(@Inject(DB_TOKEN) private readonly db: AppDb) {}

  async findAll(cursor: number | undefined, limit: number) {
    const query = this.db
      .select()
      .from(posts)
      .orderBy(asc(posts.id))
      .limit(limit);
    const data =
      cursor !== undefined
        ? await query.where(gt(posts.id, cursor))
        : await query;
    const nextCursor =
      data.length === limit ? (data[data.length - 1]?.id ?? null) : null;
    return { data, nextCursor };
  }

  async findOne(id: number) {
    const [post] = await this.db.select().from(posts).where(eq(posts.id, id));
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  async create(dto: CreatePostDto) {
    const [created] = await this.db
      .insert(posts)
      .values({
        title: dto.title,
        content: dto.content ?? '',
        published: dto.published ?? false,
        authorId: dto.authorId,
        metadata: dto.metadata ?? null,
      })
      .returning();
    return created;
  }

  async update(id: number, dto: UpdatePostDto) {
    const updates: Partial<typeof posts.$inferInsert> = {};
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.content !== undefined) updates.content = dto.content;
    if (dto.published !== undefined) updates.published = dto.published;
    if (dto.authorId !== undefined) updates.authorId = dto.authorId;
    if (dto.metadata !== undefined) updates.metadata = dto.metadata ?? null;

    const [updated] = await this.db
      .update(posts)
      .set(updates)
      .where(eq(posts.id, id))
      .returning();
    if (!updated) throw new NotFoundException(`Post ${id} not found`);
    return updated;
  }

  async remove(id: number) {
    await this.db.delete(posts).where(eq(posts.id, id));
  }
}
