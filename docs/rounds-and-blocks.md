> Documentation index: https://docs.squeekchain.com/llms.txt. Use it to find every page.

# Rounds and Squeek blocks

> Ten-minute rounds, work-derived Squeek blocks, and Ethereum blocks are different units.

Web version: https://docs.squeekchain.com/system/rounds-and-blocks/

## TL;DR

- Rounds group measured work into ten-minute intervals.
- Squeek blocks count earned progress; the work needed adapts to active rounds rather than elapsed time.
- Ethereum blocks contain transactions; they're different from both Squeek blocks and rounds.

## Why are there three different units?

Rounds measure time, Squeek blocks measure work progress, and Ethereum blocks hold transactions. A ten-minute round can contain any amount of accepted work, including none. Squeek blocks complete only when settled work earns enough progress, and one Ethereum transaction can complete several of them.

| Clock | Unit | Advances when |
|---|---|---|
| Round | 600 seconds | Time passes from the configured start time |
| Squeek block | One billion earned block units | Settled work earns enough progress at its round's difficulty |
| Ethereum block | One chain block | Ethereum produces another block |

Use rounds for activity over time, Squeek blocks for work progress, and Ethereum blocks to locate transactions and count confirmations.

## How it works

The Pi groups accepted passages into rounds from the configured start time and saves each completed round, including rounds with no work. `SqueekCore` records the physical work and the block progress it earns as separate totals.

Core prices each active round at the difficulty set by earlier rounds, then adjusts difficulty for later rounds without repricing progress already earned. Public chain views include a settlement after 12 confirmations. A later checkpoint issues $SQK for completed blocks; [How $SQK is issued](https://docs.squeekchain.com/rewards/creation.md) explains that step.

## Technical detail: rounds and work

### Round boundaries

Round 1 starts at the configured genesis time, and a new round starts every ten minutes. A passage at the boundary belongs to the new round.

The Pi saves each completed round's identity, start and end times, work total, and data hash, including zero-work rounds. After a restart, it closes every round that elapsed while it was stopped as zero-work, because it accepted no passages in them. Hosted services can't divide an unexplained increase in the total into invented round records.

### How work becomes blocks

One billion **block units** complete one Squeek block. Any extra units count toward the next one, while physical work remains a separate total.

Difficulty adapts after sufficiently active rounds so future work completes blocks at a steadier rate. Smaller active rounds still earn progress but don't change difficulty.

Each deployment sets its starting difficulty and the most work one round can accept; [Launch configuration](https://docs.squeekchain.com/developers.md#launch-configuration) lists both for the Sepolia testnet. Zero-work rounds leave cumulative work, block units, and difficulty unchanged, so idle time never lowers difficulty. The [SqueekCore reference](https://docs.squeekchain.com/developers/core.md#price-first-then-steer) gives the exact calculation and how to read the current difficulty.

### Rules and boundaries

- A zero-work record proves no accepted work in that round, not that the wheel was observed.
- A missing record proves nothing about the round; never treat it as zero work.
- `SqueekCore` can certify an elapsed zero-work span without waiting for a later positive round.
- Statistics cannot show exact block-completion times without saved start and completion boundaries.
- `SqueekCore` records work; see [How $SQK is issued](https://docs.squeekchain.com/rewards/creation.md) for reward rules.

### Example

Illustrative, not a launch configuration: at a difficulty of 10,000 work per thousand blocks (10 work per block), a round with 80 work earns eight Squeek blocks of progress. Difficulty then falls for later rounds, so the same work would earn a little more progress next time:

| Quantity | Before settlement | After settlement |
| --- | ---: | ---: |
| Cumulative physical work | 17 | 97 |
| Completed Squeek blocks | 1 | 9 |
| Work per thousand blocks | 10,000 | 9,733 |

## Related pages

- [Measuring wheel activity](https://docs.squeekchain.com/system/measurement.md)
- [How work reaches Ethereum](https://docs.squeekchain.com/system/settlement.md)
- [SqueekCore](https://docs.squeekchain.com/developers/core.md)
- [How $SQK is issued](https://docs.squeekchain.com/rewards/creation.md)
