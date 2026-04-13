import {
  Injectable,
  Inject,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { eq, count } from 'drizzle-orm';
import { DB_TOKEN, type AppDb } from '../database/database.module.js';
import { users } from '../database/schema.js';
import type { CreateUserDto, UpdateUserDto } from './dto/user.dto.js';

@Injectable()
export class UsersService {
  constructor(@Inject(DB_TOKEN) private readonly db: AppDb) {}

  async findAll(page: number, limit: number) {
    const offset = (page - 1) * limit;
    const [{ total }] = await this.db.select({ total: count() }).from(users);
    const data = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .limit(limit)
      .offset(offset);
    return { data, total };
  }

  async findOne(id: number) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id));
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(dto: CreateUserDto) {
    const hashed = await Bun.password.hash(dto.password, {
      algorithm: 'bcrypt',
      cost: 10,
    });
    try {
      const [created] = await this.db
        .insert(users)
        .values({
          email: dto.email,
          name: dto.name,
          password: hashed,
          role: dto.role ?? 'user',
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          createdAt: users.createdAt,
        });
      return created;
    } catch {
      throw new ConflictException('Email already in use');
    }
  }

  async update(id: number, dto: UpdateUserDto) {
    const updates: Partial<typeof users.$inferInsert> = {};
    if (dto.email) updates.email = dto.email;
    if (dto.name) updates.name = dto.name;
    if (dto.role) updates.role = dto.role;
    if (dto.password) {
      updates.password = await Bun.password.hash(dto.password, {
        algorithm: 'bcrypt',
        cost: 10,
      });
    }

    const [updated] = await this.db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      });
    if (!updated) throw new NotFoundException(`User ${id} not found`);
    return updated;
  }

  async remove(id: number) {
    await this.db.delete(users).where(eq(users.id, id));
  }
}
