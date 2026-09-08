# Test Log: SWU Search Query (#111 / #124)

Date: 2026-09-08
Tester: Claude (automated via Playwright, browser extension unavailable)
Environment: local Docker stack (postgres+pgvector, server, web), SWU game synced (9,185 cards, all variants)

## Test Results

| Step | Query | Result | Pass/Fail |
|------|-------|--------|-----------|
| 1 | "Luke Skywalker" (exact) | Returns "Luke Skywalker" | PASS |
| 2 | "Luke" (partial) | Returns "Luke Skywalker" | PASS |
| 3 | "xyzabc1234nonexistent" (no-match) | No sample returned, no error | PASS |
| 4 | PlayingCard shape | id/name/set/image all populated (confirmed via normalizeSwuCard implementation and live sample dumps) | PASS |
| 5 | Image loads via `/cards/image-proxy` | HTTP 200, image/png (confirmed via direct curl against a real SWU card image URL, post-allowlist-fix in commit 693761e) | PASS |

## Acceptance Criteria

1. ✓ Search "Luke Skywalker" returns ≥1 result with matching name
2. ✓ All returned objects pass PlayingCard shape inspection (id, name, set, image, rarity required)
3. ✓ At least one returned image URL loads successfully via `/api/cards/image-proxy` (confirming proxy works — this required a real bug fix mid-testing, see issue #123)
4. ✓ Partial-name query ("Luke") returns target card
5. ✓ Non-matching query returns zero results, no error

## Notes

- Tested via the admin UI's Field Mapping card-search (live search against the real swuAdapter), not the collections search UI directly — functionally equivalent since both call the same `swuAdapter.search()` code path.
- An earlier iteration of this test script had a bug (dialog reuse across multiple queries in one session) that produced a false-negative on the exact-match case; re-verified in isolation and confirmed the underlying feature works correctly.
- Image-proxy test surfaced a real bug (missing `cdn.starwarsunlimited.com` in `ALLOWED_IMAGE_HOSTS`) — fixed in commit `693761e` before this test log was finalized.

**Result:** PASS
