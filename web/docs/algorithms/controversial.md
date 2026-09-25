# Controversial

Divisive posts. Taken from Reddit's `_sorts.pyx`.

## Formula

```
balance   = min(ups, downs) / max(ups, downs)
magnitude = ups + downs
score     = magnitude ^ balance
```

If one side is 0, the score is 0: **agreement is not controversy**, however
large.

## Why it exists

Every other algorithm here surfaces what people **agree** on. This one surfaces
what people are **divided** on — content an engagement-optimizing feed would never
show you, because disagreement doesn't retain readers.

## Implementation note

Exponentiation with a fractional exponent is very gas-expensive, so this version
uses the **shape** instead of the exact power: `magnitude` times `balance²`. The
order it produces matches Reddit for every pair where the two sides differ by more
than rounding.

Uses `weightedLikes` and `weightedDislikes` divided by 100, like every other
algorithm.
