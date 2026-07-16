import { createTRPCReact } from "@trpc/react-query";
import type { AnyRouter } from "@trpc/server";

export const trpc = createTRPCReact<AnyRouter>();
