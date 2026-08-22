import { setTimeout as delay } from "node:timers/promises";
import type { ZpdfClient, StatusResult } from "./api-client.js";
import { ZpdfError } from "./errors.js";

const OK = new Set(["succeeded", "completed"]);
const FAILED = new Set(["failed", "cancelled"]);

// SSE fast-wait is temporarily disabled: completion is only detected by
// polling status (1~3 s interval, matching the ZhiyiPDF API guidance).
export async function pollUntilComplete(
  client: ZpdfClient,
  taskId: string,
  options: { pollIntervalMs: number; maxPollMinutes: number; signal?: AbortSignal; onProgress?: (message: string) => void },
): Promise<StatusResult> {
  const deadline = Date.now() + options.maxPollMinutes * 60_000;
  while (true) {
    if (options.signal?.aborted === true) throw new ZpdfError("client_aborted");
    if (Date.now() > deadline) throw new ZpdfError("client_polling_timeout");
    const result = await client.getStatus(taskId, options.signal);
    if (OK.has(result.status)) return result;
    if (FAILED.has(result.status)) throw new ZpdfError(result.error_code ?? "api_task_error", { message: result.message ?? `Task ${taskId} failed.` });
    const ahead = result.queue_info?.ahead_tasks;
    options.onProgress?.(ahead === undefined ? `Task ${taskId}: ${result.status}` : `Task ${taskId}: ${result.status} (${ahead} ahead)`);
    await delay(options.pollIntervalMs, undefined, { signal: options.signal }).catch((error) => { throw new ZpdfError("client_aborted", { cause: error }); });
  }
}