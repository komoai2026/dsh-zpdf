import type { Context } from "@deepseek-ai/cordis";
import { Config, SETTINGS_NAMESPACE, type Config as PluginConfig } from "./config.js";
import { registerZpdfHostApi } from "./host-api.js";
import { registerZpdfTools } from "./tools.js";

export const name = "zpdf";
export { Config } from "./config.js";
export const inject = ["tools", "systemPrompt"];

export function apply(ctx: Context, config: PluginConfig): void {
  // If settings service is available, mark auto: false since ZPDF provides its own custom UI section
  ctx.inject(["settings"], (innerCtx) => {
    innerCtx.effect(() => {
      const settings = (innerCtx as { settings?: { configure?: (opts: { auto: boolean }, owner?: unknown) => () => void } }).settings;
      const dispose = settings?.configure?.({ auto: false }, ctx.fiber);
      return () => {
        dispose?.();
      };
    });
  });

  ctx.systemPrompt.section({
    name: "tool:zpdf",
    order: 115,
    text: "Use the ZPDF tools for high-fidelity PDF parsing, layout-preserving PDF translation, Markdown document conversion, cost estimates, and balance checks. When a tool says the API key is missing, tell the user to open Settings → ZPDF or run `dsh plugin --profile web exec zpdf -- config set-key`; never ask them to paste a secret into chat unless they explicitly choose to.",
  });

  registerZpdfTools(ctx, () => config);
  registerZpdfHostApi(ctx, () => config);
}

export { SETTINGS_NAMESPACE } from "./config.js";
export type { Config as PluginConfig, ResolvedConfig } from "./config.js";
export { ZpdfClient } from "./api-client.js";
export { ZpdfError } from "./errors.js";
