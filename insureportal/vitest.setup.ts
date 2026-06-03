import { vi } from "vitest";

// Mock database connection for unit tests
vi.mock("./server/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

// Mock Redis for tests
vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
    hget: vi.fn().mockResolvedValue(null),
    hset: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(-1),
    ping: vi.fn().mockResolvedValue("PONG"),
    quit: vi.fn().mockResolvedValue("OK"),
  })),
}));

// Mock Kafka for tests
vi.mock("kafkajs", () => ({
  Kafka: vi.fn().mockImplementation(() => ({
    producer: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue([{ topicName: "test", partition: 0, errorCode: 0 }]),
      disconnect: vi.fn().mockResolvedValue(undefined),
    }),
    consumer: vi.fn().mockReturnValue({
      connect: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
    }),
  })),
}));

// Global test environment setup
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/insureportal_test";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.KAFKA_BROKERS = "localhost:9092";
