import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, count } from 'drizzle-orm';
import { DB_TOKEN, type AppDb } from '../database/database.module.js';
import { categories } from '../database/schema.js';
import type {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/category.dto.js';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB_TOKEN) private readonly db: AppDb) {}

  async findAll(offset: number, limit: number) {
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(categories);
    const data = await this.db
      .select()
      .from(categories)
      .limit(limit)
      .offset(offset);
    return { data, total };
  }

  async findOne(id: number) {
    const [category] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    if (!category) throw new NotFoundException(`Category ${id} not found`);
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const [created] = await this.db
      .insert(categories)
      .values({ name: dto.name })
      .returning();
    return created;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const updates: Partial<typeof categories.$inferInsert> = {};
    if (dto.name !== undefined) updates.name = dto.name;

    const [updated] = await this.db
      .update(categories)
      .set(updates)
      .where(eq(categories.id, id))
      .returning();
    if (!updated) throw new NotFoundException(`Category ${id} not found`);
    return updated;
  }

  async remove(id: number) {
    await this.db.delete(categories).where(eq(categories.id, id));
  }
}
