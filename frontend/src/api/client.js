const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('accessToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = { error: 'Request failed' };
    }
    const fieldErrors = payload.details?.fieldErrors;
    if (fieldErrors) {
      const detailMessage = Object.entries(fieldErrors)
        .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
        .join(' | ');
      throw new Error(detailMessage || payload.error || 'Request failed');
    }
    throw new Error(payload.error || 'Request failed');
  }

  if (response.status === 204) return null;
  return response.json();
}
