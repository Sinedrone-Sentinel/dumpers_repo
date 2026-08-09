# BP Dumper shared protocol

Contract for clients that talk to `log-watcher-webhook`:

| Client | Path |
|---|---|
| Native Windows exe (shipped) | `scripts/bp-dumper-go/` |
| Standalone Python (reference / non-Windows) | `scripts/bp-dumper-py/` |
| Store (sandboxed WinUI, parked) | `apps/bp-dumper-store/` |

When this document changes, update the **Go Windows** and **Python** clients (see `.cursor/rules/dumper-dual-client-sync.mdc`).

## Endpoint

- Default webhook URL: site `log-watcher-webhook` Edge Function (configured per deployment).
- Method: `POST` (events), `GET` (sync acquired blueprints list).

## Headers (all requests)

| Header | Value |
|---|---|
| `Authorization` | `Bearer <api_key>` (`dr_…`) |
| `Content-Type` | `application/json` |
| `X-Dumper-Version` | Semver string of the client build (e.g. `1.12.0`) |

Hard version gate: outdated clients may receive **HTTP 426** — client must stop and tell the user to update (Store: Microsoft Store; Python: release/scripts).

## Event types (`POST` JSON `type`)

| `type` | Purpose |
|---|---|
| `blueprint_received` | New unlock from Game.log (`blueprint`, optional `contractDefinitionId`) |
| `session_start` | Watcher connected / log session opened |
| `session_ping` | Idle heartbeat while in PU (~30s); paused when not tracking |
| `game_tracking` | Live tracker: in PU / tracking |
| `game_exit_menu` | Quit to menu |
| `game_quit` | Game closed / log gone |
| `game_crash` | Crash / stale session wait |
| `game_reconnected` | Reconcile after reconnect |
| `missions_update` | Active mission list for Live Tracker (fields per client implementation) |

Additional fields may be present; clients must ignore unknown keys.

### `blueprint_received`

```json
{
  "type": "blueprint_received",
  "blueprint": "<internal_name_or_display>",
  "contractDefinitionId": "<optional>"
}
```

Prefer posting **internal** blueprint names after local lookup resolution.

## Log folder model (differs by client)

| Client | How the folder is chosen |
|---|---|
| Go Windows / Python | Auto-detect / drive scan / path prompt |
| Store | **FolderPicker** once → persist with **FutureAccessList**; user may change folder later |

Both must then:

1. Watch `Game.log` under that folder (tail / rotate).
2. Optionally run one-time full-history import of `*.log` files **under the granted tree only** (Store) or discovered log dirs (Python).
3. Never require CIG server inventory access.

## Fixtures

Golden log snippets for parser tests live in `fixtures/`. Prefer adding a fixture when changing parse rules.
