# Notifications

The bell in the header tells you what happened since you last looked. Nothing
is stored on a server: replies and votes are already on chain, and a
notification is a **view** of them. Your settings and your read marker live on
your own device and are never sent anywhere.

## What can notify

| | Default | Options |
|---|---|---|
| **Replies** — someone answers your post or comment | On | On / Off |
| **Votes** — someone likes or dislikes what you wrote | 1 vote+ | Off / 1 vote+ / All |
| **Community posts** — someone posts in a community you are in | Hot | Off / Hot / All |

The thresholds are the same 100-point scale karma uses:

- A **vote** counts as "1 vote+" when its weight is at least **100** — one whole
  vote. A fresh account's like weighs 1 and is not news.
- A community post is **Hot** once it has earned at least one whole vote (**100**
  weighted likes). **All** tells you about every post, which is a lot.

## Where the settings are

- **Yours** — open the bell and press the gear. Replies and votes.
- **A community's** — on that community's own page, beside **Join/Leave**. A
  member sees an **Off / Hot / All** control there, so a busy community can be
  **Hot** while a quiet one is **All** without one long list in the bell.

Changes are saved in the browser, not on chain and not on the server. Clearing
site data resets them to the defaults.

## On your phone and desktop

Turn on **Push notifications** under the bell's settings to get these as system
notifications even with the site closed. The browser asks once; after that the
indexer sends them directly, following the same preferences — what you muted
stays muted.

- **Desktop** (Chrome, Edge, Firefox, Safari): works as-is.
- **Android**: works in Chrome.
- **iPhone**: iOS only delivers web push to a site added to the **Home Screen**
  (Share → Add to Home Screen). Open it from there and enable once.

Turning it off removes this browser's subscription.

## Reading

The bell counts what landed after the last time you opened it. Opening it marks
everything read. That marker is also per device — a second browser starts
caught up.
