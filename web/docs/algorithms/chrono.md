# Chrono (New)

Reverse-chronological feed. **No ranking, no filtering, no opinion** — the baseline
for comparing the other algorithms.

## Formula

```
score = createdAt        // unix seconds
```

Sorts descending, so newest first. Nonexistent ids have `createdAt = 0` and sink
to the bottom on their own without reverting.

In the app the contract is named **Chrono** but the selector shows **New** — the
word every feed has used. The contract's real name still shows in the source view.
