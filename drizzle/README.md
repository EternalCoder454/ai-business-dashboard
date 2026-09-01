# Migrations

`0000_init.sql` replaces the sixteen migrations that came before it.

Those sixteen built a schema scoped by `user_email`, where one account and one
workspace were the same thing. Moving to `workspace_id` renames the scope key on
every table and changes every primary key with it, which is not something to
express as a diff when the only data in the database is one workspace nobody
minds losing. So the history was collapsed and regenerated: this file is the
whole schema, as a set of `CREATE TABLE` statements and nothing else.

## Applying it

It creates and never drops, so the old schema has to go first. **This destroys
every row.** That was the explicit decision; do not run it against a database
holding anything you want.

```bash
psql "$DATABASE_URL_UNPOOLED" -c 'drop schema public cascade; create schema public;'
npm run db:migrate
```

The `drizzle.__drizzle_migrations` table records which files have run. Dropping
`public` leaves it behind, still claiming the old sixteen were applied, so it
has to go too or `db:migrate` will skip `0000_init`:

```bash
psql "$DATABASE_URL_UNPOOLED" -c 'drop schema drizzle cascade;'
```

## Afterwards

The database has no workspaces and no access rows, so nobody can sign in except
an address in `ALLOWED_EMAILS`. That is deliberate: the environment list is the
escape hatch, and the first sign-in from one of those addresses provisions a
workspace and makes that person its admin. Everyone else is invited from Admin
into a workspace that already exists.
