# Shop list pagination

Customers and Records use shop-scoped Supabase RPCs, with 25 items per request.
Records use an immutable transaction-date/ID cursor; customers use an ID cursor.
The server applies search and filters before paging. The client cancels obsolete
searches, rejects late responses, deduplicates appended pages, and supports retry.
Main lists use FlatList virtualization. Counts with `+` represent loaded items,
not the total shop count.

Startup refresh loads three recent records and the signed-in staff member's
drafts. It does not download all customers, records, or amendments. Customer and
record screens fetch their selected object directly; amendments are restricted
to the selected record. Customer selection and transaction history also page.

Home totals are computed in PostgreSQL from all qualifying records, honoring
latest corrections and voids. Calendar boundaries remain calculated using the
existing Kabul/Solar Hijri or Gregorian settings.

Fingerprint matching still runs locally. Opening the scanner explicitly fetches
enrolled templates in batches of 100 customers; ordinary customer pages omit
templates and audit history. Matching memory therefore still grows with the
enrolled population, but no longer adds that cost to startup or ordinary lists.

## Deployment and verification

`20261008072105_paginated_shop_queries.sql` was applied to project
`pzwwrbhgzqaygwrcxjto`. Deploy this migration before distributing the updated
client. Existing clients remain compatible. Functions are security invoker,
retain table RLS, and check active shop membership.

Local database tests cover 1,251 records, 127 customers, cursor completeness,
literal search wildcards, normalized digits, filters, primary/backup template
pages, corrections, voids, cross-shop denial, revoked membership, and anonymous
denial. Live read-only checks verified page queries against an existing shop
with 10 records and 9 customers, as well as the metrics API. No customer data was
created or modified for the live verification.

TypeScript, lint, 29 focused tests, and the web production export passed. Physical
Android navigation and reader tests were not performed for this change.

The advisor check reported existing unrelated findings: pg_net in public,
disabled leaked-password protection, and three unindexed photo foreign keys.
New indexes may appear as unused until queries accumulate. See
[extension guidance](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), and
[foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

Substring searches still inspect matching shop rows on the database. Monitor
query time as shops grow; pagination bounds network and client memory, rather
than guaranteeing constant database work for every search or aggregate.

## Shop Network

Phone board, directory, connections, and sharing activity return at most 20 items
per request. The share composer uses the same paged connections query. Search is
applied on the server before paging. View more explicitly appends the next page;
scrolling never triggers an automatic fetch. The main lists use FlatList with
bounded render batches, and the displayed count describes loaded results only.

`20261013065014_shop_network_page_size.sql` must be deployed before releasing this
client to enable the 20-row cap and connection search. It preserves existing
authorization and consent checks and leaves admin pagination unchanged. Older
clients can consume the new page size via the returned `next` offset. Until the
migration is deployed, the existing backend remains bounded at 25 rows.

Tests cover 41 entries in each network list, the 20/20/1 page boundaries, exact
final pages, oversized limits, stable activity IDs, filtered and empty results,
and existing consent/revocation behavior. Offset pagination can shift under
concurrent writes; refresh restarts the list and appended IDs are deduplicated.
