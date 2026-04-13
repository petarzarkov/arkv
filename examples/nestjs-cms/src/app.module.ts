import {
  Module,
  type NestModule,
  type MiddlewareConsumer,
} from '@nestjs/common';
import { NestJsCmsModule } from '@arkv/nestjs-cms';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { PostsModule } from './posts/posts.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { LoggingMiddleware } from './common/logging.middleware.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    PostsModule,
    CategoriesModule,
    NestJsCmsModule.forRoot({ title: 'CMS Demo', apiPrefix: '/api' }),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(LoggingMiddleware).forRoutes('*path');
  }
}
