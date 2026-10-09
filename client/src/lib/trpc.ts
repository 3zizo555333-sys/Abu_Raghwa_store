import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../server/routers";
import superjson from "superjson";

export const trpc = createTRPCReact<AppRouter>();
