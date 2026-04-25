import { createApiRequestHandler } from "./server.ts";

const port = Number(process.env.PORT ?? "3000");

Bun.serve({
  port,
  fetch: createApiRequestHandler(),
});

console.log(`TradeAI API listening on http://localhost:${port}`);

