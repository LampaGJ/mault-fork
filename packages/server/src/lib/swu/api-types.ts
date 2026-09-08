import { z } from "zod";

// Enum values determined from live API inspection
const RarityEnum = z.enum([
  "Common",
  "Uncommon",
  "Rare",
  "Legendary",
  "Special",
]);

const TypeEnum = z.enum(["Base", "Event", "Leader", "Unit", "Upgrade"]);

const AspectEnum = z.enum([
  "Aggression",
  "Command",
  "Cunning",
  "Heroism",
  "Vigilance",
  "Villainy",
]);

// Nested relation structures
const RelationAttribute = z.object({
  name: z.string(),
});

const RelationData = z.object({
  attributes: RelationAttribute,
});

const SimpleRelation = z.object({
  data: RelationData,
});

const SimpleRelationOptional = z.object({
  data: RelationData.nullable().optional(),
}).optional();

const AspectRelation = z.object({
  data: z.array(RelationData),
}).optional();

// expansion has both `name` (e.g. "Spark of Rebellion") and `code` (e.g.
// "SOR") - a separate schema from the plain-`name`-only relations above,
// since z.object() silently strips unrecognized keys and this field was
// missed entirely in an earlier pass (code was never read as a result).
const ExpansionRelation = z.object({
  data: z.object({
    attributes: z.object({
      name: z.string(),
      code: z.string(),
    }),
  }).nullable().optional(),
}).optional();

// Each printing carries its own variantTypes entry (Standard, Standard
// Foil, Hyperspace, Hyperspace Foil, Showcase, Standard/Foil/Serialized
// Prestige, and many promo/prerelease/judge/GC/RQ categories - confirmed
// via live API sampling of Darth Vader's ~50 printings across reprints).
// Some printings (mostly promos) have an empty array.
const VariantTypeAttribute = z.object({
  name: z.string(),
  foil: z.boolean().nullable().optional(),
  variantId: z.string().nullable().optional(),
});

const VariantTypesRelation = z.object({
  data: z.array(z.object({ attributes: VariantTypeAttribute })),
}).optional();

// variantOf/reprintOf: null on a printing's own "root" record, a relation
// object pointing back to that root for every other variant of the same
// printing (see fetchCards in sync.ts - this is no longer used to filter,
// every printing is synced as its own distinct card, but the field is kept
// for potential future grouping/display use).
const NullableSelfRelation = z.object({
  data: z.unknown().nullable(),
}).optional();

// Image format structures
const ImageFormat = z.object({
  url: z.string().url(),
  ext: z.string(),
  name: z.string(),
  size: z.number(),
  width: z.number(),
  height: z.number(),
  hash: z.string(),
  mime: z.string(),
  path: z.nullable(z.string()),
});

const ImageFormats = z.object({
  card: ImageFormat.optional(),
  thumbnail: ImageFormat.optional(),
  xsmall: ImageFormat.optional(),
  xxsmall: ImageFormat.optional(),
  xxxsmall: ImageFormat.optional(),
});

const ImageData = z.object({
  attributes: z.object({
    name: z.string(),
    alternativeText: z.string().nullable().optional(),
    caption: z.nullable(z.string()),
    width: z.number(),
    height: z.number(),
    formats: ImageFormats,
  }),
});

const ImageRelation = z.object({
  data: ImageData.nullable().optional(),
}).optional();

// Main card attributes schema
export const SwuCardAttributes = z.object({
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  cardId: z.string().nullable(),
  cardNumber: z.number(),
  cardCount: z.number(),
  serialCode: z.string(),
  artist: z.string(),
  text: z.string().nullable().optional(),
  deployBox: z.string().nullable().optional(),
  epicAction: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  hp: z.number().nullable().optional(),
  power: z.number().nullable().optional(),
  unique: z.boolean(),
  hyperspace: z.boolean(),
  showcase: z.boolean().nullable().optional(),
  hasFoil: z.boolean(),
  type: SimpleRelation,
  type2: SimpleRelationOptional,
  rarity: SimpleRelation,
  aspects: AspectRelation,
  artFront: ImageRelation,
  artBack: ImageRelation,
  expansion: ExpansionRelation,
  variantTypes: VariantTypesRelation,
  variantOf: NullableSelfRelation,
  reprintOf: NullableSelfRelation,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  locale: z.string(),
});

// Full card response
export const SwuCard = z.object({
  id: z.number(),
  attributes: SwuCardAttributes,
});

const Pagination = z.object({
  page: z.number(),
  pageSize: z.number(),
  pageCount: z.number(),
  total: z.number(),
});

// API response for card-list
export const SwuCardListResponse = z.object({
  data: z.array(SwuCard),
  meta: z.object({ pagination: Pagination }).optional(),
});

export type SwuCardAttributes = z.infer<typeof SwuCardAttributes>;
export type SwuCard = z.infer<typeof SwuCard>;
export type SwuCardListResponse = z.infer<typeof SwuCardListResponse>;
