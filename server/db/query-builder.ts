/**
 * server/db/query-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Advanced Drizzle ORM query-builder utilities.
 *
 * Features:
 *  • Dynamic WHERE clause builder (type-safe filter objects)
 *  • Cursor-based pagination (keyset pagination — O(1) regardless of offset)
 *  • Offset-based pagination with total count
 *  • Multi-column ORDER BY builder
 *  • Full-text search helper (PostgreSQL tsvector)
 *  • Date-range filter helper
 *  • Soft-delete filter injection
 *  • Query timing / explain wrapper
 *  • Batch chunking helper for large inserts
 */

import {
  and,
  asc,
  desc,
  eq,
  gte,
  gt,
  ilike,
  isNull,
  lte,
  lt,
  ne,
  or,
  sql,
  SQL,
  inArray,
  notInArray,
  isNotNull,
} from "drizzle-orm";
import type { PgColumn, PgTableWithColumns } from "drizzle-orm/pg-core";
import type { DrizzleDb as DB } from "../db.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortDirection = "asc" | "desc";

export interface SortField {
  column: PgColumn;
  direction?: SortDirection;
}

export interface OffsetPage {
  page?: number;
  pageSize?: number;
}

export interface CursorPage {
  cursor?: string; // base64-encoded JSON {col: value}
  limit?: number;
  direction?: SortDirection;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CursorResult<T> {
  data: T[];
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "like"
  | "ilike"
  | "in"
  | "notIn"
  | "isNull"
  | "isNotNull"
  | "between";

export interface FilterCondition {
  column: PgColumn;
  operator: FilterOperator;
  value?: unknown;
  value2?: unknown; // for "between"
}

// ─── Dynamic WHERE Builder ────────────────────────────────────────────────────

/**
 * Build a type-safe AND WHERE clause from an array of filter conditions.
 *
 * @example
 * const where = buildWhere([
 *   { column: users.status, operator: "eq", value: "active" },
 *   { column: users.createdAt, operator: "gte", value: new Date("2024-01-01") },
 * ]);
 */
export function buildWhere(filters: FilterCondition[]): SQL | undefined {
  const clauses: SQL[] = [];

  for (const f of filters) {
    if (f.value === undefined && !["isNull", "isNotNull"].includes(f.operator)) {
      continue; // skip undefined values (optional filters)
    }

    switch (f.operator) {
      case "eq":
        clauses.push(eq(f.column, f.value as any));
        break;
      case "ne":
        clauses.push(ne(f.column, f.value as any));
        break;
      case "gt":
        clauses.push(gt(f.column, f.value as any));
        break;
      case "gte":
        clauses.push(gte(f.column, f.value as any));
        break;
      case "lt":
        clauses.push(lt(f.column, f.value as any));
        break;
      case "lte":
        clauses.push(lte(f.column, f.value as any));
        break;
      case "like":
        clauses.push(sql`${f.column} LIKE ${f.value}`);
        break;
      case "ilike":
        clauses.push(ilike(f.column, f.value as string));
        break;
      case "in":
        if (Array.isArray(f.value) && f.value.length > 0) {
          clauses.push(inArray(f.column, f.value as any[]));
        }
        break;
      case "notIn":
        if (Array.isArray(f.value) && f.value.length > 0) {
          clauses.push(notInArray(f.column, f.value as any[]));
        }
        break;
      case "isNull":
        clauses.push(isNull(f.column));
        break;
      case "isNotNull":
        clauses.push(isNotNull(f.column));
        break;
      case "between":
        if (f.value !== undefined && f.value2 !== undefined) {
          clauses.push(and(gte(f.column, f.value as any), lte(f.column, f.value2 as any))!);
        }
        break;
    }
  }

  return clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * Build an OR WHERE clause from an array of filter conditions.
 */
export function buildOrWhere(filters: FilterCondition[]): SQL | undefined {
  const where = buildWhere(filters);
  if (!where) return undefined;
  // Re-wrap individual conditions in OR
  const clauses = filters
    .filter((f) => f.value !== undefined || ["isNull", "isNotNull"].includes(f.operator))
    .map((f) => buildWhere([f])!)
    .filter(Boolean);
  return clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : or(...clauses);
}

// ─── ORDER BY Builder ────────────────────────────────────────────────────────

/**
 * Build an ORDER BY clause from an array of sort fields.
 *
 * @example
 * const orderBy = buildOrderBy([
 *   { column: users.createdAt, direction: "desc" },
 *   { column: users.id, direction: "asc" },
 * ]);
 */
export function buildOrderBy(sorts: SortField[]): SQL[] {
  return sorts.map((s) =>
    s.direction === "asc" ? asc(s.column) : desc(s.column),
  );
}

// ─── Offset Pagination ────────────────────────────────────────────────────────

/**
 * Compute offset/limit from page/pageSize.
 */
export function pageToOffset(page: number, pageSize: number): { limit: number; offset: number } {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

/**
 * Build a PaginatedResult from raw data + total count.
 */
export function buildPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / pageSize);
  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

// ─── Cursor Pagination ────────────────────────────────────────────────────────

/**
 * Encode a cursor from a row value.
 * @example encodeCursor({ id: 42, createdAt: "2024-01-01T00:00:00Z" })
 */
export function encodeCursor(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/**
 * Decode a cursor string back to its value.
 */
export function decodeCursor(cursor: string): Record<string, unknown> {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error(`Invalid cursor: ${cursor}`);
  }
}

/**
 * Build cursor-based pagination WHERE clause for a single sort column.
 * Assumes the cursor encodes { [columnName]: value }.
 *
 * @example
 * const cursorWhere = buildCursorWhere(users.createdAt, cursor, "desc");
 */
export function buildCursorWhere(
  column: PgColumn,
  cursor: string | undefined,
  direction: SortDirection = "desc",
): SQL | undefined {
  if (!cursor) return undefined;
  const decoded = decodeCursor(cursor);
  const colName = (column as any).name as string;
  const value = decoded[colName];
  if (value === undefined) return undefined;
  return direction === "desc"
    ? lt(column, value as any)
    : gt(column, value as any);
}

/**
 * Build a CursorResult from raw data + cursor column.
 */
export function buildCursorResult<T extends Record<string, unknown>>(
  data: T[],
  cursorColumn: keyof T,
  limit: number,
  direction: SortDirection = "desc",
): CursorResult<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const first = items[0];
  const last = items[items.length - 1];

  const nextCursor =
    hasMore && last ? encodeCursor({ [cursorColumn as string]: last[cursorColumn] }) : null;
  const prevCursor =
    first ? encodeCursor({ [cursorColumn as string]: first[cursorColumn] }) : null;

  return { data: items, nextCursor, prevCursor, hasMore };
}

// ─── Full-Text Search ─────────────────────────────────────────────────────────

/**
 * Build a PostgreSQL full-text search WHERE clause using tsvector.
 *
 * @example
 * const ftsWhere = buildFtsWhere(["name", "description"], "coffee shop");
 */
export function buildFtsWhere(columns: string[], query: string): SQL {
  const tsQuery = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(" & ");

  const vectorExpr = columns
    .map((col) => `to_tsvector('english', coalesce(${col}, ''))`)
    .join(" || ' ' || ");

  return sql`(${sql.raw(vectorExpr)}) @@ to_tsquery('english', ${tsQuery})`;
}

/**
 * Build a simple ILIKE search across multiple columns (OR).
 *
 * @example
 * const ilikeWhere = buildIlikeSearch([users.name, users.email], "john");
 */
export function buildIlikeSearch(columns: PgColumn[], term: string): SQL | undefined {
  if (!term.trim()) return undefined;
  const pattern = `%${term.trim()}%`;
  const clauses = columns.map((col) => ilike(col, pattern));
  return clauses.length === 1 ? clauses[0] : or(...clauses);
}

// ─── Date Range ───────────────────────────────────────────────────────────────

export interface DateRange {
  from?: Date;
  to?: Date;
}

/**
 * Build a date-range WHERE clause for a timestamp column.
 */
export function buildDateRange(column: PgColumn, range: DateRange): SQL | undefined {
  const clauses: SQL[] = [];
  if (range.from) clauses.push(gte(column, range.from as any));
  if (range.to) clauses.push(lte(column, range.to as any));
  return clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * Build a date-range WHERE clause for a bigint (Unix ms) column.
 */
export function buildBigintDateRange(column: PgColumn, range: DateRange): SQL | undefined {
  const clauses: SQL[] = [];
  if (range.from) clauses.push(gte(column, range.from.getTime() as any));
  if (range.to) clauses.push(lte(column, range.to.getTime() as any));
  return clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);
}

/**
 * Build a date-range WHERE clause for an integer (Unix seconds) column.
 */
export function buildUnixDateRange(column: PgColumn, range: DateRange): SQL | undefined {
  const clauses: SQL[] = [];
  if (range.from) clauses.push(gte(column, Math.floor(range.from.getTime() / 1000) as any));
  if (range.to) clauses.push(lte(column, Math.floor(range.to.getTime() / 1000) as any));
  return clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses);
}

// ─── Soft Delete ──────────────────────────────────────────────────────────────

/**
 * Inject a soft-delete filter (deletedAt IS NULL) into an existing WHERE clause.
 */
export function withSoftDelete(
  deletedAtColumn: PgColumn,
  existing?: SQL,
): SQL {
  const notDeleted = isNull(deletedAtColumn);
  return existing ? and(existing, notDeleted)! : notDeleted;
}

// ─── Batch Chunking ───────────────────────────────────────────────────────────

/**
 * Split an array into chunks of `size` for batch inserts.
 *
 * @example
 * for (const chunk of chunkArray(rows, 500)) {
 *   await db.insert(table).values(chunk);
 * }
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Batch-insert rows in chunks, returning all inserted rows.
 */
export async function batchInsert<T extends Record<string, unknown>>(
  db: DB,
  table: PgTableWithColumns<any>,
  rows: T[],
  chunkSize = 500,
): Promise<T[]> {
  if (rows.length === 0) return [];
  const results: T[] = [];
  for (const chunk of chunkArray(rows, chunkSize)) {
    const inserted = await db.insert(table).values(chunk as any).returning();
    results.push(...(inserted as T[]));
  }
  return results;
}

// ─── Query Timer / Explain ────────────────────────────────────────────────────

/**
 * Wrap a query function with timing instrumentation.
 * Logs slow queries (> thresholdMs) to console.warn.
 *
 * @example
 * const result = await timed("findUsers", () => db.select().from(users));
 */
export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
  thresholdMs = 200,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const elapsed = performance.now() - start;
    if (elapsed > thresholdMs) {
      console.warn(`[SLOW QUERY] ${label} took ${elapsed.toFixed(1)}ms (threshold: ${thresholdMs}ms)`);
    }
  }
}

/**
 * Run EXPLAIN ANALYZE on a raw SQL string and return the plan.
 * Useful in development for query optimization.
 */
export async function explainAnalyze(db: DB, rawSql: string): Promise<string[]> {
  const result = await db.execute(sql`EXPLAIN ANALYZE ${sql.raw(rawSql)}`);
  const rows = Array.isArray(result) ? result : (result as any).rows ?? [];
  return (rows as Array<{ "QUERY PLAN": string }>).map((r) => r["QUERY PLAN"]);
}

// ─── Upsert Helper ────────────────────────────────────────────────────────────

/**
 * Generic upsert helper: insert or update on conflict.
 *
 * @example
 * const row = await upsert(db, walletBalances, data, [walletBalances.userId, walletBalances.currency], {
 *   balance: sql`${walletBalances.balance} + ${data.balance}`,
 * });
 */
export async function upsert<T extends Record<string, unknown>>(
  db: DB,
  table: PgTableWithColumns<any>,
  data: T,
  conflictTarget: PgColumn[],
  updateSet: Record<string, unknown>,
): Promise<T> {
  const [row] = await db
    .insert(table)
    .values(data as any)
    .onConflictDoUpdate({ target: conflictTarget, set: updateSet as any })
    .returning();
  return row as T;
}

// ─── Soft-Delete Aware findById ───────────────────────────────────────────────

/**
 * Find a row by primary key, respecting soft-delete (deletedAt IS NULL).
 */
export async function findByIdSoftDelete<T>(
  db: DB,
  table: PgTableWithColumns<any>,
  idColumn: PgColumn,
  id: unknown,
  deletedAtColumn: PgColumn,
): Promise<T | null> {
  const rows = await db
    .select()
    .from(table)
    .where(and(eq(idColumn, id as any), isNull(deletedAtColumn)));
  return (rows[0] as T) ?? null;
}

// ─── Aggregation Helpers ──────────────────────────────────────────────────────

/**
 * Count rows matching an optional WHERE clause.
 */
export async function countWhere(
  db: DB,
  table: PgTableWithColumns<any>,
  where?: SQL,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(where);
  return row?.n ?? 0;
}

/**
 * Check if any row exists matching a WHERE clause.
 */
export async function exists(
  db: DB,
  table: PgTableWithColumns<any>,
  where: SQL,
): Promise<boolean> {
  const [row] = await db
    .select({ found: sql<boolean>`true` })
    .from(table)
    .where(where)
    .limit(1);
  return !!row?.found;
}
