// Reproduce the real profile composition WITHOUT touching the live profile:
// host DSH dependencies + the workspace plugin as separate module copies.
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dshRoot = process.env.DSH_ROOT || "/home/dacongda/.nvm/versions/node/v25.3.0/lib/node_modules/@deepseek-ai/dsh";

const hostRequire = createRequire(join(dshRoot, "package.json"));
const hostImport = (id) => import(pathToFileURL(hostRequire.resolve(id)).href);

const [cordis, SystemPrompt, ToolRuntime] = await Promise.all([
  hostImport("@deepseek-ai/cordis"),
  hostImport("@deepseek-ai/dsh-system-prompt"),
  hostImport("@deepseek-ai/dsh-tools"),
]);
const { Context } = cordis;

const plugin = await import(new URL("../lib/index.js", import.meta.url).href);
const ctx = new Context();
// Credential seam: GUI settings page writes through this reference. Verify
// tools resolve the key from it (instead of failing with the missing-key
// prompt). Real network fails afterwards, which still proves resolution.
ctx.provide("credentials", {
  resolve: async () => ({ value: "sk-mock-credential" }),
});
ctx.provide("settings", {
  configure: () => () => {},
});
const fibers = [
  await ctx.plugin(SystemPrompt.default, {}),
  await ctx.plugin(ToolRuntime.default, {}),
  await ctx.plugin(plugin, {}),
];
const names = ctx.tools.schemas().map((t) => t.name);
const balance = await ctx.tools.execute({
  callId: "mix-test-1",
  name: "zpdf_check_balance",
  arguments: {},
  signal: new AbortController().signal,
});
const resolvedFromCredentials = balance.isError && !String(balance.error.message).includes("not configured");
console.log(JSON.stringify({ ok: true, tools: names, resolvedFromCredentials }));
for (const fiber of fibers.reverse()) await fiber.dispose();
