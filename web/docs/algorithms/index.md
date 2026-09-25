# Ranking algorithms

Feed order is a contract. The four built-ins are Reddit's, implemented exactly per
the published `_sorts.pyx`, not reinvented.

## Full interface

```solidity
function rank(address viewer, uint256[] calldata candidateIds)
    external view
    returns (uint256[] memory orderedIds, uint256[] memory scores);

function name() external view returns (string memory);
function description() external view returns (string memory);
```

The client supplies a set of candidates and a viewer. You return **exactly those
ids** in your order, with a score for each. That's it.

## Four rules

1. **`rank` is `view`.** Clients call it with `eth_call`.
2. **Never revert, for any input.** A revert reaches the reader as a blank feed,
   with no explanation. Nonexistent ids, empty arrays, zero address: all normal
   and must return.
3. **Two arrays of equal length.** `scores[i]` corresponds to `orderedIds[i]`.
4. **Answer within ~4 seconds.** Past the deadline the client falls back to
   unranked order.

## Registry and slots

`AlgorithmRegistry` holds the algorithm list and default slots:

```solidity
uint8 public constant SLOT_FEED = 0;      // main feed
uint8 public constant SLOT_EXPLORE = 1;   // second slot

function register(IFeedAlgorithm algo) external returns (uint256 id);
function algorithmOf(address user, uint8 slot) external view returns (address);
function setMyAlgorithm(uint8 slot, uint256 id) external;
```

- `register` **requires no permission**. There is no admin function; no one can
  remove your algorithm.
- `algorithmOf(user, slot)` returns the algorithm an account has set, or the slot
  default if unset. Zero address reads the default, so guests still get a feed.
- `setMyAlgorithm` only changes it for your account.

| Slot | Default |
|---|---|
| `SLOT_FEED` | **Hot** |
| `SLOT_EXPLORE` | **Best** |

Four algorithms:

- [Hot](/algorithms/hot) — default, has a time factor.
- [Best](/algorithms/best) — Wilson score, asks "how sure are we".
- [Controversial](/algorithms/controversial) — divisive posts.
- [Chrono](/algorithms/chrono) — newest first, no ranking at all.

Want to write your own: [Writing your own algorithm](/algorithms/writing).
