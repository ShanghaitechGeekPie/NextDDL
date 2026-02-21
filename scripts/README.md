# Local Postgres Init

Start local Postgres:

```
docker compose up -d db
```

If the database already exists and you want to re-run init.sql:

```
docker compose down -v
```
Then start again:

```
docker compose up -d db
```
