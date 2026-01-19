# Salesforce wiring checklist (snapshot → Heroku)

Heroku is a **read model** + vote collector. Salesforce remains the **authoritative state machine**.

## 1) Where to send snapshots

- Endpoint: `POST /api/sf/ingest-state`
- Header: `X-Relay-Secret: <SF_RELAY_SECRET>`
- Body: a single JSON snapshot representing the current public state.

Salesforce should POST a new snapshot whenever contest/showdown state changes (or when any data shown to the audience changes).

## 2) What the snapshot must contain (minimum)

### Always (all screens)

- `contest`
  - `Id`
  - `Name`
  - `Status__c` (contest lifecycle state)
  - `Current_Round__c` (string shown in header)
  - `Judging_Model__c` (used to hide audience totals for Judges Only)
  - `Judge_Panel_Size__c` (used to describe expected judge panel size)
  - `Results_Visibility__c` (used to optionally show winners)
  - `Active_Showdown__c` (when a showdown is active)

### PAIRING_READY (Round Roster)

- `pairings`: list of couples; each item must include:
  - `Id`
  - `Contest__c`
  - either:
    - `leadName` and `followName` (recommended), or
    - enough data for the server to populate `sf_couple.lead_name` / `sf_couple.follow_name`.

### BRACKET_BUILD / BRACKET_LOCKED / ROUND_ACTIVE / CONTEST_COMPLETE

- `bracket`: list of showdowns (all rounds desired; at least Round 1)
  - `Id`
  - `Contest__c`
  - `Name` (used as the match label if a dedicated match number field is not provided)
  - `Status__c`
  - `Round__c`
  - `Red_Couple__c` / `Blue_Couple__c`
  - `Winner__c` (when known)
  - `Red_Audience_Votes__c` / `Blue_Audience_Votes__c` (when revealing audience totals)

### Active showdown detail (ROUND_ACTIVE when a showdown is active)

- `activeShowdown`: a single showdown object with the same fields as the `bracket` items, plus (when applicable):
  - judges breakdown for `JUDGES_RESULT_REVEALED`:
    - recommended: `activeShowdown.judges` = array of `{ seat, name, choice }` where `choice` is `RED`/`BLUE`.

## 3) Platform events / forwarder hookup

- If you already emit `Contest_State_Changed__e`, keep it as the trigger.
- The snapshot builder should run in the same place you currently relay forwarder events (often a Queueable/Async that already talks to Heroku).
- Ensure the builder has access to:
  - contest header fields
  - all couples (pairings)
  - all showdowns needed for the bracket
  - active showdown + judges/audience totals + winner

## 4) Notes / gaps

- The UI currently uses `Showdown__c.Name` as the match label.
- If you have a dedicated match number field, provide its exact API name and include it in the snapshot so the UI can show `Match <number>`.
