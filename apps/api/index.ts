import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';

let cachedHandler: any;

async function bootstrap() {
    if (cachedHandler) return cachedHandler;

    const app = await NestFactory.create(AppModule, { logger: false });
    app.enableCors({
        origin: true,
        credentials: true,
    });

    await app.init();

    // Nest usa Express por defecto
    const server = app.getHttpAdapter().getInstance();
    cachedHandler = server;
    return cachedHandler;
}

export default async function handler(req: any, res: any) {
    const server = await bootstrap();
    return server(req, res);
}