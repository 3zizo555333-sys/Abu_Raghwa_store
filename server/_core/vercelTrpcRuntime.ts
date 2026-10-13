import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../routers";
import { createFetchContext } from "./fetchContext";

export { fetchRequestHandler, appRouter, createFetchContext };
