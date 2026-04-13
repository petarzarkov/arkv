import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt.guard.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [JwtModule],
})
export class AuthModule {}
