import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { eq } from 'drizzle-orm';
import { DB_TOKEN, type AppDb } from '../database/database.module.js';
import { users } from '../database/schema.js';

interface JwtPayload {
  sub: number;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(DB_TOKEN) private readonly db: AppDb) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub));
    if (!user) throw new UnauthorizedException();
    const { password: _pw, ...safe } = user;
    return safe;
  }
}
