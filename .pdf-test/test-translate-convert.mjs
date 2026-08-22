import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

const key = "liusen12749";
const base = "https://www.zhiyipdf.com";
const pdfPath = "D:/code/work-relate/dsh-zpdf/.pdf-test/input.pdf";
const mdPath = "D:/code/work-relate/dsh-zpdf/.pdf-test/result/extracted/input.md";
const outDir = "D:/code/work-relate/dsh-zpdf/.pdf-test/result";
mkdirSync(outDir, { recursive: true });

async function submit(path, extraFields) {
  const bytes = readFileSync(path);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), basename(path));
  for (const [k, v] of Object.entries(extraFields)) {
    form.append(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const res = await fetch(`${base}/api/pdf-to-markdown-proxy/parse`, { method: "HEAD" }).catch(() => null); // no-op, keeps base referenced
  void res;
  const pres = await fetch(`${base}/api/pdf-to-markdown-proxy/parse?api_key=${key}`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: form,
  }).catch(() => null);
  // NOTE: real submit is done by the caller-provided endpoint below; this helper is replaced per endpoint.
  throw new Error("submit helper not used");
}

async function upload(endpoint, path, fields) {
  const bytes = readFileSync(path);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), basename(path));
  for (const [k, v] of Object.entries(fields)) {
    form.append(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const res = await fetch(`${base}${endpoint}?api_key=${key}`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: form,
  });
  const text = await res.text();
  console.log("UPLOAD_STATUS", res.status, "BODY", text.slice(0, 600));
  return JSON.parse(text);
}

async function getStatus(taskId) {
  const res = await fetch(`${base}/api/pdf-to-markdown-proxy/status/${taskId}?api_key=${key}`);
  return res.json();
}

async function poll(taskId, label, maxMs = 5 * 60_000, intervalMs = 2_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const body = await getStatus(taskId);
    console.log(`STATUS[${label}]`, JSON.stringify(body));
    if (body.status === "completed") return body;
    if (body.status === "failed" || body.status === "cancelled") throw new Error(`${label} failed: ${body.message}`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`${label} polling timeout`);
}

async function download(taskId, dest) {
  const res = await fetch(`${base}/api/pdf-to-markdown-proxy/download/${taskId}?api_key=${key}`);
  console.log("DOWNLOAD_STATUS", res.status, "content-type:", res.headers.get("content-type"), "content-length:", res.headers.get("content-length"));
  if (!res.ok) throw new Error(`download failed: ${res.status} ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return { buf, type: res.headers.get("content-type") };
}

function sniff(buf) {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && [0x03, 0x05, 0x07].includes(buf[2] ?? -1)) return "zip";
  if (buf.length >= 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf";
  const head = buf.subarray(0, Math.min(buf.length, 800)).toString("utf8").trimStart().toLowerCase();
  if (head.startsWith("#")) return "md";
  return "unknown";
}

async function runLabel(label, endpoint, path, fields, destBase) {
  console.log(`===== ${label} =====`);
  const body = await upload(endpoint, path, fields);
  if (body.success !== true) throw new Error(`${label} returned failure: ${JSON.stringify(body)}`);
  const taskId = body.task_id;
  console.log("TASK_ID", taskId, "POINTS_DEDUCTED", body.points_deducted, "REMAINING", body.remaining_points);
  const done = await poll(taskId, label);
  const raw = await download(taskId, `${outDir}/${destBase}.bin`);
  const kind = sniff(raw.buf);
  console.log(`RESULT_KIND[${label}]`, kind, "bytes:", raw.buf.length);
  const ext = kind === "zip" ? ".zip" : kind === "pdf" ? ".pdf" : kind === "md" ? ".md" : ".bin";
  const target = `${outDir}/${destBase}${ext}`;
  writeFileSync(target, raw.buf);
  console.log(`SAVED[${label}]`, target);
  if (kind === "md") console.log("MD_PREVIEW", raw.buf.subarray(0, 300).toString("utf8"));
  return { taskId, kind, target };
}

async function main() {
  // --- translate-pdf ---
  const tr = await runLabel(
    "TRANSLATE",
    "/api/pdf-to-markdown-proxy/translate-pdf",
    pdfPath,
    { source_language: "en", target_language: "zh", layout_modes: "translated_only", enable_image_translation: false, enable_table_translation: false },
    "translated",
  );

  // --- convert ---
  const cv = await runLabel(
    "CONVERT",
    "/api/pdf-to-markdown-proxy/convert",
    mdPath,
    { target_format: "word" },
    "converted",
  );

  console.log("===== SUMMARY =====");
  console.log("translate:", JSON.stringify(tr));
  console.log("convert:", JSON.stringify(cv));
}

main().catch((e) => { console.error("SCRIPT_ERROR", e.message); process.exit(1); });