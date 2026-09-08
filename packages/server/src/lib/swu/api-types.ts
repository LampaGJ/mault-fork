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

// variantOf/reprintOf: null on a canonical printing, a relation object on a
// variant/reprint. Only presence-of-null matters for canonicalization
// filtering (see fetchCards in sync.ts) - the nested shape isn't consumed.
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
  hasFoil: z.boolean(),
  type: SimpleRelation,
  type2: SimpleRelationOptional,
  rarity: SimpleRelation,
  aspects: AspectRelation,
  artFront: ImageRelation,
  artBack: ImageRelation,
  expansion: SimpleRelationOptional,
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
