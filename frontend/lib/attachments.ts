const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "png",
  "jpg",
  "jpeg",
  "webp",
]);

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export const ATTACHMENT_ACCEPT = [
  ".pdf",
  ".doc",
  ".docx",
  ".ppt",
  ".pptx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
].join(",");

function fileExtension(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

export function isAllowedAttachmentFile(file: File): boolean {
  const ext = fileExtension(file.name);
  const mime = (file.type || "").toLowerCase();
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(ext) && (!!mime ? ALLOWED_ATTACHMENT_MIME_TYPES.has(mime) : true);
}
