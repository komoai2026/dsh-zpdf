export interface ZpdfErrorOptions {
  message?: string;
  httpStatus?: number | null;
  remediation?: string;
  pointsRequired?: number;
  currentPoints?: number;
  cause?: unknown;
}

const SPECS: Record<string, { message: string; remediation: string; httpStatus: number | null }> = {
  invalid_api_key: {
    message: "API key is missing or invalid.",
    remediation: "Configure it in Settings → ZPDF or run `dsh plugin --profile web exec zpdf -- config set-key`.",
    httpStatus: 401,
  },
  insufficient_points: {
    message: "Not enough ZPDF credits.",
    remediation: "Top up at https://www.zhiyipdf.com/subscription.",
    httpStatus: 402,
  },
  parse_file_too_large: { message: "PDF exceeds 300 MB.", remediation: "Split the PDF locally.", httpStatus: 400 },
  parse_page_limit_exceeded: { message: "PDF exceeds 800 pages.", remediation: "Split the PDF locally.", httpStatus: 400 },
  translate_pdf_file_too_large: { message: "PDF exceeds 300 MB.", remediation: "Split the PDF locally.", httpStatus: 400 },
  translate_pdf_page_limit_exceeded: { message: "PDF exceeds 800 pages.", remediation: "Split the PDF locally.", httpStatus: 400 },
  convert_file_too_large: { message: "File exceeds 300 MB.", remediation: "Reduce the file size.", httpStatus: 400 },
  convert_file_type_unsupported: { message: "File must be .md, .markdown, or .zip.", remediation: "Convert the source to Markdown first.", httpStatus: 400 },
  client_polling_timeout: { message: "ZPDF polling timed out locally.", remediation: "The task may still be running; inspect it with zpdf_get_task_status.", httpStatus: null },
  client_download_too_large: { message: "ZPDF result download exceeds the plugin size limit.", remediation: "Choose a smaller document or download the result manually.", httpStatus: null },
  client_extract_failed: { message: "The downloaded ZIP could not be extracted.", remediation: "Check the output directory and available disk space.", httpStatus: null },
  client_aborted: { message: "ZPDF operation was cancelled.", remediation: "Run the operation again if needed.", httpStatus: null },
  api_task_error: { message: "ZPDF task failed.", remediation: "Retry; if it persists, contact ZPDF support.", httpStatus: 500 },
};

const FALLBACK = { message: "ZPDF request failed.", remediation: "Retry; if it persists, contact ZPDF support.", httpStatus: null };

export class ZpdfError extends Error {
  readonly code: string;
  readonly httpStatus: number | null;
  readonly remediation: string;
  readonly pointsRequired: number | undefined;
  readonly currentPoints: number | undefined;

  constructor(code: string, options: ZpdfErrorOptions = {}) {
    const spec = SPECS[code] ?? FALLBACK;
    const message = options.message ?? spec.message;
    const remediation = options.remediation ?? spec.remediation;
    super(remediation.length === 0 ? message : `${message} ${remediation}`, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ZpdfError";
    this.code = code;
    this.httpStatus = options.httpStatus === undefined ? spec.httpStatus : options.httpStatus;
    this.remediation = remediation;
    this.pointsRequired = options.pointsRequired;
    this.currentPoints = options.currentPoints;
  }
}

export function apiError(body: Record<string, unknown>, status: number): ZpdfError {
  const nested = typeof body.error === "object" && body.error !== null ? body.error as Record<string, unknown> : undefined;
  const code = String(body.error_code ?? nested?.code ?? (status === 401 ? "invalid_api_key" : "api_task_error"));
  const message = typeof body.message === "string" ? body.message : typeof nested?.message === "string" ? nested.message : undefined;
  return new ZpdfError(code, {
    ...(message === undefined ? {} : { message }),
    httpStatus: status,
    ...(typeof body.points_required === "number" ? { pointsRequired: body.points_required } : {}),
    ...(typeof body.current_points === "number" ? { currentPoints: body.current_points } : {}),
  });
}
