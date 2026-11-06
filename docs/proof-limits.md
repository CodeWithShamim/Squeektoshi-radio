> Documentation index: https://docs.squeekchain.com/llms.txt. Use it to find every page.

# What the system proves

> What sensor acceptance, signed telemetry, and Ethereum settlement establish—and what they do not.

Web version: https://docs.squeekchain.com/security/proof-limits/

## TL;DR

- One accepted magnet passage is one work unit under the configured sensor policy.
- A signature proves which key signed the data, not whether the measurement is physically true.
- Ethereum records contract execution and settled work. Video doesn't affect those records.
- The signing chip protects its key, but measurement accuracy still depends on the host that supplies its data.

## What does a work record prove?

A work record shows only that the Pi accepted a wheel-magnet passage under the configured sensor rules. It doesn't identify an animal, the wheel's direction, or what moved it. “Hamster proof of work” names these recorded passages; it doesn't prove animal identity or secure Ethereum consensus.

A zero-work round records that no passage was accepted; it can also be a round that elapsed while the Pi was stopped. Statistics built from settled rounds therefore show the ledger, not continuous observation.

A signature identifies the signing key, and settlement shows that Core accepted an authorized batch. Because neither checks the physical wheel, measurement accuracy still depends on the host and its operators.

## Does video or a signing chip remove that trust?

No. Video and measurement run independently: either can continue while the other is down, so a missing feed doesn't mean no work was recorded, and video can't replace sensor records.

The production signing chip keeps its key from being exported, but it signs the data the host supplies: it protects the key, while measurement accuracy still depends on the host.

## Technical detail: evidence by layer

| Layer | Evidence it supplies | What it cannot establish |
| --- | --- | --- |
| Pico | Raw sensor readings with identity, sequence, and timing | Accepted work, completed rounds, or signed telemetry |
| Pi | Saved accepted passages and completed rounds | Animal identity, direction, intent, or what caused movement |
| Oracle | Checks on signatures, identity, counter history, and policy | Physical truth or Ethereum settlement |
| Reporter | Signed permission to settle an exact batch | Anything beyond the eligible measurement records |
| `SqueekCore` on Ethereum | Executed round, work-total, and Squeek-block rules | Which animal or physical cause produced a reading |
| Camera and public display | Video and displayed status | Accepted measurements or proof of their cause |

### Permissions
Only the Pi accepts passages and assigns them to rounds. Hosted services check its records; they cannot invent a starting total, reduce cumulative work, or spread an unexplained increase across rounds.

Core checks signed settlements, not the sensor or Oracle database. Indexers and APIs display records but can't change Ethereum history.

### Guarantees
The Oracle verifies the signature before processing telemetry and preserves accepted round-data hashes. It identifies a retry by record identity and contents, not by signature bytes.

Production signing chips keep telemetry keys non-exportable, and the Oracle checks signatures against the registered public key. Enrollment shows that a genuine chip participated, but not that it holds the telemetry key or that a measurement is physically true.

Core rejects reused settlement authorizations and checks the chain, proxy, and implementation named by the signature. These checks prevent misuse of an authorization, not false physical measurements.

### Assumptions
The signing chip signs data supplied by the measurement host, so accurate records still depend on sensor placement, counting rules, host security, and key enrollment.

Hosted records depend on the Oracle administrators and database provider. Core upgrades depend on [the admin](https://docs.squeekchain.com/security/admin.md) through the public, delayed process. Core certifies settled work and completed Squeek blocks, Mining applies the issuance schedule, and Staking divides the resulting $SQK among stakers; the token checks neither work nor rounds.

### Failure behavior
- An invalid telemetry signature creates no Oracle receipt or accepted work.
- Rejected or quarantined telemetry leaves review records but creates no accepted rounds.
- The Pi stops counting missing, conflicting, or uncertain sensor readings rather than guessing passages.
- Rounds that elapse while the Pi is stopped close as zero-work rounds on restart; the ledger can't tell downtime from an idle wheel.
- A video failure neither proves nor disproves a passage and cannot change rounds.

## Related pages
- [Measuring wheel activity](https://docs.squeekchain.com/system/measurement.md)
- [Roles and permissions](https://docs.squeekchain.com/security/roles.md)
- [Privacy](https://docs.squeekchain.com/security/privacy.md)
