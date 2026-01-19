# Salesforce Snapshot Wiring (Heroku Audience App)

This document is a **handoff artifact** for the Salesforce dev team to align the end-to-end snapshot contract between Salesforce and the Heroku audience app.

Heroku is a **read model + vote collector**. **Salesforce is the authoritative state machine**.

---

## 1) Trigger points

### ContestTrigger (Contest__c)

Fire the snapshot forwarder when any of these Contest__c fields change:

- `Contest__c.Status__c`
- `Contest__c.Current_Round__c`
- `Contest__c.Active_Showdown__c`
- `Contest__c.Judging_Model__c`
- `Contest__c.Judge_Panel_Size__c`
- `Contest__c.Results_Visibility__c`
- `Contest__c.Event__c`

Recommended trigger events:
- `after insert`, `after update`

### ShowdownTrigger (Showdown__c)

Fire the snapshot forwarder when any of these Showdown__c fields change:

- `Showdown__c.Status__c`
- `Showdown__c.Round__c`
- `Showdown__c.Match_Number__c`
- `Showdown__c.Red_Couple__c`
- `Showdown__c.Blue_Couple__c`
- `Showdown__c.Winner__c`
- `Showdown__c.Vote_Open_Time__c`
- `Showdown__c.Vote_Close_Time__c`
- `Showdown__c.Red_Audience_Votes__c`
- `Showdown__c.Blue_Audience_Votes__c`

Recommended trigger events:
- `after insert`, `after update`

> Note: Pairings/roster rendering depends on Couple data too; if Couple updates can happen independently, they must also cause a snapshot send (via an existing mechanism or an additional trigger).

---

## 2) Builder class

### AudienceSnapshotBuilder.cls

Responsibility:
- Given a `contestId`, produce a **single JSON snapshot** containing:
  - contest header/state
  - pairings/roster
  - bracket (all rounds desired; at least Round 1)
  - active showdown details (if `Contest__c.Active_Showdown__c` is set)

Data sourcing (SOQL):
- Contest header: query Contest__c by Id and select fields listed in the mapping section below.
- Active showdown: if `Active_Showdown__c` is populated, query that Showdown__c.
- Bracket: query Showdown__c rows for the contest.
- Pairings/roster: query Couple__c rows for the contest.

Serialization rules:
- For Contest__c / Showdown__c / Couple__c objects in the payload, serialize using **field API names** (e.g., `Status__c`, `Match_Number__c`).
- Do **not** compute state transitions, timers, or vote windows; the payload is a snapshot of Salesforce state.

---

## 3) Forwarder

### Forwarder (Queueable / async job)

The triggers should enqueue (or publish a platform event consumed by) a forwarder job that:
1) Determines the impacted `contestId`.
2) Calls `AudienceSnapshotBuilder.build(contestId)` to produce the payload.
3) `POST`s the payload to Heroku.

If you already use `Contest_State_Changed__e`, hook the snapshot build/send in the existing forwarder execution path (same queueable/async that currently relays events).

---

## 4) Heroku ingestion endpoint

### URL

`POST https://<your-heroku-app>.herokuapp.com/api/sf/ingest-state`

### Headers

- `Content-Type: application/json`
- `X-Relay-Secret: <SF_RELAY_SECRET>`

Notes:
- `SF_RELAY_SECRET` is stored as a Heroku config var.
- Heroku stores the raw payload (for debugging) and maps fields into normalized Postgres tables.

---

## 5) Payload contract

Top-level JSON object:

```json
{
  "contest": { "Id": "a03...", "Name": "...", "Status__c": "ROUND_ACTIVE" },
  "pairings": [ { "Id": "a04...", "Contest__c": "a03...", "Lead__c": "...", "Follow__c": "..." } ],
  "bracket": [ { "Id": "a07...", "Contest__c": "a03...", "Status__c": "VOTING_OPEN" } ],
  "activeShowdown": { "Id": "a07...", "Contest__c": "a03...", "Status__c": "VOTING_OPEN" }
}
```

Contract rules:
- `contest` is required for Heroku to associate the snapshot to a contest.
- `pairings`, `bracket`, and `activeShowdown` should be present when available; if missing, the audience UI will degrade gracefully.
- **Match number** must be carried as `Showdown__c.Match_Number__c` on each showdown object.
- Do **not** infer/derive match numbers.

Optional (judge breakdown):

```json
{
  "activeShowdown": {
    "Id": "a07...",
    "judges": [
      { "seat": "1", "name": "Judge A", "choice": "RED" }
    ]
  }
}
```

Heroku currently reads `raw.activeShowdown.judges` for the judges breakdown screen.

---

## 6) Field-for-field mapping (from schema)

This section maps Salesforce fields (from the uploaded `*.describe.json`) to payload paths and to Heroku’s Postgres read-model columns.

### Contest__c → payload.contest → Postgres `sf_contest`

| Salesforce field | Payload path | Postgres column |
|---|---|---|
| `Contest__c.Id` | `contest.Id` | `sf_contest.id` |
| `Contest__c.Name` | `contest.Name` | `sf_contest.name` |
| `Contest__c.Status__c` | `contest.Status__c` | `sf_contest.status__c` |
| `Contest__c.Current_Round__c` | `contest.Current_Round__c` | `sf_contest.current_round__c` |
| `Contest__c.Active_Showdown__c` | `contest.Active_Showdown__c` | `sf_contest.active_showdown__c` |
| `Contest__c.Judging_Model__c` | `contest.Judging_Model__c` | `sf_contest.judging_model__c` |
| `Contest__c.Judge_Panel_Size__c` | `contest.Judge_Panel_Size__c` | `sf_contest.judge_panel_size__c` |
| `Contest__c.Results_Visibility__c` | `contest.Results_Visibility__c` | `sf_contest.results_visibility__c` |
| `Contest__c.Event__c` | `contest.Event__c` | `sf_contest.event__c` |

### Showdown__c → payload.activeShowdown / payload.bracket[] → Postgres `sf_showdown`

| Salesforce field | Payload path | Postgres column |
|---|---|---|
| `Showdown__c.Id` | `activeShowdown.Id` / `bracket[i].Id` | `sf_showdown.id` |
| `Showdown__c.Contest__c` | `activeShowdown.Contest__c` / `bracket[i].Contest__c` | `sf_showdown.contest__c` |
| `Showdown__c.Name` | `activeShowdown.Name` / `bracket[i].Name` | `sf_showdown.name` |
| `Showdown__c.Status__c` | `activeShowdown.Status__c` / `bracket[i].Status__c` | `sf_showdown.status__c` |
| `Showdown__c.Round__c` | `activeShowdown.Round__c` / `bracket[i].Round__c` | `sf_showdown.round__c` |
| `Showdown__c.Match_Number__c` | `activeShowdown.Match_Number__c` / `bracket[i].Match_Number__c` | `sf_showdown.match_number__c` |
| `Showdown__c.Vote_Open_Time__c` | `activeShowdown.Vote_Open_Time__c` / `bracket[i].Vote_Open_Time__c` | `sf_showdown.vote_open_time__c` |
| `Showdown__c.Vote_Close_Time__c` | `activeShowdown.Vote_Close_Time__c` / `bracket[i].Vote_Close_Time__c` | `sf_showdown.vote_close_time__c` |
| `Showdown__c.Red_Couple__c` | `activeShowdown.Red_Couple__c` / `bracket[i].Red_Couple__c` | `sf_showdown.red_couple__c` |
| `Showdown__c.Blue_Couple__c` | `activeShowdown.Blue_Couple__c` / `bracket[i].Blue_Couple__c` | `sf_showdown.blue_couple__c` |
| `Showdown__c.Red_Audience_Votes__c` | `activeShowdown.Red_Audience_Votes__c` / `bracket[i].Red_Audience_Votes__c` | `sf_showdown.red_audience_votes__c` |
| `Showdown__c.Blue_Audience_Votes__c` | `activeShowdown.Blue_Audience_Votes__c` / `bracket[i].Blue_Audience_Votes__c` | `sf_showdown.blue_audience_votes__c` |
| `Showdown__c.Winner__c` | `activeShowdown.Winner__c` / `bracket[i].Winner__c` | `sf_showdown.winner__c` |

### Couple__c → payload.pairings[] → Postgres `sf_couple`

| Salesforce field | Payload path | Postgres column |
|---|---|---|
| `Couple__c.Id` | `pairings[i].Id` | `sf_couple.id` |
| `Couple__c.Contest__c` | `pairings[i].Contest__c` | `sf_couple.contest__c` |
| `Couple__c.Lead__c` | `pairings[i].Lead__c` | `sf_couple.lead__c` |
| `Couple__c.Follow__c` | `pairings[i].Follow__c` | `sf_couple.follow__c` |

Name fields (needed by the audience UI):
- There are **no Couple__c name fields** in the uploaded `Couple__c.describe.json`.
- The snapshot must therefore also include either:
  - derived strings on each couple: `pairings[i].leadName` and `pairings[i].followName`, **or**
  - nested related names (e.g., `Lead__r.Name`, `Follow__r.Name`) plus a consistent serialization strategy.

Heroku stores the derived strings into:
- `sf_couple.lead_name`
- `sf_couple.follow_name`

---

## 7) BLOCKED (only if judges breakdown is required from Salesforce fields)

The judges breakdown shown on `JUDGES_RESULT_REVEALED` requires Salesforce object/field API names for judge vote records (seat, judge name, vote choice). Those objects/fields are **not** present in the uploaded describe JSON files.

If you want a field-for-field mapping for judges, provide the describe JSON for the judge vote object(s) used by `BracketDataController.cls` (and any referenced lookup objects used to render judge names/seats).
