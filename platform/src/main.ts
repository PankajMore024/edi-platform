import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Platform entry point. v1 is a modular NestJS monolith; each capability is a module
 * with clean boundaries so it can be extracted to a microservice later without a rewrite.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`EDI platform listening on ${port}`);
}

void bootstrap();
