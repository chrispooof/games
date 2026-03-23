import { z } from "zod"

const sourceSchema = z.enum(["nertz", "work", "waste"])
const cardPositionSchema = z.object({ x: z.number(), z: z.number() })

export const nertzGameActionSchema = z.union([
  z.object({
    type: z.literal("play-to-foundation"),
    cardId: z.string(),
    slotIndex: z.number(),
    source: sourceSchema,
    sourceIndex: z.number().optional(),
  }),
  z.object({
    type: z.literal("play-to-work-pile"),
    cardId: z.string(),
    targetPileIndex: z.number(),
    source: sourceSchema,
    sourceIndex: z.number().optional(),
  }),
  z.object({
    type: z.literal("merge-work-piles"),
    sourcePileIndex: z.number(),
    cardId: z.string(),
    targetPileIndex: z.number(),
  }),
  z.object({ type: z.literal("flip-stock") }),
  z.object({
    type: z.literal("move-card"),
    cardId: z.string(),
    position: cardPositionSchema,
  }),
])

export const nertzSetStateSchema = z.object({
  positions: z.record(z.string(), cardPositionSchema),
  pileState: z.object({
    nertzPile: z.array(z.string()),
    workPiles: z.tuple([z.array(z.string()), z.array(z.string()), z.array(z.string()), z.array(z.string())]),
    stock: z.array(z.string()),
    waste: z.array(z.string()),
  }),
})
