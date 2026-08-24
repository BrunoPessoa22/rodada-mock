# Internal — not served

These were reachable at `trading.brunopessoa.com/proposal` and `/mock` with no
link into them from anywhere in the app: orphaned public URLs.

`proposal/` is League Proposal v2 plus the season-economics one-pager. It states
the **Community Incentive Pool (inflation)** funding source, the club rev-share
framing, the 70/30 split and the KOL roster structure — internal commercial
material that must not sit one click away from a URL circulated to partners.

`mock/` is the v0.2 static mock, superseded by the real app.

Moved out of `public/` on 24 Aug 2026 and the `next.config.ts` rewrites removed,
so neither path is served any more.

**Still open:** `BrunoPessoa22/rodada-mock` is a PUBLIC GitHub repo, so these
files remain readable in its history regardless of this move. Closing that means
either making the repo private — which breaks the "scoring is open source" link
on `/regras` and removes Coolify's public-repo deploy source — or rewriting
history. Both are Bruno's call.
