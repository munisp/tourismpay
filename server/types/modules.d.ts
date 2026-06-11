declare module "socket.io" {
  import { Server as HttpServer } from "http";
  export class Server {
    constructor(httpServer?: HttpServer, opts?: Record<string, unknown>);
    on(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    to(room: string): { emit(event: string, ...args: any[]): void };
    of(namespace: string): Server;
    use(fn: (socket: Socket, next: (err?: Error) => void) => void): void;
    close(): void;
    sockets: Map<string, Socket>;
  }
  export interface Socket {
    id: string;
    on(event: string, callback: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    join(room: string): void;
    leave(room: string): void;
    disconnect(close?: boolean): void;
    handshake: {
      query: Record<string, string>;
      headers: Record<string, string>;
      auth: Record<string, string>;
    };
  }
  export type { Server, Socket };
}

declare module "kafkajs" {
  export enum CompressionTypes {
    None = 0,
    GZIP = 1,
    Snappy = 2,
    LZ4 = 3,
    ZSTD = 4,
  }
  export const logLevel: {
    NOTHING: 0;
    ERROR: 1;
    WARN: 2;
    INFO: 4;
    DEBUG: 5;
  };
  export interface KafkaConfig {
    clientId?: string;
    brokers: string[];
    ssl?: boolean;
    sasl?: Record<string, unknown>;
    retry?: Record<string, unknown>;
    logLevel?: number;
    connectionTimeout?: number;
    requestTimeout?: number;
  }
  export interface KafkaMessage {
    key?: Buffer | string | null;
    value: Buffer | string | null;
    headers?: Record<string, Buffer | string>;
    timestamp?: string;
    offset?: string;
  }
  export interface ProducerRecord {
    topic: string;
    messages: Array<{ key?: string; value: string; headers?: Record<string, string> }>;
    compression?: CompressionTypes;
  }
  export interface ConsumerConfig {
    groupId: string;
    sessionTimeout?: number;
    heartbeatInterval?: number;
    maxBytesPerPartition?: number;
  }
  export interface EachMessagePayload {
    topic: string;
    partition: number;
    message: KafkaMessage;
    heartbeat(): Promise<void>;
  }
  export class Kafka {
    constructor(config: KafkaConfig);
    producer(config?: Record<string, unknown>): Producer;
    consumer(config: ConsumerConfig): Consumer;
    admin(): Admin;
  }
  export interface Producer {
    connect(): Promise<void>;
    send(record: ProducerRecord): Promise<void>;
    disconnect(): Promise<void>;
  }
  export interface Consumer {
    connect(): Promise<void>;
    subscribe(opts: { topic?: string; topics?: string[]; fromBeginning?: boolean }): Promise<void>;
    run(opts: { eachMessage: (payload: EachMessagePayload) => Promise<void>; autoCommit?: boolean }): Promise<void>;
    commitOffsets(offsets: Array<{ topic: string; partition: number; offset: string }>): Promise<void>;
    disconnect(): Promise<void>;
  }
  export interface Admin {
    connect(): Promise<void>;
    listTopics(): Promise<string[]>;
    disconnect(): Promise<void>;
  }
}

declare module "@temporalio/client" {
  export class Connection {
    static connect(opts?: Record<string, unknown>): Promise<Connection>;
  }
  export class Client {
    constructor(opts?: { connection?: Connection; namespace?: string });
    workflow: WorkflowClient;
    schedule: ScheduleClient;
  }
  export interface WorkflowClient {
    start<T>(workflow: string | ((...args: any[]) => T), opts: Record<string, unknown>): Promise<WorkflowHandle>;
    getHandle(workflowId: string): WorkflowHandle;
  }
  export interface WorkflowHandle {
    result(): Promise<unknown>;
    signal(name: string, ...args: any[]): Promise<void>;
    query(name: string, ...args: any[]): Promise<unknown>;
    describe(): Promise<Record<string, unknown>>;
    terminate(): Promise<void>;
    workflowId: string;
    firstExecutionRunId: string;
  }
  export interface ScheduleClient {
    create(opts: Record<string, unknown>): Promise<unknown>;
    list(): AsyncIterable<unknown>;
  }
  export class WorkflowExecutionAlreadyStartedError extends Error {
    constructor(message: string);
  }
}

declare module "bcryptjs" {
  export function hash(s: string, salt: number | string): Promise<string>;
  export function compare(s: string, hash: string): Promise<boolean>;
  export function genSalt(rounds?: number): Promise<string>;
  export function hashSync(s: string, salt: number | string): string;
  export function compareSync(s: string, hash: string): boolean;
}

declare module "unleash-proxy-client" {
  export class UnleashClient {
    constructor(opts: Record<string, unknown>);
    start(): Promise<void>;
    isEnabled(flag: string, context?: Record<string, unknown>, fallback?: boolean): boolean;
    getVariant(flag: string): { name: string; enabled: boolean; payload?: { type: string; value: string } };
    on(event: string, callback: (...args: any[]) => void): void;
    updateContext(context: Record<string, unknown>): void;
    stop(): void;
  }
}
