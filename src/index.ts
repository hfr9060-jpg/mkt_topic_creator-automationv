import type { Env } from "./config/env";
import { handleRequest } from "./router";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  }
};
