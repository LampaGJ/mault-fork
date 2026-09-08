# Star Wars Unlimited (SWU) Field Definitions

This document defines the card fields available for Star Wars Unlimited (SWU) card sorting, filtering, and bin rule configuration.

## Overview

Each field is a card property that can be used in bin rules, card grid sorting, and field-based filtering. Every field maps to a `FieldMeta` object (`packages/shared/src/interfaces/sort-bins.interface.ts:39-46`), which defines:

- **field**: the internal field name (used in rule expressions)
- **label**: human-readable display name
- **type**: one of four values (`FieldType` from `packages/shared/src/interfaces/sort-bins.interface.ts:37`) — `string`, `numeric`, `enum`, or `set`
- **path**: the JSON path to this property in card data (e.g., `properties.rarity`)
- **operators**: applicable comparison operators for this field type (from `packages/web/src/features/games/constants/field-operators.ts:7-48`)
- **options**: for `enum` and `set` types, the valid values a card's field can take

## SWU Card Fields

| Field | Label | Type | Path | Options |
|-------|-------|------|------|---------|
| title | Title | string | properties.title | — |
| subtitle | Subtitle | string | properties.subtitle | — |
| type_name | Card Type | enum | properties.type_name | Leader, Base, Unit, Event, Upgrade, Token Unit, Token Upgrade, Force Token, Credit Token |
| rarity | Rarity | enum | properties.rarity | Common, Uncommon, Rare, Legendary, Special |
| cost | Cost | numeric | properties.cost | — |
| power | Power | numeric | properties.power | — |
| hp | HP | numeric | properties.hp | — |
| upgrade_power | Upgrade Power | numeric | properties.upgrade_power | — |
| upgrade_hp | Upgrade HP | numeric | properties.upgrade_hp | — |
| aspects | Aspects | set | properties.aspects | Vigilance, Command, Aggression, Cunning, Villainy, Heroism |
| expansion_code | Expansion Code | string | properties.expansion_code | — |
| unique | Unique | enum | properties.unique | true, false |

## Field Type Reference

The four field types and their supported operators are defined in `packages/web/src/features/games/constants/field-operators.ts:7-48`:

### String Type
- **Operators**: contains, does not contain, starts with, ends with, equals, does not equal, is empty, is not empty
- **Usage**: title, subtitle, expansion_code
- **Nullability**: nullable fields like `subtitle` support `is empty` / `is not empty` to test for absence

### Numeric Type
- **Operators**: equals, does not equal, greater than, greater than or equal, less than, less than or equal, is unknown, is known
- **Usage**: cost, power, hp, upgrade_power, upgrade_hp
- **Nullability**: numeric fields can be null (e.g., a base has no power/hp); `is unknown` / `is known` test nullability

### Enum Type
- **Operators**: is any of, is none of, equals, does not equal, is empty, is not empty
- **Usage**: type_name, rarity
- **Nullability**: enum fields in the SWU schema are non-nullable
- **Options**: a closed set of string values; rules enforce membership

### Set Type
- **Operators**: contains any of, contains all of, contains none of, is exactly, is not exactly, is empty, is not empty
- **Usage**: aspects
- **Nullability**: a set can be empty (a card with no aspects); `is empty` / `is not empty` test this
- **Options**: a closed set of valid elements; rules can check for the presence/absence of any combination

## Cross-References

### FieldMeta Interface
The shape of a field definition object is defined here:
- **File**: `packages/shared/src/interfaces/sort-bins.interface.ts`
- **Lines**: 37-46 (FieldType type definition) and 39-46 (FieldMeta interface)
- **Key fields**: field (string), label (string), type (FieldType), path (string), operators (array), options (optional array)

### Operator Definitions
The complete mapping of field types to operators is defined here:
- **File**: `packages/web/src/features/games/constants/field-operators.ts`
- **Lines**: 7-48 (DEFAULT_OPERATORS_BY_TYPE)
- **Usage**: each FieldMeta.operators array is populated by looking up the field's type in this table

## Important Caveat: Provisional Paths

⚠️ **The JSON paths listed above are provisional.** They reflect the current SWU schema but will be finalized when issue #104 (sync integration) is complete. At that time, paths are expected to change to match the actual synchronized card data shape in the database.

### Verification Steps

Until #104 is merged:
1. **Do not hardcode the paths above in rule-building code.** Use the dynamic `fieldDefinitions` stored in the `Game` record instead (see CLAUDE.md's "Multi-TCG card search & sync" section).
2. **Verify actual field names and paths** using the Sample Card Browser in the admin UI (`/app/admin`), which displays the real field structure of a sample SWU card as seen after sync.
3. **Post-#104 validation**: After the sync integration is complete, re-run the Sample Card Browser, confirm no field names or paths have changed, and remove this caveat from this document.

## Interacting with Field Definitions Programmatically

Field definitions are stored in the database, not hardcoded:
- Admin UI Games Manager configures them per-game
- Retrieved via the `getGame()` or `getFieldDefinitions()` API endpoints
- Used generically via `getByPath()` in bin rule evaluation (see CLAUDE.md's "Multi-TCG card search & sync" section)

Never hardcode a field name or path in front-end or back-end code — always resolve it dynamically from the stored `fieldDefinitions` array.

## Related Issues

- **#104**: Sync integration finalizing card data schema and field paths
- **#109**: This field definitions documentation (you are here)
