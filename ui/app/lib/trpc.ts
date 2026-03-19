import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "@games/api"

/**
 * Typed tRPC React client.
 * Use `trpc.<router>.<procedure>.useQuery/useMutation` in components.
 */
export const trpc = createTRPCReact<AppRouter>()
