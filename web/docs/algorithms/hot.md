# Hot

Default of `SLOT_FEED`. Taken from Reddit's `_sorts.pyx` (published 2010).

## Formula

```
votes  = weightedLikes / 100        // normalize to whole votes
order  = log10(max(votes, 1))
age    = createdAt - epoch          // epoch = deploy time
score  = order + age / 45 000
```

On chain the score term is a 1e18 integer, but the shape is exactly as above.

## Reading the formula

- **Votes add logarithmically.** The tenth upvote matters far less than the
  first.
- **Time adds linearly.** Every 45,000 seconds (~12.5 hours) adds 1 point.
- Consequence: a post older by 12.5 hours needs **ten times the votes** to hold
  its position. That is exactly what makes Reddit work as we know it: a new post
  can overtake an old one without a higher total vote count.

## Why normalize by 100

`weightOf` returns 0–200. If you feed that number straight into `log10`, the scale
shifts up two rungs and the vote term overwhelms the time term — reversing the
exact behavior the formula was built to produce. So divide `weightedLikes / 100`
first, so **one full like = one vote** like Reddit.

::: warning Don't use `likeCount`
`likeCount` is the raw number; a ring can inflate it. Always use `weightedLikes`.
:::
