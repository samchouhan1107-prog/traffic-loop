export async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Attach CSRF token from localStorage if available
  const csrf = localStorage.getItem('csrf');
  if (csrf && method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = csrf;
  }

  const config = {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  };

  if (method === "GET" || method === "HEAD") {
    delete config.body;
  } else if (config.body && typeof config.body !== "string") {
    config.body = JSON.stringify(config.body);
  }

  const response = await fetch(path, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}
