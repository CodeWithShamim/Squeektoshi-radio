> Documentation index: https://docs.squeekchain.com/llms.txt. Use it to find every page.

# Glossary

> Plain-language definitions for the WHEELY9000, Squeeks, $SQK, staking, work records, and the technical terms used in the docs.

Web version: https://docs.squeekchain.com/start/glossary/

## TL;DR

- The WHEELY9000 is the physical device; a Squeek is an NFT whose level sets the base power it adds once deposited in Staking.
- $SQK is the token Mining issues for completed Squeek blocks and funds Staking with; work units measure the hamster's activity.
- Settlement, funding, and claiming are separate steps.

## Everyday terms

WHEELY9000
: The hamster mining device: a wheel-mounted magnet, a sensor, and small computers that record wheel activity.

Squeek
: The project's NFT. Its level sets the base power it adds when deposited in Staking; level and merge cooldown stay with it when it changes hands.

$SQK
: Squeekchain's token, issued for completed Squeek blocks up to a lifetime supply cap.

SqueekFi
: Squeekchain's ecosystem for hamster-powered onchain finance, built on the public work record and $SQK.

Mining
: What the hamster does: his wheel work completes Squeek blocks, a form of proof of work.

Proof of Squeek
: Squeekchain's staking system for distributing $SQK: rewards go to stakers by power, and a Squeek counts only while deposited. See [Staking](https://docs.squeekchain.com/rewards/staking.md).

Staking
: Depositing Squeeks or staking $SQK so you earn a share of issued $SQK. Staking records your deposited Squeeks, staked $SQK, power, and earned rewards. Unstaking $SQK costs an [exit fee](https://docs.squeekchain.com/start/glossary.md#exit-fee).

Exit fee
: The fee for unstaking $SQK, burned in full. It's 2% when few people are leaving and rises with exit pressure, the share of staked $SQK unstaked over the past week, to 60% when a fifth leaves. Withdrawing Squeeks and claiming rewards are free. See [Unstaking $SQK](https://docs.squeekchain.com/rewards/staking.md#unstaking-sqk).

Issuance
: The $SQK Mining issues under the schedule; Mining funds Staking with all of it. See [Checkpoint](https://docs.squeekchain.com/start/glossary.md#checkpoint).

Power
: What you earn with: the base power of your deposited Squeeks plus the power of your staked $SQK, boosted by those Squeeks. Deposits, withdrawals, stakes, unstakes, and deposited merges change it immediately; your share is your power divided by all power.

Rewards
: The $SQK you earn. Rewards collect in Staking until you claim them; no Squeek holds them.

Reward stream
: How Staking pays out funded $SQK: each funding joins the unreleased balance, and the total streams over the next 20 minutes, shared by power. The stream pauses while no power is staked.

Claim
: A transaction, paid with a network fee, that pays your earned rewards to your wallet or claim recipient.

Claim recipient
: An address you name to receive your claims. While it's set, only that address can claim your rewards.

Unclaimed rewards
: Rewards earned but not yet claimed or restaked. They stay in Staking when you withdraw or transfer a Squeek.

Checkpoint
: An update that processes settled rounds, issues $SQK for their newly completed Squeek blocks after Mining starts, and funds Staking with it.

Hamster proof of work
: Squeekchain's record of accepted wheel-magnet passages.

Work unit
: One accepted magnet passage recorded by the device.

Round
: A ten-minute period that groups measured work. The device saves every round's total, recording rounds missed while stopped as zero.

Squeek block
: One billion earned block units. Settled work earns units at each round's difficulty.

Ethereum block
: A block of Ethereum transactions, separate from Squeek blocks. Later blocks add confirmations to earlier transactions.

## Progress terms

Stages the same work passes through.

Observed
: Measured or estimated from device data; check which source a displayed value uses.

Accepted
: For a passage, counted and saved by the device; for a record, approved by the Oracle as eligible to settle.

Verified
: A record passed the Oracle's checks.

Optimistic / projected
: An estimate assuming pending work is recorded as expected; not settled work or a payment.

Submitted
: Sent to Ethereum and waiting to succeed and gather confirmations.

Settled
: Recorded on Ethereum by `SqueekCore`. Public views also wait for their required confirmations.

Funded
: Issued by a checkpoint and delivered to Staking, ready to stream to stakers.

Claimed
: A completed claim transaction. Check its actual payout; the public view may still be waiting for confirmations.

## Measurement terms

Accepted passage
: A magnet passage that met the device's counting rules and was saved.

Pico
: The microcontroller that passes raw sensor readings to the Pi.

Pi
: The Raspberry Pi that counts accepted passages, saves work, and records completed rounds.

Installation identity
: The identifier for one reporting history from the WHEELY9000. A device can have more than one reporting history.

Counter epoch
: An identifier for one continuous counter history. Compare totals only when the installation and epoch match.

Genesis
: The configured start timestamp for the round schedule.

Active round
: A closed round with positive work.

Quiet round
: An active round with fewer than 40 work units. It earns block progress but doesn't adjust difficulty.

Zero-work round
: A saved round closure with zero accepted passages, including a round missed while the device was stopped. A missing record isn't one.

Closure
: A completed round's record: its start, end, work total, and a hash identifying its saved data.

Telemetry
: Signed measurement records sent from the device to the Oracle.

## Services and contracts

Oracle
: The service that checks signed measurement records and decides which rounds are eligible to settle.

Reporter
: The service that signs permission to settle eligible work in `SqueekCore`.

Relayer
: The address that submits a signed settlement transaction and pays gas, separate from the signer.

`SqueekCore`
: The Ethereum contract that records settled work and counts completed Squeek blocks.

`SqueekMining`
: The contract that issues $SQK for completed Squeek blocks on the schedule and funds `SqueekStaking` with all of it.

`SqueekStaking`
: The contract that holds deposited Squeeks and staked $SQK, tracks power, streams funded $SQK, and pays claims.

Indexer
: A service that reads chain events into queryable views and can rebuild them from those events.

Contract graph
: The set of Squeekchain contracts configured to work together. Its network, addresses, active implementations, and dependencies identify a particular graph, not just one proxy address.

## Technical terms

Certification frontier
: The last round covered by `SqueekCore`'s settled history, including any zero-work gaps.

Difficulty
: The work required for 1,000 Squeek blocks. Each active round uses the current difficulty, then may adjust it for later rounds; idle time never changes it.

Block unit
: One billionth of a Squeek block. The cumulative total keeps each round's work at the price it earned.

Block progress
: Earned block units toward the next Squeek block, always below one billion. It is not a remainder of physical work divided by today's difficulty.

Confirmation-safe
: Chain data with at least 12 confirmations. Deeper Ethereum reorganizations can still change it.

Projection
: A view derived from other records rather than recorded directly. It may show a device's reporting history, an indexed chain view, or an estimate of pending progress.

Canonical
: The accepted history for a particular context. On Ethereum, a reorganization can replace recent history.

Token atom
: The smallest transferable $SQK unit. One $SQK contains `10^18` atoms.

## Related pages

- [Frequently asked questions](https://docs.squeekchain.com/start/faq.md)
- [Rounds and Squeek blocks](https://docs.squeekchain.com/system/rounds-and-blocks.md)
- [How work reaches Ethereum](https://docs.squeekchain.com/system/settlement.md)
- [Checkpoints](https://docs.squeekchain.com/rewards/checkpoints.md)
- [Staking](https://docs.squeekchain.com/rewards/staking.md)
