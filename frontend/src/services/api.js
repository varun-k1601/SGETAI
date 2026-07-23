import { API_BASE_URL } from "../config/env";

export async function apiRequest(path, options = {}) {
  const { token, body, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    method: rest.method || (body ? "POST" : "GET"),
    ...rest,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    // Some endpoints (e.g. LinkedIn publish) attach a machine-readable errorCode via
    // ApiError's `details` so the caller can distinguish "needs reconnect" from a generic
    // failure without string-matching the human-readable message.
    error.details = data.details;
    throw error;
  }

  return data;
}

export async function apiFormRequest(path, options = {}) {
  const { token, formData, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: formData,
    method: rest.method || (formData ? "POST" : "GET"),
    ...rest,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    // Some endpoints (e.g. LinkedIn publish) attach a machine-readable errorCode via
    // ApiError's `details` so the caller can distinguish "needs reconnect" from a generic
    // failure without string-matching the human-readable message.
    error.details = data.details;
    throw error;
  }

  return data;
}

function getBlobFileName(headers) {
  const disposition = headers.get("content-disposition") || "";
  const utf8FileName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedFileName = disposition.match(/filename="([^"]+)"/i)?.[1];
  const plainFileName = disposition.match(/filename=([^;]+)/i)?.[1];
  const headerFileName = utf8FileName || quotedFileName || plainFileName;

  if (headerFileName) {
    return decodeURIComponent(headerFileName.replace(/^"|"$/g, "").trim());
  }

  const contentType = (headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/pdf")) {
    return "sgetai-resume.pdf";
  }

  if (contentType.includes("application/x-tex")) {
    return "sgetai-resume.tex";
  }

  if (contentType.includes("text/plain")) {
    return "download.txt";
  }

  if (contentType.includes("application/msword")) {
    return "candidate-resume.doc";
  }

  if (contentType.includes("officedocument.wordprocessingml.document")) {
    return "candidate-resume.docx";
  }

  return "download.bin";
}

export async function apiBlobRequest(path, options = {}) {
  const { token, body, headers, ...rest } = options;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...rest,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "Request failed");
  }

  return {
    blob: await response.blob(),
    fileName: getBlobFileName(response.headers),
    contentType: response.headers.get("content-type") || "",
  };
}
