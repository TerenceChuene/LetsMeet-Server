import pino from 'pino';
import { env } from '../../config/env.js';

export const logger = pino({
  name: env.APP_NAME,
  level: env.LOG_LEVEL,
  ...(env.isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

export default logger;
