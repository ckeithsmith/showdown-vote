Showdown Audience Voting App

## Overview
Standalone, mobile-first audience voting web app for a dance contest.

## Requirements
- Node.js 18+
- Postgres (or Heroku Postgres). App uses `DATABASE_URL`.

## Environment Variables
- `DATABASE_URL` (required)
- `PORT` (optional; default `3000`)
- `CORS_ORIGINS` (optional; comma-separated list like `https://showdown-vote.herokuapp.com,https://example.com`)

## Local Development
1) Install deps:
```bash
npm install
npm --prefix client install
```

2) Set env:
```bash
export DATABASE_URL='<your DATABASE_URL>'
```

3) Seed a showdown and set it active:
```bash
node server/seed.js
```
This prints the `showdownId`.

4) Run dev servers (API on `:3000`, UI on `:5173`):
```bash
npm run dev
```

## Production (Heroku)
- Heroku runs `npm install` and `npm start`.
- DB schema is created automatically on boot (idempotent).
- Frontend is built during slug compile via `heroku-postbuild` and served by Express.

## API

### POST /api/register
Registers (or updates) an audience member by email.

Request:
```json
{ "name": "<NAME>", "email": "<EMAIL>" }
```

Response:
```json
{ "userId": "..." }
```

### GET /api/current-showdown
Returns the active matchup.

Response:
```json
{
  "showdownId": "...",
  "red": "Couple A",
  "blue": "Couple B",
  "status": "OPEN"
}
```

If no active showdown is set yet:
```json
{ "showdownId": null, "red": null, "blue": null, "status": "CLOSED" }
```

### POST /api/vote
Idempotent vote (repeat calls overwrite the previous choice for that user+showdown).

Request:
```json
{ "userId": "...", "showdownId": "...", "choice": "RED" }
```

Response:
```json
{ "ok": true }
```

### GET /api/results/:showdownId
Returns vote counts.

Response:
```json
{ "red": 213, "blue": 187 }
```

## Curl Examples

### Register
```bash
curl -sS -X POST http://localhost:3000/api/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"<NAME>","email":"<EMAIL>"}'
```

### Get current showdown
```bash
curl -sS http://localhost:3000/api/current-showdown
```

### Vote
```bash
curl -sS -X POST http://localhost:3000/api/vote \
  -H 'Content-Type: application/json' \
  -d '{"userId":"<USER_ID>","showdownId":"<SHOWDOWN_ID>","choice":"RED"}'
```

### Results
```bash
curl -sS http://localhost:3000/api/results/<SHOWDOWN_ID>
```

## Seed Script
Creates a new showdown and sets it as active.

```bash
SEED_RED='Couple A' SEED_BLUE='Couple B' SEED_STATUS='OPEN' node server/seed.js
```

## Screenshots
Run the app and capture on an iPhone-sized viewport:
- Register screen
- Voting screen

