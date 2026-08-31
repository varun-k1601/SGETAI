import { API_BASE_URL } from "../config/env";

// Outermost rung of the timeout ladder. Every server-side budget is deliberately shorter, so in
// normal operation the SERVER always gives up first and we render its real message. This only
// fires when the server has stopped talking altogether - and when it does, the user gets a
// sentence rather than a spinner that never stops.
//
//   career agent:  Gemini 45s / Ollama 100s  <  budget 120s  \
//   résumé parse:  Gemini 60s / Ollama rest  <  budget 110s  /  <  nginx 150s  <  THIS 180s
//
// Change one rung and re-check the rest: RESUME_PARSE_TOTAL_BUDGET_MS in resumeProfileParser.js,
// CAREER_AGENT_TOTAL_BUDGET_MS in careerAgentService.js, proxy_read_timeout in nginx.conf.
const DEFAULT_TIMEOUT_MS = 180000;

// A failed fetch() rejects with a bare TypeError whose message is the browser's own wording -
// "Failed to fetch" in Chrome, "NetworkError when attempting to fetch resource" in Firefox. It
// means no HTTP response ever arrived: the connection was refused, reset, or cut mid-flight (a dev
// server restarting under nodemon does exactly this to a long request), or the response was
// rejected before JS could read it because it carried no CORS headers. Showing that string to a
// job seeker tells them nothing, so every transport failure is translated here and the original is
// logged for whoever is debugging.
function describeTransportError(error, { path, timeoutMs, timedOut }) {
  if (timedOut) {
    const seconds = Math.round(timeoutMs / 1000);
    const friendly = new Error(
      `The assistant took longer than ${seconds} seconds to respond. It may still be working - try again in a moment.`
    );
    friendly.kind = "timeout";
    friendly.cause = error;
    return friendly;
  }

  if (error?.name === "AbortError") {
    const cancelled = new Error("The request was cancelled.");
    cancelled.kind = "aborted";
    cancelled.cause = error;
    return cancelled;
  }

  if (error instanceof TypeError) {
    console.error(`[api] Could not reach ${API_BASE_URL}${path} -`, error);
    const friendly = new Error(
      "Cannot reach the server. Check that the backend is running and that your connection is up, then try again."
    );
    friendly.kind = "unreachable";
    friendly.cause = error;
    return friendly;
  }

  return error;
}

// Wraps fetch with an AbortController so a hung or dead connection can never leave a caller
// waiting forever, and so the rejection carries a `kind` the UI can branch on.
async function fetchWithTimeout(path, init, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // A caller-supplied signal (React Query's, say) must not silently replace ours, or the timeout
  // would stop firing. Chain both: whichever aborts first wins.
  const callerSignal = init.signal;
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    throw describeTransportError(error, { path, timeoutMs, timedOut });
  } finally {
    clearTimeout(timer);
    if (callerSignal) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

function toApiError(data, response) {
  const error = new Error(data.message || `Request failed (${response.status})`);
  // Some endpoints (e.g. LinkedIn publish) attach a machine-readable errorCode via
  // ApiError's `details` so the caller can distinguish "needs reconnect" from a generic
  // failure without string-matching the human-readable message.
  error.details = data.details;
  error.status = response.status;
  error.kind = "http";
  return error;
}

export async function apiRequest(path, options = {}) {
  const { token, body, headers, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;
  const response = await fetchWithTimeout(path, {
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    method: rest.method || (body ? "POST" : "GET"),
    ...rest,
  }, timeoutMs);

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw toApiError(data, response);
  }

  return data;
}

export async function apiFormRequest(path, options = {}) {
  const { token, formData, headers, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;
  const response = await fetchWithTimeout(path, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    body: formData,
    method: rest.method || (formData ? "POST" : "GET"),
    ...rest,
  }, timeoutMs);

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw toApiError(data, response);
  }

  return data;
}

/* Same contract as apiFormRequest, but built on XMLHttpRequest so the caller can watch the upload
   actually happen. fetch() reports nothing until the whole response arrives, which is fine for a
   fast call and useless for résumé autofill: that request spends 20-40 seconds inside a language
   model, and a button stuck in a pending state for that long is indistinguishable from a hang.

   Two phases are reported, and both are REAL rather than a timer pretending to be progress:
     "uploading"  - xhr.upload progress events, ending when the last byte is sent
     "processing" - the server now has the file; everything after this is extraction and parsing
   The server does not stream its own stage back, so "processing" is deliberately one phase and is
   labelled honestly. The caller pairs it with an elapsed-time counter, which is what actually
   tells a waiting candidate the thing is still alive. */
export function apiUploadRequest(path, options = {}) {
  const { token, formData, headers, timeoutMs = DEFAULT_TIMEOUT_MS, onPhase, method = "POST" } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let timedOut = false;

    xhr.open(method, `${API_BASE_URL}${path}`);
    xhr.timeout = timeoutMs;
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    Object.entries(headers || {}).forEach(([key, value]) => xhr.setRequestHeader(key, value));

    onPhase?.({ phase: "uploading", progress: 0 });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onPhase?.({ phase: "uploading", progress: event.loaded / event.total });
    };
    xhr.upload.onload = () => onPhase?.({ phase: "processing", progress: 1 });

    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { data = {}; }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      // Mirrors toApiError so callers can branch on .status/.kind identically either way.
      const error = new Error(data.message || `Request failed (${xhr.status})`);
      error.details = data.details;
      error.status = xhr.status;
      error.kind = "http";
      reject(error);
    };

    xhr.ontimeout = () => {
      timedOut = true;
      reject(describeTransportError(new Error("Request timed out"), { path, timeoutMs, timedOut: true }));
    };
    // A timeout raises ontimeout only, never onerror, so `timedOut` is here purely to keep the
    // wording right if the two ever arrive together.
    xhr.onerror = () => reject(describeTransportError(new TypeError("Network request failed"), { path, timeoutMs, timedOut }));
    xhr.onabort = () => reject(describeTransportError(new TypeError("Request aborted"), { path, timeoutMs, timedOut }));

    xhr.send(formData);
  });
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
