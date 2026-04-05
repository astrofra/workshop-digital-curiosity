export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function buildApiUrl(scriptName, params = {}) {
  const url = new URL(`/api/${scriptName}`, window.location.origin);

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return `${url.pathname}${url.search}`;
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Erreur ${response.status}`, response.status, payload);
  }

  return payload;
}

export function setStatus(element, message, state = "info") {
  if (!element) {
    return;
  }

  if (!message) {
    element.hidden = true;
    element.textContent = "";
    element.dataset.state = "";
    return;
  }

  element.hidden = false;
  element.textContent = message;
  element.dataset.state = state;
}

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return replacements[character];
  });
}

export function formatFrenchDate(value) {
  if (!value) {
    return "";
  }

  const source = value.length === 10 ? `${value}T12:00:00` : value;
  const date = new Date(source);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long"
  }).format(date);
}
