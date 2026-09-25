# Best

Default of `SLOT_EXPLORE`. It is the **lower bound of the Wilson confidence
interval**.

## Formula

```
p     = ups / n,   n = ups + downs
lower = (p + z²/2n − z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n)
```

with `ups = weightedLikes / 100`, `downs = weightedDislikes / 100`, and
`z = 1.281551565545` — that is **80% confidence**, the exact number Reddit uses,
not 95% as many write-ups still copy.

## Reading the formula

It asks **"how sure are we"**, not "what's the average".

- 2 likes, 0 dislikes looks perfect but is nearly meaningless — the sample is too
  small.
- 900 likes, 50 dislikes has a worse ratio but is **far better evidence**.

A plain average would rank the first above; Wilson does not. That is how a new
post with one upvote does not jump to the top just because no one has objected
yet.

The implementation here is verified to match Reddit's results within 0.5% error.
