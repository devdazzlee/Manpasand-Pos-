import Redis from 'ioredis';
import { config } from './app';

const redis = new Redis(config.redisServiceUri, {
  tls: {
    rejectUnauthorized: false,
  },
});

const connectRedis = async () => {
  try {
    await redis.ping();
    console.log('Redis Connected...');
  } catch (err) {
    console.log('Redis connection error:', err);
    process.exit(1);
  }
};

export { redis, connectRedis };
