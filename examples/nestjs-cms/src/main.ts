import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestJsCmsModule } from '@arkv/nestjs-cms';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['fatal', 'error', 'warn', 'log'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Swagger — note the x-cms-login-endpoint extension so the CMS knows how to log in
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CMS Demo API')
    .setDescription('Example NestJS app powering @arkv/nestjs-cms')
    .setVersion('1.0')
    .addBearerAuth()
    .addExtension('x-cms-login-endpoint', '/api/auth/login')
    .addExtension('x-cms-token-path', 'access_token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Mount the CMS — default path: /cms
  await NestJsCmsModule.setup(app, document, {
    path: '/cms',
    apiPrefix: '/api',
    title: 'CMS Demo',
    lookups: {
      authorId: { path: '/api/users', labelField: 'name' },
    },
  });

  const port = Number(process.env['PORT'] ?? 3000);
  await app.listen(port);
  logger.log(`App:  http://localhost:${port}/api`);
  logger.log(`Docs: http://localhost:${port}/api/docs`);
}

bootstrap().catch((err: unknown) => {
  new Logger('Bootstrap').error('Bootstrap failed', err);
  process.exit(1);
});
