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
- `SF_RELAY_SECRET` (required for `/api/sf/ingest-state`)

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

3) Seed a test contest + showdown (local only):
```bash
node server/seed.js
```
This prints `{ contestId, showdownId }`.

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

### GET /api/public/state
Returns the public read-model snapshot the phone UI renders.

### POST /api/vote
One vote per user per showdown (repeat calls return `ALREADY_VOTED`).

Voting is only accepted when the current showdown state in the read model is `VOTING_OPEN`.

Request:
```json
{ "userId": "...", "showdownId": "...", "choice": "RED" }
```

Response:
```json
{ "ok": true, "status": "CAST" }
```

If already voted:
```json
{ "ok": true, "status": "ALREADY_VOTED", "existingChoice": "RED" }
```

### POST /api/sf/ingest-state
Ingests a Salesforce-provided snapshot into Postgres.

Headers:
- `X-Relay-Secret: <SF_RELAY_SECRET>`

Body:
- JSON snapshot (stored raw + mapped when possible)

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
curl -sS http://localhost:3000/api/public/state
```

### Ingest snapshot (example)
```bash
curl -sS -X POST http://localhost:3000/api/sf/ingest-state \
  -H 'Content-Type: application/json' \
  -H 'X-Relay-Secret: <SF_RELAY_SECRET>' \
  -d '{"contest":{"Id":"a03...","Name":"My Contest"}}'
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
Creates a local test contest + showdown in the read model.

```bash
SEED_CONTEST_NAME='My Contest' SEED_CURRENT_ROUND='Finals' SEED_SHOWDOWN_STATUS='VOTING_OPEN' node server/seed.js
```

## Screenshots
Run the app and capture on an iPhone-sized viewport:
- Register screen
- Voting screen

