import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import { DB_TOKEN, type AppDb } from '../database/database.module.js';
import { users } from '../database/schema.js';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_TOKEN) private readonly db: AppDb,
    private readonly jwtService: JwtService,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ access_token: string }> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await Bun.password.verify(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role };
    return { access_token: this.jwtService.sign(payload) };
  }
}
