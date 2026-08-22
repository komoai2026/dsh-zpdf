import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { randomUUID } from "node:crypto";

const key = "liusen12749";
const base = "https://www.zhiyipdf.com";
const pdfPath = "D:/code/work-relate/dsh-zpdf/.pdf-test/input.pdf";
const outDir = "D:/code/work-relate/dsh-zpdf/.pdf-test/result";

mkdirSync(outDir, { recursive: true });

async function postParse() {
  const bytes = readFileSync(pdfPath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), basename(pdfPath));
  form.append("table_mode", "markdown");
  form.append("formula_format", "dollar");
  form.append("enable_translation", "false");
  form.append("images_as_url", "false");
  const res = await fetch(`${base}/api/pdf-to-markdown-proxy/parse?api_key=${key}`, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: form,
  });
  const text = await res.text();
  console.log("PARSE_STATUS", res.status);
  console.log("PARSE_BODY", text);
  return JSON.parse(text);
}

async function getStatus(taskId) {
  const res = await fetch(`${base}/api/pdf-to-markdown-proxy/status/${taskId}?api_key=${key}`);
  return res.json();
}

async function poll(taskId, maxMs = 5 * 60_000, intervalMs = 2_000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const body = await getStatus(taskId);
    console.log("STATUS", JSON.stringify(body));
    if (body.status === "completed") return body;
    if (body.status === "failed" || body.status === "cancelled") throw new Error("task failed: " + body.message);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("polling timeout");
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

async function main() {
  const parse = await postParse();
  if (parse.success !== true) throw new Error("parse returned failure: " + JSON.stringify(parse));
  const taskId = parse.task_id;
  console.log("TASK_ID", taskId);
  console.log("POINTS_DEDUCTED", parse.points_deducted, "REMAINING", parse.remaining_points);
  const done = await poll(taskId);
  console.log("DONE", JSON.stringify(done));
  const raw = await download(taskId, `${outDir}/result.bin`);
  const kind = sniff(raw.buf);
  console.log("RESULT_KIND", kind, "bytes:", raw.buf.length);
  if (kind === "zip") {
    writeFileSync(`${outDir}/result.zip`, raw.buf);
    console.log("ZIP_SAVED", `${outDir}/result.zip`);
  } else if (kind === "pdf") {
    writeFileSync(`${outDir}/result.pdf`, raw.buf);
    console.log("PDF_SAVED", `${outDir}/result.pdf`);
  } else if (kind === "md") {
    writeFileSync(`${outDir}/result.md`, raw.buf);
    console.log("MD_SAVED", `${outDir}/result.md`);
    console.log("MD_PREVIEW", raw.buf.subarray(0, 400).toString("utf8"));
  } else {
    writeFileSync(`${outDir}/result.bin`, raw.buf);
    console.log("BIN_SAVED", `${outDir}/result.bin`);
  }
}

main().catch((e) => { console.error("SCRIPT_ERROR", e.message); process.exit(1); });