// Vercel packages API entrypoints separately. Load the self-contained bundle
// created by the project build to avoid Node ESM extensionless-import failures.
// @ts-expect-error This generated module is created by build:api-runtime.
import api from "../dist/api-index.mjs";

export default api;
