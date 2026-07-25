// Package services — database interface for testability.
//
// DBQuerier abstracts the pgxpool.Pool methods used by ENairaService,
// allowing pgxmock.PgxPoolIface to be injected in tests.
package services

import (
	"context"

	pgx "github.com/jackc/pgx/v5"
	pgconn "github.com/jackc/pgx/v5/pgconn"
)

// DBQuerier is the minimal interface over pgxpool.Pool that ENairaService needs.
// pgxmock.PgxPoolIface satisfies this interface, enabling mock injection in tests.
type DBQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...interface{}) pgx.Row
	Exec(ctx context.Context, sql string, args ...interface{}) (pgconn.CommandTag, error)
}
