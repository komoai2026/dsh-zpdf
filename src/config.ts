import z from "@deepseek-ai/schemastery";
import { DEFAULT_API_KEY_ENV, validateApiKey } from "./constants.js";

export { DEFAULT_API_KEY_ENV, SETTINGS_NAMESPACE, validateApiKey } from "./constants.js";

export interface Config {
  apiKey?: string;
  apiKeyEnv?: string;
  baseUrl?: string;
  outputDir?: string;
  pollIntervalMs?: number;
  maxPollMinutes?: number;
  httpTimeoutMs?: number;
  uploadTimeoutMs?: number;
}

export interface ResolvedConfig {
  apiKey?: string;
  apiKeyEnv: string;
  baseUrl: string;
  outputDir: string;
  pollIntervalMs: number;
  maxPollMinutes: number;
  httpTimeoutMs: number;
  uploadTimeoutMs: number;
}

export const DEFAULTS = Object.freeze({
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  baseUrl: "https://www.zhiyipdf.com",
  outputDir: "./zpdf-output",
  pollIntervalMs: 2_000,
  maxPollMinutes: 30,
  httpTimeoutMs: 60_000,
  uploadTimeoutMs: 600_000,
});

export const Config = z.object({
  apiKey: z.string().role("secret").volatile(),
  apiKeyEnv: z.string().role("credential-ref").default(DEFAULTS.apiKeyEnv).volatile(),
  baseUrl: z.string().default(DEFAULTS.baseUrl).volatile(),
  outputDir: z.string().default(DEFAULTS.outputDir).volatile(),
  pollIntervalMs: z.number().step(1).min(100).default(DEFAULTS.pollIntervalMs).volatile(),
  maxPollMinutes: z.number().min(1).default(DEFAULTS.maxPollMinutes).volatile(),
  httpTimeoutMs: z.number().step(1).min(1_000).default(DEFAULTS.httpTimeoutMs).volatile(),
  uploadTimeoutMs: z.number().step(1).min(1_000).default(DEFAULTS.uploadTimeoutMs).volatile(),
});

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}

function unwrap<T>(value: T | { get(): T } | undefined): T | undefined {
  if (value !== null && typeof value === "object" && typeof (value as { get?: unknown }).get === "function") {
    return (value as { get(): T }).get();
  }
  return value as T;
}

export function resolveConfig(config: Config, env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const literalKey = unwrap(config.apiKey)?.trim();
  const rawApiKeyEnv = unwrap(config.apiKeyEnv);
  const apiKeyEnv = (typeof rawApiKeyEnv === "string" && rawApiKeyEnv.trim()) || DEFAULTS.apiKeyEnv;
  const environmentKey = env[apiKeyEnv]?.trim();
  const apiKey = literalKey || environmentKey || undefined;
  const rawBaseUrl = unwrap(config.baseUrl);
  const baseUrl = trimTrailingSlash((typeof rawBaseUrl === "string" && rawBaseUrl.trim()) || DEFAULTS.baseUrl);
  const rawOutputDir = unwrap(config.outputDir);
  const outputDir = (typeof rawOutputDir === "string" && rawOutputDir.trim()) || DEFAULTS.outputDir;
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    apiKeyEnv,
    baseUrl,
    outputDir,
    pollIntervalMs: unwrap(config.pollIntervalMs) ?? DEFAULTS.pollIntervalMs,
    maxPollMinutes: unwrap(config.maxPollMinutes) ?? DEFAULTS.maxPollMinutes,
    httpTimeoutMs: unwrap(config.httpTimeoutMs) ?? DEFAULTS.httpTimeoutMs,
    uploadTimeoutMs: unwrap(config.uploadTimeoutMs) ?? DEFAULTS.uploadTimeoutMs,
  };
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 10) return "***";
  return `${apiKey.slice(0, 6)}***${apiKey.slice(-4)}`;
}

export function missingApiKeyMessage(apiKeyEnv = DEFAULT_API_KEY_ENV): string {
  return [
    "ZPDF API key is not configured.",
    "Open DeepSeek Harness Settings → ZPDF and enter the key,",
    "or run `dsh plugin --profile web exec zpdf -- config set-key` in a terminal.",
    `You can also set the ${apiKeyEnv} environment variable.`,
    "Create a key at https://www.zhiyipdf.com/api-keys (Plus/Pro account required).",
  ].join(" ");
}
