---
type: spec
---

# Add Star Wars Unlimited Support to Mault

## Summary

Add Star Wars Unlimited (SWU) as a supported TCG game to mault's card scanner and sorter. SWU uses a similar card structure to existing supported games (Gundam, Pokémon, etc.) with distinct field properties (aspect, cost, rarity, set). The project has reference implementation and data pipeline at `../swu-labels/` demonstrating the SWU admin API and card schema.

## Non-goals

- Pricing data integration (SWU does not have a standard pricing API like Scryfall)
- Migration of existing collections from other systems
- Support for non-English card variants (initial implementation English-only)

## Items

### Epic: Star Wars Unlimited Card Search & Sync Infrastructure

#### Search Adapter Implementation (`packages/server/src/lib/swu/search.ts`)

**Goal:** Implement `CardSearchAdapter` for Star Wars Unlimited using the official admin API.

**Affected files:**
- Create `packages/server/src/lib/swu/search.ts`
- Update `packages/server/src/lib/card-search/resolve.ts` (register adapter)

**Approach:**
- Parse SWU admin API response shape (reference: `../swu-labels/src/api-schema.ts`)
- Normalize to `PlayingCard` interface (matching existing Gundam/Pokémon adapters)
- Field mapping: `title` → `name`, `rarity` → `rarity`, `costValue` → `cmc`, `aspectIcon` → extract color/aspect into `colorIdentity`
- Use per-printing ID (`uniqueId` field) for card disambiguation, not card name
- Implement `Search(query: string)` and `SearchById(id: string)` exports
- Wrap with `withCache` and `withErrorHandling` when registering

**Acceptance criteria:**
- Search returns up to 60 cards matching query
- SearchById returns single card by uniqueId
- All returned cards normalize to `PlayingCard` schema with no required fields undefined
- Image URLs are correctly proxied via `/api/cards/image-proxy`
- Type checking passes (`tsc -b`)

#### Sync Source Implementation (`packages/server/src/lib/swu/sync.ts`)

**Goal:** Implement `SyncSource` for bulk card fetch and vectorization.

**Affected files:**
- Create `packages/server/src/lib/swu/sync.ts`
- Update `packages/server/src/lib/sync-job.ts` (register sync source)

**Approach:**
- Paginate through `https://admin.starwarsunlimited.com/api/card-list` (reference: `../swu-labels/src/ingest.ts`)
- Filter to canonical printings only (`variantOf === null && reprintOf === null`)
- Yield `SyncSourceCard[]` with `id`, `name`, `setCode`, `imageUrl` from each page
- Implement both `fetchCards` (full catalog with progress logging) and `fetchOne` (single card by ID)
- Match Gundam's pagination style (limit 250 per page)

**Acceptance criteria:**
- Full sync fetches 1000+ cards without error
- Progress logging emits every 250 cards
- Single-card fetch by ID returns correct card or null
- All card images are accessible via imageUrl
- Type checking passes

#### Adapter Registration

**Goal:** Wire SWU adapter into card-search and sync-job resolution tables.

**Affected files:**
- `packages/server/src/lib/card-search/resolve.ts`
- `packages/server/src/lib/sync-job.ts`

**Approach:**
- Add `swu: withCache(withErrorHandling(swuAdapter))` to `ADAPTERS_BY_GAME_KEY`
- Add `swu: swuSyncSource` to `SYNC_SOURCES`
- Import both adapters from their respective files

**Acceptance criteria:**
- Search endpoint can resolve to SWU adapter when game key is 'swu'
- Sync job can resolve to SWU sync source when game key is 'swu'
- Type checking passes

---

### Epic: Star Wars Unlimited Game Setup & Field Definitions

#### Create SWU Game Record & Field Definitions Schema

**Goal:** Define admin-configurable bin-rule field schema for SWU, matching Gundam/MTG patterns.

**Affected files:**
- `packages/server/src/db/schema.ts` (reference only — documents expected schema)
- Admin UI game creation flow (reference only)

**Approach:**
- Document the field definitions structure for SWU (aspect, cost, rarity, set, cardType, etc.)
- Ensure fields align with `PlayingCard` normalized shape and standard field-path resolution
- Seed/document example `fieldDefinitions` JSON for SWU (similar to existing games)
- No code changes needed — field definitions are created in the admin UI at runtime, not seeded

**Acceptance criteria:**
- Field definitions document is clear on which SWU-specific fields are available for sorting/filtering/binning
- Example shows valid JSON structure matching `FieldMeta[]` type from shared
- Includes at least: aspect, cost, rarity, set, collector number

#### Add SWU Game via Admin UI

**Goal:** Create the SWU `Game` record in the database via the platform Games Manager.

**Affected files:**
- Database `games` table (insert via admin UI, not code)

**Approach:**
- Use `/app/admin` Games Manager interface to create new game
- Set `key: 'swu'`, `name: 'Star Wars Unlimited'`
- Provide `apiDocsUrl` pointing to SWU admin documentation
- Configure `fieldDefinitions` matching schema defined above
- Sync the game's card catalog (full `fetchCards` run)

**Acceptance criteria:**
- SWU game appears in Games Manager listing
- Can scan and identify a real SWU card via the search adapter
- Collection creation flow allows selection of SWU as game type

---

### Epic: Testing & Verification

#### Integration Test: Search Query

**Goal:** Verify search adapter returns correctly normalized cards.

**Affected files:**
- Manual test (no new test file needed initially)

**Approach:**
- Query for a known SWU card by name (e.g., "Luke Skywalker")
- Verify response contains at least one `PlayingCard` with correct `id`, `name`, `set`, `image`
- Spot-check `colorIdentity`/`aspect` normalization
- Confirm image proxy URL is well-formed

**Acceptance criteria:**
- Search for known card returns results
- Returned cards have all required `PlayingCard` fields populated
- Image URLs load when accessed via `/api/cards/image-proxy`

#### Integration Test: SearchById

**Goal:** Verify single-card lookup by uniqueId.

**Affected files:**
- Manual test

**Approach:**
- From search results, extract a valid card ID
- Call SearchById with that ID
- Verify returned card matches what search returned
- Test with invalid ID and confirm proper 404/not-found handling

**Acceptance criteria:**
- Valid ID returns exact card
- Invalid ID returns error result with `success: false`
- Error message is descriptive

#### Integration Test: Full Sync

**Goal:** Verify sync job completes without error and vectorizes cards.

**Affected files:**
- Admin UI sync monitor

**Approach:**
- Via admin UI, trigger sync for SWU game
- Monitor progress stream for errors
- Confirm final count is reasonable (1000+ cards)
- Spot-check a few cards are in the `cards` table post-sync

**Acceptance criteria:**
- Sync completes without crashing
- No vectorization errors
- Card count ≥ 1000
- Cards are queryable by embedding search

#### Scanning Test: End-to-End

**Goal:** Verify real SWU card can be scanned, identified, and routed.

**Affected files:**
- Manual integration test

**Approach:**
- With SWU collection and bins configured, physically scan a SWU card
- Confirm card image is captured and embedded
- Verify card is identified correctly via search adapter
- Confirm bin routing executes without error

**Acceptance criteria:**
- Card is identified within 3 scans
- Matching card name appears in history
- Servo routing completes (physical or mock)

---

## Edit Plan (final task breakdown)

1. **Search adapter** — implement `swu/search.ts`, export normalized `Search` and `SearchById` functions, verify with manual query
2. **Sync source** — implement `swu/sync.ts`, export `SyncSource` with `fetchCards` and `fetchOne`, verify pagination works
3. **Adapter registration** — wire both adapters into `resolve.ts` and `sync-job.ts`, verify type checking
4. **Field definitions** — document SWU field schema, provide example config
5. **Game creation** — create SWU game record via admin UI with field definitions
6. **Integration tests** — run manual scan tests (search, searchById, full sync, end-to-end scanning)
