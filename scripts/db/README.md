# DB scripts

These scripts run Prisma commands against the database specified by `DATABASE_URL`, using the repo schema at `./prisma/schema.prisma`.

## Check migration status (remote/prod safe)

```bash
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?schema=public" \
  pnpm db:status
```

## Apply migrations (remote/prod safe)

```bash
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?schema=public" \
  pnpm db:deploy
```

## Notes

- `pnpm db:migrate` runs `prisma migrate dev` (development/local).
- You may need to mark scripts as executable:
  - `chmod +x scripts/db/*.sh`

