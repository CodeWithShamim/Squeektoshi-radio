> Documentation index: https://docs.squeekchain.com/llms.txt. Use it to find every page.

# API

> Squeekchain HTTP APIs: public measurement, settlement, economy and NFT data, plus authenticated Community Sepolia mint status and authorizations.

Web version: https://docs.squeekchain.com/developers/api/

## TL;DR

- `GET https://api.squeekchain.com/v1/…` serves public measurement and chain data without an API key.
- Authenticated Community endpoints use a bearer session.
- A response can say `"status": "unavailable"` with HTTP 200, which means unknown, not empty or zero.
- Use the API to display and explore. Read the contracts before preparing any transaction.

!!! warning "In active development"

    Validate responses against the published schemas and handle unknown fields.

## Base URL and access

```text
https://api.squeekchain.com
```

Public reads are bodyless `GET` requests under `/v1` and need no API key. Authenticated Community endpoints use a separate origin and a bearer session. Identify Sepolia contracts from the [deployment record](https://docs.squeekchain.com/developers.md#deployments), not an API response.

Call it from a server, script or agent; browsers on any site can call the public reads too (`Access-Control-Allow-Origin: *`, no credentials).

For monitoring, `GET /healthz` answers 200 while the API runs, and `GET /readyz` answers 200 only while its database is reachable.

## Conventions

These conventions apply to public read endpoints; [Community mint](https://docs.squeekchain.com/developers/api.md#community-mint) defines its own request, caching and error rules.

### Numbers and units

Large numbers (IDs, amounts, block numbers and work) are decimal strings. Parse them as `BigInt` or your language's big-integer type, never as floating point. Small values such as levels and speeds are plain JSON integers.

Field names carry their unit, as listed below.

<details markdown="1">
<summary>Field names and units</summary>

| Field | Meaning |
|---|---|
| `…BaseUnits`, `supplyCap` | $SQK with 18 decimals: `1000000000000000000` is 1 $SQK |
| `basePower`, `nftPower`, `sqkPower`, `targetPower` | [Power](https://docs.squeekchain.com/developers/staking.md#account-power) |
| `blockHeight`, `coreBlockHeight`, `height`, `…CompletedBlock`, `nextMergeHeight`, `closedThroughBlock` | Squeek block numbers, not Ethereum blocks |
| `blockProgress`, `cumulativeBlockUnits` | Block units: 1,000,000,000 make one Squeek block |
| `workPerThousandBlocks` | Difficulty: work units needed for 1,000 Squeek blocks; see [SqueekCore](https://docs.squeekchain.com/developers/core.md#state) |
| `cumulativeWork`, `workUnits`, `cumulativeWorkUnits`, `workThreshold` | Wheel work units |
| `…Round`, `roundId` | 600-second rounds counted from the genesis timestamp |
| `ethereumBlockNumber`, `blockNumber`, `chain.…Block` | Ethereum block numbers |
| `…At`, `blockTimestamp` | ISO 8601 times in UTC; `/v1/core` timestamps and mint `deadline` use Unix seconds |
| `date`, `utcDate` | `YYYY-MM-DD` |
| `…Bps` | Basis points, 0–10,000 |
| `…Milli` | Thousandths: `12500` is 12.5 |
| `…Ms`, `…Ns` | Milliseconds, nanoseconds |
| `rpmMilli`, `speedMmPerSecond`, `distanceMm` | Thousandths of a revolution per minute, millimetres per second, millimetres |

</details>

### Chain data

Everything read from Ethereum is pinned 12 blocks behind the chain tip. The `chain` object names the block a response was read at; compare `safeThroughBlock`, not `generatedAt`, to tell whether the chain has moved.

`release` and `deployment` identify the economy contracts a response was read from; `/v1/core` uses `identities`. Check the release, component pins and capability evaluation block against [Deployments](https://docs.squeekchain.com/developers.md#deployments) before relying on a response.

### Availability

Most responses have a `status`. When it's `"unavailable"`, the response carries a `reason` and no data, with HTTP 200; show it as unknown, never as zero or empty. The one exception is the economy overload response described under [Errors](https://docs.squeekchain.com/developers/api.md#errors), which uses HTTP 503.

### Caching

Cloudflare shares responses across callers for the endpoint's `s-maxage`, so faster polling returns the same data. Send an endpoint's `ETag` back unchanged in `If-None-Match`; unchanged content returns 304 with no body and may keep an earlier `generatedAt`. Errors are never shared.

| Endpoint | Shared for | Conditional requests |
|---|---|---|
| [Pipeline status](https://docs.squeekchain.com/developers/api.md#status) | 1 second | Yes |
| [SqueekCore state](https://docs.squeekchain.com/developers/api.md#core), [Event feed](https://docs.squeekchain.com/developers/api.md#events), [Economy state](https://docs.squeekchain.com/developers/api.md#economy-state), [Settlement history](https://docs.squeekchain.com/developers/api.md#settlements) without `range`, an available [Squeek](https://docs.squeekchain.com/developers/api.md#squeek) | 5 seconds | Yes |
| [Measurement statistics](https://docs.squeekchain.com/developers/api.md#measurement-stats), [Settlement history](https://docs.squeekchain.com/developers/api.md#settlements) with a `range` | 60 seconds | Yes |
| [Measurement runs](https://docs.squeekchain.com/developers/api.md#measurement-runs), [Provisional blocks](https://docs.squeekchain.com/developers/api.md#measurement-blocks), [Account](https://docs.squeekchain.com/developers/api.md#account) endpoints, an unavailable [Squeek](https://docs.squeekchain.com/developers/api.md#squeek) | Never stored (`no-store`) | No |

### Pagination

List endpoints return up to `limit` items (1–100) and a `nextCursor`. Pass that opaque value as `cursor` for the next page; `null` marks the last page. Restart from the first page after 400 `invalid_cursor` or 409 `cursor_invalidated`.

| Endpoint | Default `limit` |
|---|---|
| [Event feed](https://docs.squeekchain.com/developers/api.md#events) | 40 |
| [Account](https://docs.squeekchain.com/developers/api.md#account), [Account activity](https://docs.squeekchain.com/developers/api.md#account-activity) | 25 |
| [Measurement runs](https://docs.squeekchain.com/developers/api.md#measurement-runs) | 20 |

### Rate limits

Each IP address has a request budget per endpoint class. Over budget, the API answers 429 with a `Retry-After` header; wait that many seconds before retrying.

| Class | Endpoints | Rate | Burst |
|---|---|---|---|
| `publicFast` | [Pipeline status](https://docs.squeekchain.com/developers/api.md#status), [SqueekCore state](https://docs.squeekchain.com/developers/api.md#core), [Economy state](https://docs.squeekchain.com/developers/api.md#economy-state) | 30 per second | 60 |
| `publicHeavy` | [Measurement statistics](https://docs.squeekchain.com/developers/api.md#measurement-stats), [Settlement history](https://docs.squeekchain.com/developers/api.md#settlements), [Event feed](https://docs.squeekchain.com/developers/api.md#events), [Account](https://docs.squeekchain.com/developers/api.md#account), [Account activity](https://docs.squeekchain.com/developers/api.md#account-activity) | 5 per second | 20 |
| `metadata` | [Squeek](https://docs.squeekchain.com/developers/api.md#squeek) | 20 per second | 40 |
| `observations` | [Measurement runs](https://docs.squeekchain.com/developers/api.md#measurement-runs), [Provisional blocks](https://docs.squeekchain.com/developers/api.md#measurement-blocks) | 2 per second | 4 |

### Headers

| Header | Use |
|---|---|
| `X-Request-Id` | On every response. Send your own (8–128 letters, digits, `.`, `_`, `:` or `-`) to trace a request, and quote it when reporting a problem |
| `ETag` | On status, statistics, settlement history, SqueekCore state, event feed, economy state and available Squeek responses; send it back as `If-None-Match`. See [Caching](https://docs.squeekchain.com/developers/api.md#caching) |
| `Retry-After` | On 429 and 503 responses: seconds to wait before retrying |
| `X-Squeek-Settlement-Source` | On [Settlement history](https://docs.squeekchain.com/developers/api.md#settlements): `live`, `durable-cache` or `unavailable` |
| `X-Squeek-Settlement-Fallback-Reason` | On [Settlement history](https://docs.squeekchain.com/developers/api.md#settlements), only with `durable-cache`: why the cached snapshot was served (`indexer_disabled`, `not_yet_safe`, `indexer_unavailable` or `indexer_mismatch`) |

### Versioning and schemas

Public read paths stay `/v1`, and the response's `schemaVersion` identifies the wire contract: version 4 for events, version 3 for economy state, account, account activity and Squeek. Check it before reading a response. Community mint has its own strict versioned contract and no `schemaVersion` field.

Validate responses against the linked JSON Schemas (draft 2020-12) with the `date`, `date-time` and `uuid` formats enabled. Treat `uint…-decimal` values as unsigned decimal strings. Examples are illustrative and may be shortened; they aren't live state or deployment evidence. When one shows `unavailable`, the field table describes the available response.

## Errors

Public read errors return an HTTP status and `{"error": "<code>"}`, except the economy overload response below. The codes below can come from public endpoints; Community mint has its own [error table](https://docs.squeekchain.com/developers/api.md#community-mint-errors).

| Status | Code | Meaning | What to do |
|---|---|---|---|
| 400 | `invalid_query` | A parameter is missing, malformed, repeated or unknown | Fix the request |
| 404 | `not_found` | No such endpoint | Check the path |
| 429 | `rate_limited` | Over the rate limit | Wait `Retry-After` seconds |
| 503 | `database_busy`, `indexer_busy`, `database_unavailable` | The API is overloaded or a dependency is down | Wait `Retry-After` seconds, then retry with backoff |
| 504 | `request_timeout` | The request took too long | Retry with backoff |
| 500 | `internal_error` | Unexpected server failure | Retry a few times; report the `X-Request-Id` |

Two overload responses look different:

- **`indexer_busy`**: the API is already running its maximum number of Indexer reads. It answers 503 `` with `Retry-After: 2` and `Cache-Control: no-store`.
- **Economy overload**: the Indexer itself is overloaded while serving [economy state](https://docs.squeekchain.com/developers/api.md#economy-state), an [account](https://docs.squeekchain.com/developers/api.md#account), [account activity](https://docs.squeekchain.com/developers/api.md#account-activity) or a [Squeek](https://docs.squeekchain.com/developers/api.md#squeek). The API answers HTTP 503 with `Retry-After: 1`, `Cache-Control: no-store` and an unavailable body in that endpoint's shape, `status: "unavailable"` with `reason: "indexer_unavailable"`, instead of an error code.

Retry both after `Retry-After` seconds. Branch on the HTTP status, not the body alone: the economy overload body matches an ordinary unavailable response.

A response that doesn't parse or doesn't match its schema is an error, not empty data.

## API or contracts?

Use the API, an indexed and confirmation-delayed view, for display, history and exploration. Before preparing a transaction, read the contracts at a block you choose.

| You want to | Use |
|---|---|
| Show whether the wheel is running and how far the next block is | [`/v1/status`](https://docs.squeekchain.com/developers/api.md#status) |
| Chart wheel activity, records and settlement performance | [`/v1/measurement/stats`](https://docs.squeekchain.com/developers/api.md#measurement-stats) |
| Show settled work, block height and difficulty | [`/v1/core`](https://docs.squeekchain.com/developers/api.md#core); for an exact value at a block, [SqueekCore `state()`](https://docs.squeekchain.com/developers/core.md#state) |
| List settlements and $SQK issued per period | [`/v1/settlements`](https://docs.squeekchain.com/developers/api.md#settlements); to rebuild history yourself, [Index events](https://docs.squeekchain.com/developers/index-events.md) |
| Show a feed of what happened | [`/v1/events`](https://docs.squeekchain.com/developers/api.md#events) |
| Show $SQK supply, issuance and staking totals | [`/v1/economy/state`](https://docs.squeekchain.com/developers/api.md#economy-state) |
| Show an account's Squeeks, power and $SQK | [`/v1/accounts/{address}`](https://docs.squeekchain.com/developers/api.md#account) |
| Prepare a rewards claim or merge | The contracts: [Build owner actions](https://docs.squeekchain.com/developers/owner-actions.md). Read current balances and eligibility onchain |
| Show a Squeek's image and traits | [`/v1/squeeks/{tokenId}`](https://docs.squeekchain.com/developers/api.md#squeek); onchain, [`tokenURI`](https://docs.squeekchain.com/developers/nft.md#tokenuri) |

## Measurement and validation

What the WHEELY9000 measured, how the Oracle validated it, and how close the next Squeek block is.
### Pipeline status · GET /v1/status

The whole pipeline's live state in one read: the latest accepted measurement, the block builder's projection, Oracle validation, the settlement queue and the device signer. Poll it to show whether the wheel is turning and how close the next block is.

The endpoint takes no parameters; any query parameter returns 400 `invalid_query`.

**Example request**

```sh
curl -i https://api.squeekchain.com/v1/status
```

**Response**

<details markdown="1">
<summary>Example response</summary>

```json
{
  "schemaVersion": 1,
  "installationId": "example-installation",
  "revision": "U9zQYSMMEt_vtiMrL2LQN7URAlabSL1EfDbQMX9N5XI",
  "generatedAt": "2026-11-04T23:39:11.638Z",
  "measurement": {
    "freshness": "online",
    "observedAt": "2026-11-04T23:39:11.037Z",
    "receivedAt": "2026-11-04T23:39:11.371Z",
    "staleAfterSeconds": 120,
    "counterEpoch": "c011f01a-93ba-45ff-8579-619ddfdf40ec",
    "cumulativeWorkUnits": "26009",
    "provenance": "hardware",
    "coreStatus": "IDLE",
    "rpmMilli": 77005,
    "speedMmPerSecond": 1127,
    "distanceMm": 3455808
  },
  "builder": {
    "status": "available",
    "anchor": {
      "cumulativeWork": "25701",
      "cumulativeBlockUnits": "2366143705150",
      "blockHeight": "2366",
      "blockProgress": "143705150",
      "workPerThousandBlocks": "11005",
      "settledThroughRound": "166",
      "confirmedAt": "2026-11-04T23:30:36.000Z",
      "transactionHash": "0x2222222222222222222222222222222222222222222222222222222222222222"
    },
    "queued": {
      "closedRoundCount": "0",
      "closedWorkUnits": "0",
      "openRoundWorkUnits": "308"
    },
    "projected": {
      "cumulativeWork": "26009",
      "cumulativeBlockUnits": "2394130983659",
      "blockHeight": "2394",
      "blockProgress": "130983659",
      "workPerThousandBlocks": "10894",
      "firstCompletedBlock": "2367",
      "lastCompletedBlock": "2394",
      "completedBlockCount": "28",
      "lifecycle": "optimistic"
    }
  },
  "oracle": {
    "state": "accepted",
    "reason": null,
    "latestAcceptedAt": "2026-11-04T23:39:11.371Z",
    "latestClosure": {
      "firstRound": "166",
      "lastRound": "166",
      "roundCount": "1",
      "acceptedAt": "2026-11-04T23:30:01.352Z"
    }
  },
  "settlementQueue": {
    "status": "available",
    "state": "empty",
    "settlementEnabled": true,
    "reporterEnvironmentEnabled": true,
    "buffered": {
      "firstRound": null,
      "lastRound": null,
      "roundCount": "0",
      "activeRoundCount": "0",
      "workUnits": "0"
    },
    "projected": {
      "cumulativeWork": "25701",
      "cumulativeBlockUnits": "2366143705150",
      "blockHeight": "2366",
      "blockProgress": "143705150",
      "workPerThousandBlocks": "11005",
      "firstCompletedBlock": null,
      "lastCompletedBlock": null,
      "completedBlockCount": "0",
      "lifecycle": "optimistic"
    },
    "incidentOpen": false,
    "blockedReason": null,
    "lastRun": {
      "startedAt": "2026-11-04T23:35:27.357Z",
      "finishedAt": "2026-11-04T23:35:29.617Z",
      "result": "reconciled"
    },
    "latestSubmission": {
      "submissionId": "5c274c6d-b953-450b-9809-4521e5e47255",
      "lifecycle": "confirmed",
      "previousSettledThroughRound": "165",
      "settledThroughRound": "166",
      "roundCount": "1",
      "activeRoundCount": "1",
      "expected": {
        "cumulativeWork": "25701",
        "cumulativeBlockUnits": "2366143705150",
        "blockHeight": "2366",
        "blockProgress": "143705150",
        "workPerThousandBlocks": "11005",
        "firstCompletedBlock": "2311",
        "lastCompletedBlock": "2366",
        "completedBlockCount": "56"
      },
      "transactionHash": "0x2222222222222222222222222222222222222222222222222222222222222222",
      "createdAt": "2026-11-04T23:30:29.114Z",
      "submittedAt": "2026-11-04T23:30:29.114Z",
      "confirmedAt": "2026-11-04T23:35:28.781Z",
      "terminalAt": "2026-11-04T23:35:28.781Z",
      "changedAt": "2026-11-04T23:35:28.781Z",
      "outcomeCode": null
    }
  },
  "signer": {
    "kind": "trust-m",
    "algorithm": "ecdsa-p256-sha256",
    "keySlot": "0xE0F3",
    "enrolledAt": "2026-11-02T16:03:26.750Z",
    "lastVerifiedAt": "2026-11-04T23:39:11.371Z",
    "lastSignature": "CJWxu219/E+Wt0GlIsEBTiuCFZCpcMk5+/KUgro1CZEzYRr1BeeQbCoN9tOfXiXNRzXHcLATz1a1bNLO9bNIoA=="
  },
  "modules": [
    {
      "instanceId": "wheel",
      "moduleType": "wheel.counter",
      "driverId": "usb-rp2040-a3144e-lm393",
      "moduleVersion": "0.2.1",
      "schemaVersion": 1,
      "state": "ready",
      "observedAt": "2026-11-04T23:39:11.037759Z",
      "provenance": "hardware",
      "health": {
        "checkedAt": "2026-11-04T23:39:11.037759Z"
      },
      "data": {}
    }
  ]
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `revision` | `string` | Opaque snapshot revision; the `ETag` is derived from it and from `modules` |
| `measurement` | `object` or `null` | Latest accepted device reading; `null` before the first |
| `measurement.freshness` | `string` | `online`, or `stale` once more than `staleAfterSeconds` (120) have passed since `receivedAt` |
| `measurement.observedAt` | `string` | When the device took the reading |
| `measurement.receivedAt` | `string` | When the API accepted it |
| `measurement.counterEpoch` | `string` | UUID of the device's counter epoch; `cumulativeWorkUnits` counts from its start |
| `measurement.cumulativeWorkUnits` | `string` | Work units counted in this counter epoch |
| `measurement.provenance` | `string` | `hardware`, `simulated`, `replay` or `derived` |
| `measurement.coreStatus` | `string` | Device state: `IDLE`, `ACTIVE` or `COUNTER_FAULT` |
| `measurement.rpmMilli` | `integer` | Wheel speed in thousandths of a revolution per minute |
| `measurement.speedMmPerSecond` | `integer` | Running speed in millimetres per second |
| `measurement.distanceMm` | `integer` | Distance the device reports for its current day, in millimetres |
| `builder.status` | `string` | `available`, or `unavailable` with `builder.reason` |
| `builder.anchor` | `object` | The settled frontier on SqueekCore: `settledThroughRound`, `cumulativeWork`, `blockHeight`, `blockProgress`, `workPerThousandBlocks`, `cumulativeBlockUnits`, and the confirming `transactionHash` and `confirmedAt` |
| `builder.queued` | `object` | Work not yet settled: `closedRoundCount`, `closedWorkUnits` and `openRoundWorkUnits` |
| `builder.projected` | `object` | `lifecycle: "optimistic"`: the frontier if all queued work settles, with `firstCompletedBlock`, `lastCompletedBlock` and `completedBlockCount` |
| `oracle.state` | `string` | `accepted`, `stale`, `blocked` or `unavailable`; `oracle.reason` is null when `accepted` or `stale` and set when `blocked` or `unavailable` |
| `oracle.latestClosure` | `object` or `null` | The latest closed rounds the Oracle accepted: `firstRound`, `lastRound`, `roundCount`, `acceptedAt` |
| `settlementQueue.status` | `string` | `available`, or `unavailable` with `settlementQueue.reason` |
| `settlementQueue.state` | `string` | `disabled`, `empty`, `ready`, `preparing`, `submitted`, `retrying`, `blocked` or `stale` |
| `settlementQueue.buffered` | `object` | Closed rounds waiting to settle: `firstRound`, `lastRound`, `roundCount`, `activeRoundCount`, `workUnits` |
| `settlementQueue.projected` | `object` | The frontier once the buffered rounds settle; same fields as `builder.projected` |
| `settlementQueue.latestSubmission` | `object` or `null` | The latest settlement transaction: `lifecycle` (`preparing`, `submitted`, `retrying`, `confirmed`, `reverted`, `superseded`), round range, `expected` result, `transactionHash`, timestamps and `outcomeCode` |
| `signer` | `object` or `null` | The device's signing credential: `kind` (`trust-m`, `software-ecdsa` or `ed25519`), `algorithm`, `keySlot`, `enrolledAt`, `lastVerifiedAt`. May be absent |
| `modules[]` | `object` | The installation's sensor modules, as last reported: `instanceId`, `moduleType`, `driverId`, `moduleVersion`, `observedAt` and `provenance` |
| `modules[].state` | `string` | `disabled`, `starting`, `ready`, `degraded`, `faulted` or `stopped` |
| `modules[].health` | `object` | `checkedAt`, plus `code` and `message` when the module reports a problem |

[Complete response schema](https://docs.squeekchain.com/assets/api/status.json)

Projected values are optimistic: a projected completed block isn't settled on Ethereum and hasn't issued $SQK. It settles when the Reporter's batch confirms, and issues $SQK when SqueekMining checkpoints it.

**Freshness**

A shared snapshot is recomputed at most once a second and right after each accepted measurement. Builder unavailable reasons: `no_measurement`, `counter_fault`, `counter_epoch_unapproved`, `round_projection_gap`, `oracle_head_unavailable`, `round_ineligible`. Oracle reasons: `no_measurement`, `counter_fault`, `counter_epoch_unapproved`, `round_projection_gap`, `oracle_head_unavailable`. Queue unavailable reasons: `oracle_head_unavailable`, `round_projection_gap`, `round_ineligible`. A stale measurement alone doesn't make the builder unavailable.

### Measurement runs · GET /v1/measurement/runs

The device's record of wheel passages, grouped into immutable run segments with exact passage times, for animating or analysing running sessions. It's evidence signed by the device's key, not work certified by SqueekCore.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `limit` | `integer` | No | Segments per page, 1–100; default 20. Above 100 returns 400 `invalid_limit` |
| `cursor` | `string` | No | `nextCursor` from the previous page |

**Example request**

```sh
curl -i "https://api.squeekchain.com/v1/measurement/runs?limit=1"
```

**Response**

```json
{
  "schemaVersion": "measurement-runs.v1",
  "installationId": "example-installation",
  "generatedAt": "2026-10-28T23:39:15.812Z",
  "authority": "pi-device-key",
  "certifiedCoreWork": false,
  "freshness": "fresh",
  "latestObservedAt": "2026-10-28T23:39:11.037759Z",
  "coverageStartAt": "2026-10-26T21:16:49.503258Z",
  "coverageThroughAt": "2026-10-28T23:39:11.037759Z",
  "items": [
    {
      "segmentId": "79161145-d47f-4991-8428-d12669c91a59",
      "continuityId": "675af5de0aa9491b5137c58e88f1dcf235cc467e7381ec40b8f5f25435990519",
      "discontinuity": true,
      "startAt": "2026-10-26T21:16:49.503258Z",
      "endAt": "2026-10-26T21:16:57.682178Z",
      "workUnits": "15",
      "maxGapMs": "639",
      "previousAt": null,
      "boundaryGapNs": null,
      "passages": [
        {
          "at": "2026-10-26T21:16:49.503258Z",
          "offsetNs": "0"
        },
        {
          "at": "2026-10-26T21:16:50.141469Z",
          "offsetNs": "638211000"
        },
        {
          "at": "2026-10-26T21:16:50.679655Z",
          "offsetNs": "1176397000"
        }
      ],
      "provenance": "hardware",
      "profile": "staging",
      "observedAt": "2026-10-26T21:16:58.141Z",
      "receivedAt": "2026-10-26T21:16:58.706Z",
      "measurementEligible": true
    }
  ],
  "nextCursor": "WyJtZWFzdXJlbWVudC1ydW5zLnYxIiwic3RyZWFtLWdhbWUtc2Vwb2xpYS10ZXN0LTIwMjYxMDI1LTAxIiwiMiJd"
}
```

| Field | Type | Description |
|---|---|---|
| `authority` | `string` | Always `pi-device-key`: the device signed this evidence |
| `certifiedCoreWork` | `boolean` | Always `false`: these segments are not SqueekCore-certified work |
| `freshness` | `string` | `fresh` when the segments have caught up with the latest reading, it is under 120 seconds old and the device is healthy; `stale` otherwise; `unavailable` before any segment |
| `latestObservedAt` | `string` or `null` | The latest accepted reading |
| `coverageStartAt` | `string` or `null` | The first recorded passage |
| `coverageThroughAt` | `string` or `null` | How far the segments cover: the latest reading once they have caught up with it, otherwise the latest recorded passage |
| `items[]` | `object` | Run segments, oldest first |
| `items[].segmentId` | `string` | Unique segment ID |
| `items[].continuityId` | `string` | Opaque ID shared by segments of one continuous counter |
| `items[].discontinuity` | `boolean` | `true` when this segment doesn't continue the previous one |
| `items[].startAt`, `items[].endAt` | `string` | The first and last passage in the segment |
| `items[].workUnits` | `string` | Work units in the segment |
| `items[].maxGapMs` | `string` | The longest gap between passages, in milliseconds |
| `items[].previousAt` | `string` or `null` | The passage before this segment, when continuous |
| `items[].boundaryGapNs` | `string` or `null` | Nanoseconds from `previousAt` to `startAt` |
| `items[].passages[]` | `object` | Each passage: `at` and `offsetNs`, nanoseconds from the segment start |
| `items[].provenance` | `string` | `hardware`, `simulated`, `replay` or `derived` |
| `items[].profile` | `string` | `development`, `staging`, `shadow` or `production` |
| `items[].observedAt`, `items[].receivedAt` | `string` | When the device recorded and the API accepted the segment |
| `items[].measurementEligible` | `boolean` | Whether the segment counts toward measurement |
| `nextCursor` | `string` or `null` | The next page. Keep it even on an empty page and continue from it until `items` is empty |

[Complete response schema](https://docs.squeekchain.com/assets/api/measurement-runs.json)

**Freshness**

Segments appear as the device uploads them. Never stored by caches.

**Errors**

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_limit` | `limit` is above 100 |
| 400 | `invalid_cursor` | The cursor is unknown; start again from the first page |

### Provisional blocks · GET /v1/measurement/blocks

The Squeek blocks the wheel's accepted work has completed beyond the settled frontier, each with its completing work threshold and, when known, the exact passage that crossed it. Use it to show blocks as they happen, then confirm each against SqueekCore when it settles.

The endpoint takes no parameters; any query parameter returns 400 `invalid_query`.

**Example request**

```sh
curl -i https://api.squeekchain.com/v1/measurement/blocks
```

**Response**

```json
{
  "schemaVersion": "game-block-projection.v1",
  "installationId": "example-installation",
  "generatedAt": "2026-11-04T23:39:16.029Z",
  "revision": "U9zQYSMMEt_vtiMrL2LQN7URAlabSL1EfDbQMX9N5XI",
  "observedAt": "2026-11-04T23:39:11.037Z",
  "receivedAt": "2026-11-04T23:39:11.371Z",
  "provenance": "hardware",
  "profile": "staging",
  "chain": {
    "chainId": "11155111",
    "coreAddress": "0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4",
    "graphManifestDigest": "0x3640301c2f10a959c8fb322b3e3ebbf70360738ed3a0c97b11c514e4d4d8ef39"
  },
  "roundSchedule": {
    "genesisTimestamp": "1793735400",
    "roundDurationSeconds": 600
  },
  "status": "available",
  "freshness": "fresh",
  "anchor": {
    "cumulativeWork": "25701",
    "cumulativeBlockUnits": "2366143705150",
    "blockHeight": "2366",
    "blockProgress": "143705150",
    "workPerThousandBlocks": "11005",
    "settledThroughRound": "166",
    "confirmedAt": "2026-11-04T23:30:36.000Z",
    "transactionHash": "0x2222222222222222222222222222222222222222222222222222222222222222"
  },
  "projected": {
    "cumulativeWork": "26009",
    "cumulativeBlockUnits": "2394130983659",
    "blockHeight": "2394",
    "blockProgress": "130983659",
    "workPerThousandBlocks": "10894"
  },
  "blocks": [
    {
      "height": "2367",
      "workThreshold": "25711",
      "roundId": "167",
      "completingAt": "2026-11-04T23:30:08.044489Z"
    },
    {
      "height": "2368",
      "workThreshold": "25722",
      "roundId": "167",
      "completingAt": "2026-11-04T23:30:17.642981Z"
    },
    {
      "height": "2369",
      "workThreshold": "25733",
      "roundId": "167",
      "completingAt": "2026-11-04T23:30:27.709530Z"
    }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `freshness` | `string` | `fresh`, `stale` or `unavailable` |
| `revision` | `string` | Opaque projection revision |
| `observedAt`, `receivedAt` | `string` or `null` | The latest reading behind the projection |
| `provenance` | `string` or `null` | `hardware`, `simulated`, `replay` or `derived` |
| `profile` | `string` | `development`, `staging`, `shadow` or `production` |
| `chain.chainId`, `chain.coreAddress` | `string` | The chain and the SqueekCore address the projection follows |
| `chain.graphManifestDigest` | `string` | Digest of the deployed contract set |
| `roundSchedule.genesisTimestamp`, `roundSchedule.roundDurationSeconds` | `string`, `number` | Round timing: Unix seconds and 600 |
| `anchor` | `object` | The settled frontier on SqueekCore: `cumulativeWork`, `cumulativeBlockUnits`, `blockHeight`, `blockProgress`, `workPerThousandBlocks`, `settledThroughRound`, `confirmedAt`, `transactionHash` |
| `projected` | `object` | The frontier including accepted, unsettled work: `cumulativeWork`, `cumulativeBlockUnits`, `blockHeight`, `blockProgress`, `workPerThousandBlocks` |
| `blocks[]` | `object` | Up to 120 provisional blocks, lowest first |
| `blocks[].height` | `string` | The Squeek block number |
| `blocks[].workThreshold` | `string` | The cumulative work that completes it |
| `blocks[].roundId` | `string` | The round in which it completes |
| `blocks[].completingAt` | `string` or `null` | The exact accepted passage that crossed the threshold, or `null` when the passage evidence doesn't cover it |

[Complete response schema](https://docs.squeekchain.com/assets/api/measurement-blocks.json)

Provisional blocks aren't settled and have issued no $SQK. Reveal each one once, then compare its work and round with SqueekCore when it settles; a mismatch stops the settlement, and the block is never drawn again.

**Freshness**

Read on every request and never stored by caches. Missing, gapped or unhealthy measurement, an open settlement incident, stale telemetry, or more than 120 blocks of lead give `unavailable` instead of a partial list. Unavailable reasons: `no_measurement`, `counter_fault`, `counter_epoch_unapproved`, `round_projection_gap`, `oracle_head_unavailable`, `round_ineligible`, `stale_measurement`, `unhealthy_measurement`, `unhealthy_settlement`, `projection_lead_exceeded`, `projection_inconsistent`.

### Measurement statistics · GET /v1/measurement/stats

Aggregates over the last 7 or 30 days: lifetime totals, daily and half-hourly activity, records, block production, round activity and settlement performance. Use it for charts and summaries; it's too heavy to poll.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `range` | `string` | Yes | `7d` or `30d`. Exactly one `range`; no other parameter is accepted |

**Example request**

```sh
curl -i "https://api.squeekchain.com/v1/measurement/stats?range=7d"
```

**Response**

<details markdown="1">
<summary>Example response</summary>

```json
{
  "schemaVersion": 1,
  "installationId": "example-installation",
  "revision": "1Ru_-FMdWXKwTEP64RO_VeKZLDUsKJ5MqNdL_oQzMYk",
  "generatedAt": "2026-10-28T23:38:33.278Z",
  "range": "7d",
  "timezone": "UTC",
  "window": {
    "startAt": "2026-10-22T12:00:00.000Z",
    "endAt": "2026-10-28T23:38:33.278Z",
    "dayCount": 7,
    "bucketSeconds": 1800,
    "roundSeconds": 600
  },
  "lifetime": {
    "acceptedWorkUnits": "25701",
    "observedDistanceMm": "22789368",
    "activeDayCount": 3,
    "settledBlockCount": "2366",
    "settlementCount": "303",
    "coverageBps": 10000,
    "firstObservedAt": "2026-10-26T13:50:00.000Z",
    "settledWorkUnits": "25701"
  },
  "activity": {
    "provenance": "accepted_rounds",
    "coverage": {
      "expectedRoundCount": 933,
      "observedRoundCount": 346,
      "coverageBps": 3708,
      "complete": false
    },
    "summary": {
      "observedWorkUnits": "25701",
      "observedDistanceMm": "22789368",
      "activeDayCount": 3,
      "inactiveDayCount": 0,
      "averageWorkPerActiveDayMilli": "8567000",
      "medianWorkPerActiveDay": "10891",
      "averageDistancePerActiveDayMm": "7596456",
      "mostActiveDate": "2026-10-26",
      "mostActiveDateWorkUnits": "11182",
      "peakWindowStartMinuteUtc": 1320
    },
    "days": [
      {
        "date": "2026-10-22",
        "coverage": {
          "expectedRoundCount": 144,
          "observedRoundCount": 0,
          "coverageBps": 0
        },
        "observedWorkUnits": "0",
        "distanceMm": null,
        "buckets": [
          {
            "startMinuteUtc": 0,
            "coverage": "missing",
            "observedRoundCount": 0,
            "workUnits": null
          },
          {
            "startMinuteUtc": 30,
            "coverage": "missing",
            "observedRoundCount": 0,
            "workUnits": null
          }
        ]
      },
      {
        "date": "2026-10-23",
        "coverage": {
          "expectedRoundCount": 144,
          "observedRoundCount": 0,
          "coverageBps": 0
        },
        "observedWorkUnits": "0",
        "distanceMm": null,
        "buckets": [
          {
            "startMinuteUtc": 0,
            "coverage": "missing",
            "observedRoundCount": 0,
            "workUnits": null
          },
          {
            "startMinuteUtc": 30,
            "coverage": "missing",
            "observedRoundCount": 0,
            "workUnits": null
          }
        ]
      }
    ],
    "typicalDay": [
      {
        "startMinuteUtc": 0,
        "totalWorkUnits": "0",
        "observedDayCount": 2,
        "meanWorkMilli": "0"
      },
      {
        "startMinuteUtc": 30,
        "totalWorkUnits": "1148",
        "observedDayCount": 2,
        "meanWorkMilli": "574000"
      }
    ]
  },
  "records": {
    "mostWorkHalfHour": {
      "value": "1827",
      "occurredAt": "2026-10-27T22:00:00.000Z",
      "coverage": "complete"
    },
    "mostWorkUtcDay": {
      "value": "11182",
      "occurredAt": "2026-10-26T12:00:00.000Z",
      "coverage": "partial"
    },
    "maximumDailyDistanceMm": {
      "value": "9817796",
      "occurredAt": "2026-10-26T12:00:00.000Z",
      "coverage": "partial"
    },
    "peakObservedRpmMilli": {
      "value": "111256",
      "occurredAt": "2026-10-28T21:28:20.307Z",
      "coverage": "partial"
    },
    "peakObservedSpeedMmPerSecond": {
      "value": "1628",
      "occurredAt": "2026-10-28T21:28:20.307Z",
      "coverage": "partial"
    },
    "longestActiveWindowMinutes": {
      "value": "90",
      "occurredAt": "2026-10-26T21:10:00.000Z",
      "coverage": "partial"
    },
    "longestActiveDayStreak": {
      "value": "3",
      "occurredAt": "2026-10-26T12:00:00.000Z",
      "coverage": "partial"
    }
  },
  "blocks": {
    "status": "unavailable",
    "reason": "completion_boundaries_unavailable"
  },
  "rounds": {
    "observedCount": 346,
    "activeCount": 56,
    "zeroWorkCount": 290,
    "missingCount": 587,
    "activeRateBps": 1618,
    "averageActiveWorkMilli": "458946",
    "medianActiveWork": "527",
    "p90ActiveWork": "662",
    "mostActiveWork": "699"
  },
  "oracle": {
    "status": "unavailable",
    "reason": "projection_not_initialized"
  }
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `revision` | `string` | Content revision; the `ETag` |
| `window` | `object` | `startAt`, `endAt`, `dayCount`, `bucketSeconds` (1800) and `roundSeconds` (600) |
| `lifetime` | `object` | Totals since the first observation: `acceptedWorkUnits`, `observedDistanceMm`, `activeDayCount`, `settledBlockCount`, `settlementCount`, `settledWorkUnits`, `coverageBps`, `firstObservedAt` |
| `activity.coverage` | `object` | Expected and observed rounds in the window, `coverageBps` and `complete` |
| `activity.summary` | `object` | Observed work and distance, active and inactive days, averages, median, the most active date and `peakWindowStartMinuteUtc` |
| `activity.days[]` | `object` | One entry per day: `date`, `coverage`, `observedWorkUnits`, `distanceMm` and 48 half-hour `buckets` |
| `activity.days[].buckets[]` | `object` | `startMinuteUtc`, `coverage` (`complete`, `partial`, `missing`, `future`), `observedRoundCount`, `workUnits` |
| `activity.typicalDay[]` | `object` | 48 half-hour slots averaged over the window: `startMinuteUtc`, `totalWorkUnits`, `observedDayCount`, `meanWorkMilli` |
| `records` | `object` | `mostWorkHalfHour`, `mostWorkUtcDay`, `maximumDailyDistanceMm`, `peakObservedRpmMilli`, `peakObservedSpeedMmPerSecond`, `longestActiveWindowMinutes`, `longestActiveDayStreak`: each `null` or a `value`, `occurredAt` and `coverage` |
| `blocks` | `object` | Available: blocks completed in the range and all time, per-day figures and completion times. Unavailable reasons: `completion_boundaries_unavailable`, `insufficient_history` |
| `rounds` | `object` | Observed, active, zero-work and missing rounds, `activeRateBps`, and active-round work statistics |
| `oracle` | `object` | Available: settlement submissions, confirmations, reverts and timings. Unavailable reasons: `projection_not_initialized`, `insufficient_history` |

[Complete response schema](https://docs.squeekchain.com/assets/api/measurement-stats.json)

Days run from 12:00 UTC to 12:00 UTC and are named by the date of their starting noon, matching the distance the device reports per day.

**Freshness**

Computed from accepted rounds and confirmed settlements. Send the `ETag` back in `If-None-Match` to get 304 while nothing has changed.

**Errors**

| Status | Code | Cause |
|---|---|---|
| 503 | `public_stats_rebuilding` | The statistics are being rebuilt; wait `Retry-After` and retry. Don't show an empty history |

## Settlement and events

What SqueekCore has settled on Ethereum, the history of settlements and issuance, and the event feed.

### SqueekCore state · GET /v1/core

SqueekCore's identity, configuration and settled state at the safe block, with its newest events. Use it to show settled work, block height and difficulty, and to check the API reads the deployment you expect.

The endpoint takes no parameters; any query parameter returns 400 `invalid_query`.

**Example request**

```sh
curl -i https://api.squeekchain.com/v1/core
```

**Response**

<details markdown="1">
<summary>Example response</summary>

```json
{
  "schemaVersion": 1,
  "installationId": "example-installation",
  "status": "unavailable",
  "reason": "indexer_unavailable"
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `identities.core` | `string` | The SqueekCore proxy address |
| `identities.proxyImplementation` | `string` | The implementation the proxy runs |
| `identities.proxyAdmin`, `identities.proxyAdminOwner` | `string` | The ProxyAdmin and its owner, the admin Timelock |
| `identities.operatorTimelock`, `identities.operatorProposer` | `string` | The admin Timelock and the account that proposes its operations |
| `configuration` | `object` | Launch configuration: `streamId`, `genesisTimestamp`, `roundDuration`, `maxWorkPerRound`, `maxRoundsPerBatch`, `guardian`, `reporter`, `initialWorkPerThousandBlocks`, `targetBlocksPerActiveRound`, `difficultySmoothingRounds`, `blockUnitsPerBlock` |
| `core.settledThroughRound` | `string` | The last settled round |
| `core.cumulativeWork` | `string` | All settled work units |
| `core.blockHeight` | `string` | Completed Squeek blocks |
| `core.blockProgress` | `string` | Block units into the next block, out of 1,000,000,000 |
| `core.workPerThousandBlocks` | `string` | Current difficulty |
| `core.cumulativeBlockUnits` | `string` | All block units earned |
| `core.paused` | `boolean` | Whether the Guardian has paused settlement |
| `implementation` | `object` | The running code: `codeAddress`, `storageLayoutDigest`, `runtimeHash` |
| `governance` | `object` | The latest timelock operation on the proxy: `operationId`, `operationKind`, `operationState` |
| `source` | `object` | The event the state was last read from: `eventName`, block, transaction and log position |
| `events[]` | `object` | Up to 25 newest events from SqueekCore, its proxy, ProxyAdmin and timelock: `id`, `contractKind`, `contractAddress`, `eventName`, block, transaction and log position, and `arguments` as name/value pairs |

[Complete response schema](https://docs.squeekchain.com/assets/api/core.json)

Compare `identities` and `implementation` with [Deployments](https://docs.squeekchain.com/developers.md#deployments); stop if they differ.

**Freshness**

Read at `chain.safeThroughBlock` and shared for up to 5 seconds. Unavailable reasons: `indexer_disabled`, `not_yet_safe` (the indexer hasn't reached 12 confirmations past the deployment), `indexer_unavailable`, `indexer_mismatch` (the indexer reports a different deployment).

### Settlement history · GET /v1/settlements

Settlement totals and the most recent settlements for a time range, with $SQK issuance by round. Use it for settlement and issuance charts.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `range` | `string` | No | `now` (default), `24h`, `7d` or `30d`. At most one `range`; no other parameter is accepted |

**Example request**

```sh
curl -i "https://api.squeekchain.com/v1/settlements?range=24h"
```

**Response**

<details markdown="1">
<summary>Example response, range=24h</summary>

```json
{
  "schemaVersion": 3,
  "installationId": "example-installation",
  "status": "unavailable",
  "range": "24h",
  "reason": "indexer_unavailable"
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `range` | `string` | The requested range |
| `window` | `object` or `null` | `startAt`, `endAt` and `bucketSeconds`; `null` for `now` |
| `summary` | `object` | `settlementCount`, `activeRoundCount`, `workAdded`, `completedBlockCount` and `archivedSettlementCount` for the range |
| `recentSettlements[]` | `object` | Up to 10 newest settlements that completed blocks (within the window, for ranged requests); settlements that completed none are counted in `summary` and `buckets` but never listed. Each has its round range, `activeRoundCount`, `workAdded`, `cumulativeWork`, completed blocks, `blockHeight`, `cumulativeBlockUnits`, the Ethereum `transactionHash`, `ethereumBlockNumber`, `blockTimestamp` and `logIndex` |
| `recentSettlements[].sqkMintedBaseUnits` | `string` | The $SQK its blocks issued, once `mining.processedThroughRound` reaches its `settledThroughRound` |
| `buckets[]` | `object` | Per-period totals: 24 hourly buckets for `24h`, 28 six-hour buckets for `7d`, 30 daily buckets for `30d`, none for `now`; each with `sqkMintedBaseUnits` when issuance is available |
| `mining.status` | `string` | `available`, or `unavailable` with `mining.reason` `not_configured` or `not_yet_safe` |
| `mining.economy` | `object` | The release, the SqueekMining and SqueekToken addresses, `symbol` and `decimals` |
| `mining.supplyCap`, `mining.premintBaseUnits` | `string` | The $SQK supply cap and the amount minted before issuance began |
| `mining.schedule` | `object` | The issuance schedule: `allowanceBaseUnits`, `launchBonusBaseUnits`, `bonusBlocks`, `halvingBlocks`, `firstPeriodRateBaseUnits` |
| `mining.startRound`, `mining.startHeight` | `string` or `null` | The round and Squeek block at which issuance started; `null` before it starts |
| `mining.miningMintedBaseUnits`, `mining.unmintedCapacityBaseUnits` | `string` | $SQK issued by mining so far and the capacity left under the supply cap |
| `mining.rangeMintedBaseUnits`, `mining.rangeCheckpointCount` | `string` | $SQK issued and checkpoints run in the range |
| `mining.processedThroughRound` | `string` | The last round SqueekMining has funded |
| `mining.nextRound` | `object` | The next round to fund: `state` (`accruing` or `ready`), `round`, `countedThroughRound`, `startsAt`, `endsAt`, its block units, `completedBlockCount` and `amountBaseUnits` |
| `mining.recentCheckpoints[]` | `object` | Up to 12 newest checkpoints: round span, `completedBlockCount`, `cumulativeWork`, `cumulativeBlockUnits`, `amountBaseUnits`, `miningMintedBaseUnits`, transaction and block |
| `recentRounds[]` | `object` | `now` only: recent rounds with `roundId`, `endAt` and `sqkMintedBaseUnits` |
| `previousPeriod` | `object` | Ranged only, when available: $SQK issued in the period before the window |

[Complete response schema](https://docs.squeekchain.com/assets/api/settlements.json)

A settlement records work on SqueekCore; $SQK is issued later, per round, when SqueekMining checkpoints. Never attribute $SQK to a single settlement.

**Freshness**

Read at the safe block and shared for up to 5 seconds without `range`, or up to 60 seconds with one. The `24h` window ends at the next full hour; the `7d` and `30d` windows end at the next 12:00 UTC, so buckets shift on those boundaries even without new events. The response header `X-Squeek-Settlement-Source` is `live`, `durable-cache` (the indexer is behind or unavailable and the last good snapshot is served) or `unavailable`. With `durable-cache`, `X-Squeek-Settlement-Fallback-Reason` gives the reason the live read wasn't used, from the unavailable reasons below. Unavailable reasons: `indexer_disabled`, `not_yet_safe`, `indexer_unavailable`, `indexer_mismatch`.

### Event feed · GET /v1/events

The newest-first feed of what happened: settlements and checkpoints, account rewards and staking, Squeek deposits, withdrawals and merges, and wheel milestones. Use it for an activity feed.

**Query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `category` | `string` | No | `all` (default), `protocol`, `players` or `measurement` |
| `limit` | `integer` | No | 1–100; default 40 |
| `cursor` | `string` | No | `nextCursor` from the previous page, with the same `category` |

**Example request**

```sh
curl -i "https://api.squeekchain.com/v1/events?category=all&limit=40"
```

**Response**

<details markdown="1">
<summary>Example response</summary>

```json
{
  "schemaVersion": 4,
  "installationId": "example-installation",
  "status": "unavailable",
  "reason": "indexer_unavailable"
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `catalogVersion` | `string` | Version of the event-type catalog |
| `category` | `string` | The requested category |
| `activeEventTypes` | `string[]` | Event types this feed can contain |
| `events[].id` | `string` | Stable, unique event ID; use it to deduplicate |
| `events[].eventVersion` | `integer` | Version of this event type's payload |
| `events[].type` | `string` | One of the types below |
| `events[].occurredAt` | `string` | When it happened: the block time, or the measurement time |
| `events[].recordedAt` | `string` | When Squeekchain recorded it |
| `events[].source` | `object` | `kind: "chain"` with the chain, release, contract, block, transaction and log position (always `confirmationStatus: "safe"`); or `kind: "measurement"` with the installation, telemetry ID, times and policy |
| `events[].payload` | `object` | Type-specific values, below |
| `nextCursor` | `string` or `null` | The next page; `null` at the end |

| Type | Category | Payload |
|---|---|---|
| `system.settlement_completed` | `protocol` | Round range, `activeRoundCount`, `workAdded`, completed blocks, `cumulativeWork`, `blockHeight`, `cumulativeBlockUnits` |
| `system.mining_checkpointed` | `protocol` | `afterRound`, `throughRound`, `completedBlockCount`, `amountBaseUnits`, `asset`, `cumulativeWork`, `cumulativeBlockUnits` |
| `account.rewards_claimed` | `players` | `account`, `recipient`, `amountBaseUnits`, `asset` |
| `account.claim_recipient_set` | `players` | `account`, `recipient` |
| `account.rewards_staked` | `players` | `account`, `amountBaseUnits`, `principalBaseUnits`, `freshUntilRound`, `asset` |
| `account.sqk_staked` | `players` | `account`, `amountBaseUnits`, `principalBaseUnits`, `freshUntilRound`, `asset` |
| `account.sqk_unstaked` | `players` | `account`, `amountBaseUnits`, `feeBaseUnits`, `netBaseUnits`, `asset` |
| `nft.deposited` | `players` | `account`, `collection`, `tokenId`, `basePower` |
| `nft.withdrawn` | `players` | `account`, `collection`, `tokenId`, `basePower` |
| `nft.merged` | `players` | `account`, `collection`, `survivorTokenId`, `donorTokenId`, `level`, `nextMergeHeight`, `custody`, `nftPowerDelta` |
| `measurement.distance_milestone` | `measurement` | `thresholdDistanceMm`, `observedLifetimeDistanceMm` at 1, 3, 5, 10, 15, 20, 30 … 100 km, then every 50 km |
| `measurement.daily_distance_milestone` | `measurement` | `thresholdDistanceMm`, `observedDayDistanceMm`, `utcDate` at 1, 3, 5, 10 and 15 km in a day |
| `measurement.speed_milestone` | `measurement` | `thresholdSpeedMmPerSecond`, `observedSpeedMmPerSecond` at 2, 3, 6 and 10 km/h |
| `measurement.speed_record` | `measurement` | `previousRecordMmPerSecond`, `recordMmPerSecond`, `observedSpeedMmPerSecond`; a new top speed at least 0.2 km/h above the last |
| `measurement.distance_streak` | `measurement` | `days`, `minimumDailyDistanceMm`, `endingUtcDate`: 5 km a day on consecutive days, from day two |

[Complete response schema](https://docs.squeekchain.com/assets/api/events.json)

The schema also lists `measurement.rpm_record`, which this endpoint never returns. Days for measurement events run from 12:00 UTC to 12:00 UTC.

**Freshness**

Chain events appear once they have 12 confirmations; measurement events once the measurement is accepted. Shared for up to 5 seconds. Unavailable reasons: `indexer_disabled`, `not_yet_safe`, `indexer_unavailable`, `indexer_mismatch`, `source_disabled`.

**Errors**

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_cursor` | The cursor can't be decoded or was issued for another category; start again from the first page |
| 400 | `invalid_query` | Also returned for a cursor containing characters other than `A–Z a–z 0–9 _ -` |

## Economy and Squeeks

$SQK supply, issuance and staking, each account's Squeeks, power and rewards, its history, and each Squeek's state and metadata.

These version-3 endpoints share a release envelope with version-4 events: `release` names the release, `chain` the safe block, `deployment` the revisioned component descriptor, and `capabilities` their readback at that block. A missing component is `null` in the descriptor. Keep absent, configured, unavailable and mismatched capabilities distinct, and never turn an unknown component into a zero balance. The descriptor's dispenser is the Sepolia authorization minter.

A response from another deployment is `unavailable` with `indexer_mismatch`, never served from a stale copy. Other unavailable reasons are `indexer_disabled`, `not_yet_safe`, `indexer_unavailable`, `unsupported_contract_version` and `projection_rebuilding`. Wallet NFT data can stay available without monetary components.

### Economy state · GET /v1/economy/state

The whole economy at the safe block: $SQK supply and issuance, mining lifecycle and funding, staking totals, and the Squeek level tables. Use it for supply figures and economy dashboards.

The endpoint takes no parameters; any query parameter returns 400 `invalid_query`.

**Example request**

```sh
curl -i https://api.squeekchain.com/v1/economy/state
```

**Response**

<details markdown="1">
<summary>Example response, unavailable</summary>

```json
{
  "schemaVersion": 3,
  "installationId": "example-installation",
  "release": {
    "id": "core-sepolia-20261103",
    "protocolRevision": "staged-launch-1",
    "rewardModelRevision": "funded-stream-q128-1"
  },
  "status": "unavailable",
  "reason": "indexer_unavailable"
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `release.id` | `string` | The release the data belongs to |
| `chain.safeThroughBlock`, `chain.safeBlockHash`, `chain.safeBlockTimestamp` | `string` | The safe block the response was read at |
| `deployment` | `object` | Revisioned descriptor with chain, release and component identities, deployment receipts and code pins |
| `capabilities` | `object` | Component readback and shared safe-block evaluation; distinguish absent, unverified and verified components |
| `asset` | `object` or `null` | Verified $SQK token: `address`, `symbol`, `decimals` |
| `lifecycle.stage` | `string` | `unbound`, `bootstrapped`, `staking_bound`, `scheduled` or `active`; lifecycle is null without verified Mining |
| `lifecycle.startRound`, `lifecycle.currentRound` | `string` | When issuance starts (`null` until scheduled) and the current round |
| `lifecycle.paused`, `lifecycle.guardian` | `boolean`, `string` | Whether mining is paused, and the Guardian that can pause it |
| `supply` | `object` or `null` | Verified Token: `capBaseUnits`, `premintBaseUnits`, `miningMintedBaseUnits`, `totalMintedBaseUnits`, `totalBurnedBaseUnits`, `liveSupplyBaseUnits`, `unmintedCapacityBaseUnits` |
| `schedule` | `object` or `null` | Verified, bootstrapped Mining: `allowanceBaseUnits`, `launchBonusBaseUnits`, `bonusBlocks`, `halvingBlocks`, `firstPeriodRateBaseUnits`, `startHeight`, `closedThroughBlock`, `issuedBaseUnits`; null before bootstrap |
| `mining.processedThroughRound`, `mining.fundedBlocks` | `string` | The last funded round and the Squeek blocks funded so far |
| `staking` | `object` or `null` | Verified Staking totals: principal, power, `sqkPerPower`, `referencePower`, `exitPolicy`, `rewards`, `paused`, `launchReady`; all Mining issuance funds Staking |
| `nft.issued`, `nft.burned`, `nft.live` | `string` | Squeeks issued, burned and in existence |
| `nft.mergesOpen`, `nft.maximumLevel` | `boolean`, `integer` | Whether merges are open, and the highest level |
| `nft.basePower`, `nft.cooldownBlocks` | `string[]` or `null`, `string[]` | Level power requires verified Staking; merge cooldowns come from the verified collection. `nft` itself is null without verified collection readback |
| `authMinter` | `object` or `null` | The Sepolia testnet minter, when present: `address`, `claimsOpen`, `signer`, `totalClaimed`, `remaining` |

[Complete response schema](https://docs.squeekchain.com/assets/api/economy-state.json)

Unstake fee quotes aren't served here; read them from the staking contract.

**Freshness**

Read at `chain.safeThroughBlock` and shared for up to 5 seconds.

### Account · GET /v1/accounts/{address}

One account at the safe block: its rewards, power, staked $SQK, recent earnings and a page of its Squeeks, held in the wallet or deposited in staking. Use it for an account or portfolio view.

**Path and query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | The account: `0x` and 40 hex digits, all lowercase or with a valid EIP-55 checksum. Anything else, including a wrong checksum or the zero address, returns 400 `invalid_address`. The response gives it lowercase |
| `limit` | `integer` | No | Squeeks per page, 1–100; default 25 |
| `cursor` | `string` | No | `nextCursor` from the previous page, with the same `address` |

**Example request**

```sh
curl -i "https://api.squeekchain.com/v1/accounts/${ACCOUNT_ADDRESS}?limit=25"
```

```ts
// api-account-squeeks.ts
import { apiGet, required } from "./api";

type Page =
  | { schemaVersion: 3; status: "unavailable"; reason: string }
  | {
      schemaVersion: 3;
      status: "available";
      rewards: { claimableBaseUnits: string } | null;
      tokens: { tokenId: string; custody: "staking" | "wallet"; level: number }[];
      nextCursor: string | null;
    };

const account = required("ACCOUNT_ADDRESS");
const tokens: Extract<Page, { status: "available" }>["tokens"] = [];
let claimable: string | null = null;
let cursor: string | null = null;
do {
  const query: URLSearchParams = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
  const page: Page = await apiGet<Page>(`/v1/accounts/${account}?${query}`);
  if (page.schemaVersion !== 3) throw new Error("Unsupported account schema version");
  if (page.status !== "available") throw new Error(`Account data unavailable: ${page.reason}`);
  claimable ??= page.rewards?.claimableBaseUnits ?? null;
  tokens.push(...page.tokens);
  cursor = page.nextCursor;
} while (cursor !== null);
console.log({ account, squeeks: tokens.length, claimableSqkBaseUnits: claimable });
```

```ts
// api.ts
export const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Supply ${name}`);
  return value;
};

/** GET a public endpoint, waiting out rate limits and capacity errors a bounded number of times. */
export async function apiGet<T>(path: string): Promise<T> {
  const base = required("API_BASE_URL");
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(new URL(path, base), { headers: { accept: "application/json" } });
    if ((response.status === 429 || response.status === 503) && attempt < 3) {
      const seconds = Number(response.headers.get("retry-after") ?? "2");
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      continue;
    }
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
    return (await response.json()) as T;
  }
}
```

Set `API_BASE_URL=https://api.squeekchain.com` and `ACCOUNT_ADDRESS`, then run `npx tsx api-account-squeeks.ts`.

**Response**

<details markdown="1">
<summary>Example response, unavailable</summary>

```json
{
  "schemaVersion": 3,
  "installationId": "example-installation",
  "release": {
    "id": "core-sepolia-20261103",
    "protocolRevision": "staged-launch-1",
    "rewardModelRevision": "funded-stream-q128-1"
  },
  "status": "unavailable",
  "reason": "indexer_unavailable"
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `account` | `string` | The account, lowercase |
| `economy` | `object` | Context at the safe block: `currentRound`, `coreBlockHeight`, `mergesOpen`, `stakingPaused`, `maximumLevel` |
| `claimRecipient` | `string` or `null` | Where the account's claims are paid, if it has set one |
| `rewards.claimableBaseUnits` | `string` | $SQK one claim pays now |
| `rewards.remainderScaled` | `string` | Credit below one base unit, scaled; it carries into later claims |
| `rewards.lifetimePaidBaseUnits`, `rewards.lifetimeCompoundedBaseUnits` | `string` | $SQK claimed so far, and $SQK claimed straight into staking |
| `power.nftPower`, `power.sqkPower` | `string` | The account's power from deposited Squeeks and from staked $SQK |
| `stake` | `object` | Staked $SQK: `principalBaseUnits`, split into `freshBaseUnits` (until `freshUntilRound`) and `matureBaseUnits` |
| `earnings[]` | `object` | Seven days of earnings: `date` and `earnedBaseUnits` |
| `tokenCounts.staking`, `tokenCounts.wallet` | `string` | How many Squeeks the account has deposited and holds in its wallet |
| `tokens[]` | `object` | A page of its Squeeks |
| `tokens[].tokenId` | `string` | The token ID |
| `tokens[].custody` | `string` | `staking` (deposited) or `wallet` |
| `tokens[].level`, `tokens[].basePower` | `integer`, `string` | Level and base power |
| `tokens[].nextMergeHeight` | `string` | The Squeek block from which it can merge again |
| `tokens[].mergeState` | `string` | `ready`, `cooldown`, `terminal` or `merges_closed` |
| `tokens[].metadataStatus` | `string` | `available`, or `pending` after a reveal until its metadata refreshes |
| `nextCursor` | `string` or `null` | The next page of Squeeks; `null` at the end |

[Complete response schema](https://docs.squeekchain.com/assets/api/account.json)

Without verified Staking, `rewards`, `power`, `stake`, `earnings` and token `basePower` are null rather than zero. `tokenCounts.staking` is zero for absent Staking and null for unverified Staking. `claimRecipient: null` means self-payment only when Staking is verified.

Read `claimable` and ownership from the contracts before preparing a claim or merge; see [Build owner actions](https://docs.squeekchain.com/developers/owner-actions.md).

**Freshness**

Read at the safe block on every request and never stored by caches. A cursor pins the account, release and safe block.

**Errors**

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_address` | Not a valid, non-zero address |
| 400 | `invalid_cursor` | The cursor can't be decoded or was issued for another route |
| 409 | `cursor_invalidated` | The chain reorganized or moved past the cursor's block; start again from the first page |

### Account activity · GET /v1/accounts/{address}/activity

One account's confirmed history, newest first: rewards claims, claim-recipient changes, stakes and unstakes, Squeek deposits, withdrawals, merges and transfers, and Sepolia testnet minter claims. Use it for an account's history view.

**Path and query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | The account, as for [Account](https://docs.squeekchain.com/developers/api.md#account) |
| `limit` | `integer` | No | Entries per page, 1–100; default 25 |
| `cursor` | `string` | No | `nextCursor` from the previous page, with the same `address` |

**Example request**

```sh
curl -i "https://api.squeekchain.com/v1/accounts/${ACCOUNT_ADDRESS}/activity?limit=3"
```

**Response**

<details markdown="1">
<summary>Example response, unavailable</summary>

```json
{
  "schemaVersion": 3,
  "installationId": "example-installation",
  "release": {
    "id": "core-sepolia-20261103",
    "protocolRevision": "staged-launch-1",
    "rewardModelRevision": "funded-stream-q128-1"
  },
  "status": "unavailable",
  "reason": "indexer_unavailable"
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `account` | `string` | The account, lowercase |
| `total` | `string` | Entries in the account's history |
| `activity[].id` | `string` | Stable, unique entry ID |
| `activity[].source` | `object` | The block, transaction and log position (always `confirmationStatus: "safe"`) |
| `activity[].kind` | `string` | `rewards_claimed`, `claim_recipient_set`, `rewards_staked`, `sqk_staked`, `sqk_unstaked`, `nft_deposited`, `nft_withdrawn`, `nft_merged`, `nft_transferred` or `nft_claimed` |
| `activity[].account` | `string` | The account |
| `activity[].recipient` | `string` or `null` | Claims and recipient changes: who receives the $SQK |
| `activity[].amountBaseUnits` | `string` | Claims, stakes and unstakes: the $SQK amount |
| `activity[].principalBaseUnits`, `activity[].freshUntilRound` | `string` | Stakes: the staked principal afterwards and when the new stake matures |
| `activity[].feeBaseUnits`, `activity[].netBaseUnits` | `string` | Unstakes: the fee and the $SQK returned |
| `activity[].tokenId`, `activity[].basePower` | `string` | Deposits and withdrawals include token ID and power; transfers include token ID |
| `activity[].survivorTokenId`, `activity[].donorTokenId`, `activity[].level`, `activity[].nextMergeHeight`, `activity[].nftPowerDelta` | `string`, `integer` or `null` | Merges: kept and burned Squeeks, new level and next merge block; power delta is null for wallet merges |
| `activity[].from`, `activity[].to` | `string` | Transfers: sender and receiver |
| `activity[].authorizationId`, `activity[].firstTokenId`, `activity[].quantity` | `string` | Testnet minter claims (`nft_claimed`, with `recipient`): the authorization used, the first token ID and the number of Squeeks delivered |
| `nextCursor` | `string` or `null` | The next page; `null` at the end |

[Complete response schema](https://docs.squeekchain.com/assets/api/account-activity.json)

**Freshness**

Entries appear once they have 12 confirmations. Read on every request and never stored by caches.

**Errors**

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_address` | Not a valid, non-zero address |
| 400 | `invalid_cursor` | The cursor can't be decoded or was issued for another route |
| 409 | `cursor_invalidated` | The chain reorganized or moved past the cursor's block; start again from the first page |

### Squeek · GET /v1/squeeks/{tokenId}

One Squeek at the safe block: who holds it, its level, power and merge state, and its current metadata with the image and traits. Use it for a Squeek's page or card.

**Path and query parameters**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tokenId` | `string` | Yes | 1 to 9999 |
| `release` | `string` | No | The `release.id` this API serves. With it, the inline image is left out whenever a card image URL exists. Any other value returns 400 `invalid_query` |

**Example request**

```sh
curl -i https://api.squeekchain.com/v1/squeeks/8889
```

**Response**

<details markdown="1">
<summary>Example response, unavailable</summary>

```json
{
  "schemaVersion": 3,
  "installationId": "example-installation",
  "release": {
    "id": "core-sepolia-20261103",
    "protocolRevision": "staged-launch-1",
    "rewardModelRevision": "funded-stream-q128-1"
  },
  "status": "unavailable",
  "reason": "indexer_unavailable"
}
```

</details>

| Field | Type | Description |
|---|---|---|
| `status` | `string` | `available`, or `unavailable` with a `reason` |
| `tokenId` | `string` | The token ID |
| `custody.owner` | `string` or `null` | The current holder: an account, or the staking contract for a deposited Squeek |
| `custody.depositor` | `string` or `null` | Who deposited it, while it is in staking |
| `custody.stray` | `boolean` | Held by the staking contract without a recorded deposit |
| `custody.burned` | `boolean` | Burned, for example as a merge donor |
| `level`, `basePower` | `integer`, `string` or `null` | Level and base power; power is null without verified Staking |
| `nextMergeHeight` | `string` | The Squeek block from which it can merge again |
| `mergeState` | `string` or `null` | `ready`, `cooldown`, `terminal` or `merges_closed` |
| `economy` | `object` | Context at the safe block: `currentRound`, `coreBlockHeight`, `mergesOpen`, `stakingPaused`, `maximumLevel` |
| `metadata` | `object` or `null` | `status: "pending"` after a reveal until refreshed; otherwise the metadata below |
| `metadata.refreshedAtBlock` | `string` | The Ethereum block the metadata was read at |
| `metadata.name`, `metadata.description` | `string` | Name and description |
| `metadata.imageDataUri` | `string` | The image as an SVG data URI |
| `metadata.cardImageUrl` | `string` | A raster card image, when one exists |
| `metadata.attributes[]` | `object` | Traits: `traitType` and `value` |

[Complete response schema](https://docs.squeekchain.com/assets/api/squeek.json)

**Freshness**

Read at the safe block. An available response is shared for up to 5 seconds and has an `ETag`; an unavailable one is never stored.

**Errors**

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_token_id` | Not a token ID from 1 to 9999 |
| 404 | `token_not_found` | No such Squeek has been issued at the safe block |

## Community mint

Community mint runs on a separate Community origin, not the public API, and requires a signed-in, non-disqualified account. Set `COMMUNITY_BASE_URL=https://community.squeekchain.com` and send `Authorization: Bearer <session-token>` on both requests. The session identifies the person, not a wallet address; keep the token private and don't cache account responses.

### Mint status · GET /v1/community/mint/status

Read the signed-in person's tier, lifetime allowance, claimed quantity, available quantity and any reusable authorization.

**Request**

```sh
curl -i "${COMMUNITY_BASE_URL}/v1/community/mint/status" \
  -H "Authorization: Bearer ${COMMUNITY_SESSION_TOKEN}"
```

**Parameters**

No path parameters or request body. A bearer Community session is required.

**Response**

HTTP 200, [complete response schema](https://docs.squeekchain.com/assets/api/community-mint-status.json):

```json
{
  "tier": "none",
  "allowance": 1,
  "claimed": 0,
  "available": 1,
  "recipient": null,
  "claimsOpen": true,
  "authorization": null
}
```

| Field | Type | Description |
|---|---|---|
| `tier` | `string` | `gold`, `silver`, `bronze`, `member` or `none` |
| `allowance` | `integer` | Cumulative lifetime allowance for the current tier |
| `claimed` | `integer` | NFTs delivered onchain across all five person/tier authorization IDs |
| `available` | `integer` | `max(0, allowance - claimed)` |
| `recipient` | `string` or `null` | Lowercase eligible wallet address; null when no linked wallet qualifies |
| `claimsOpen` | `boolean` | False when the minter's claims are closed or its onchain `signer()` differs from this service's signing address; not a promise that the person has an eligible wallet or quantity left |
| `authorization` | `object` or `null` | Issued, unexpired, unconsumed authorization; same fields as POST except no `tier` inside this object |

**Freshness and unavailable states**

`Cache-Control: no-store`. Re-read after a claim, wallet change or tier change. An authorization is not an onchain delivery: only the `Claimed` event increases `claimed`. No eligible wallet is represented by a null recipient, not a zero address.

**Errors**

Bearer failures return 401 `unauthorized`; missing deployment or signer configuration returns 503 `mint_not_configured`. Closed claims or a signer mismatch still return HTTP 200, with `claimsOpen: false` and `authorization: null`; only [Mint authorization](https://docs.squeekchain.com/developers/api.md#community-mint-authorization) answers them with 503 `mint_unavailable`. A failed chain read returns 503 `mint_unavailable`. GET allows 60 requests per person per minute; over that, it returns 429 `rate_limited` with `Retry-After`. See [Community mint errors](https://docs.squeekchain.com/developers/api.md#community-mint-errors).

### Mint authorization · POST /v1/community/mint/authorization

Request the server-signed authorization for the current person and tier. POST does not send an Ethereum transaction.

**Request**

```sh
curl -i "${COMMUNITY_BASE_URL}/v1/community/mint/authorization" \
  -H "Authorization: Bearer ${COMMUNITY_SESSION_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{}'
```

**Parameters**

The body must be exactly the empty JSON object `{}`; unknown fields are rejected by the [strict request schema](https://docs.squeekchain.com/assets/api/community-mint-request.json). No wallet, quantity, tier, chain or deadline input is accepted.

**Response**

HTTP 200, [complete response schema](https://docs.squeekchain.com/assets/api/community-mint-authorization.json). This illustrative shape uses a synthetic signature and ID and isn't a usable authorization; the recipient address doesn't imply Community membership or wallet eligibility.

```json
{
  "chainId": 11155111,
  "authMinter": "0xe78b4420ce205b8864f2f326f3181f9dd5ea8b5f",
  "recipient": "0x3a83a80b9249eca85a9540ec878bd968f13cb676",
  "quantity": 1,
  "authorizationId": "0x1111111111111111111111111111111111111111111111111111111111111111",
  "deadline": "1793707500",
  "expiresAt": "2026-11-03T12:05:00.000Z",
  "signature": "0x1111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111",
  "tier": "none"
}
```

| Field | Type | Description |
|---|---|---|
| `chainId` | `integer` | Positive chain ID; this service signs for Sepolia, 11155111 |
| `authMinter` | `string` | Lowercase 20-byte address of the descriptor's authorization minter |
| `recipient` | `string` | Lowercase 20-byte Sepolia-eligible wallet selected by the server |
| `quantity` | `integer` | `min(available, 20)`; schema and contract require 1–20 |
| `authorizationId` | `string` | `0x` plus 64 lowercase hex digits; deterministic per person/tier and single-use onchain |
| `deadline` | `string` | Positive decimal Unix seconds, issued as now plus five minutes |
| `expiresAt` | `string` | Offset-bearing ISO 8601 expiration corresponding to `deadline` |
| `signature` | `string` | `0x` plus 130 lowercase hex digits: a 65-byte ECDSA signature by the minter's configured signer |
| `tier` | `string` | `gold`, `silver`, `bronze`, `member` or `none`; outside the signed claim arguments |

**Freshness and unavailable states**

If an issued authorization is unexpired and not consumed onchain, POST returns it again instead of issuing another; resubmit it unchanged. Otherwise the server signs the available quantity under the current tier's ID, and an already-consumed current-tier ID returns `nothing_to_claim` even if the arithmetic available amount is positive. Expiry doesn't consume an ID; a successful onchain claim does.

Use `@sqk/chain/mint-authorization` (`mintAuthorizationTypedData`, `mintAuthorizationDigest`, `accountAuthorizationId`) rather than recreating EIP-712 encoding. Check the chain, descriptor's minter, recipient, expiry and current onchain `signer()`, `claimsOpen()`, `authorizationConsumed(authorizationId)` and `remaining()`. Prepare and simulate `claim(recipient, quantity, authorizationId, deadline, signature)` using `squeekAuthMinterAbi` from `@sqk/chain/auth-minter`, then let the wallet sign and submit. Parse `deadline` as a bigint. The server signature authorizes the mint; it does not replace the wallet's transaction signature.

**Errors**

POST allows three requests per person per ten minutes. A 429 includes `Retry-After`; wait before retrying, including when asking for the same reusable authorization. Wallet, allowance and configuration failures use the table below.

#### Community mint errors

Errors use the [Community error schema](https://docs.squeekchain.com/assets/api/community-error.json): `{"error": "<code>"}`. They do not use public-read `status: "unavailable"` bodies.

| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Request body does not match the strict empty-object contract |
| 401 | `unauthorized` | No valid bearer session |
| 409 | `mint_wallet_unavailable` | No linked wallet can receive on Sepolia |
| 409 | `nothing_to_claim` | No available quantity, or the current tier's authorization ID is already consumed |
| 429 | `rate_limited` | Person-level budget exceeded (GET 60 per minute, POST three per ten minutes); wait the `Retry-After` seconds |
| 503 | `mint_not_configured` | Deployment descriptor or authorization signer is not configured |
| 503 | `mint_unavailable` | The chain read failed; on POST also when claims are closed or the configured signing address differs from onchain `signer()` (GET reports those as `claimsOpen: false`) |

Only non-disqualified accounts are eligible; don't infer eligibility from tier or wallet ownership alone.

## Related pages

- [Developers](https://docs.squeekchain.com/developers.md)
- [Quickstart](https://docs.squeekchain.com/developers/quickstart.md)
- [Index events](https://docs.squeekchain.com/developers/index-events.md)
- [Build owner actions](https://docs.squeekchain.com/developers/owner-actions.md)
- [Build with AI](https://docs.squeekchain.com/developers/build-with-ai.md)
