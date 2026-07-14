/**
 * drizzle/relations.ts
 *
 * Central re-export of all Drizzle ORM relation definitions.
 *
 * Relations are defined in `schema-improvements.ts` alongside the type exports
 * and additional index/constraint definitions. This file re-exports them so
 * that drizzle-kit and the relational query API (db.query.*) can discover them
 * from a single canonical location.
 *
 * To add a new relation, add it to `schema-improvements.ts` and it will
 * automatically be picked up here.
 */
export * from "./schema-improvements";
