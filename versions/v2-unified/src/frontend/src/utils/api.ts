export interface ApiEnvelope<T = unknown> {
  success?: boolean;
  message?: string;
  data?: T;
  [key: string]: unknown;
}

interface ApiRequestOptions {
  auth?: boolean;
}

export class ApiRequestError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.payload = payload;
  }
}

function getApiBase(): string {
  const envBase = ((import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL || '').trim();
  if (envBase) {
    return envBase.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:8088';
  }

  return '';
}

function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const apiBase = getApiBase();
  if (!apiBase) {
    return path;
  }

  if (path.startsWith('/api')) {
    return `${apiBase}${path}`;
  }

  return path;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    const normalized: Record<string, string> = {};
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

function hasHeader(headers: Record<string, string>, key: string): boolean {
  return Object.keys(headers).some(headerKey => headerKey.toLowerCase() === key.toLowerCase());
}

function buildHeaders(headers?: HeadersInit, withAuth = true): Record<string, string> {
  const mergedHeaders = normalizeHeaders(headers);

  if (withAuth) {
    const token = localStorage.getItem('token');
    if (token && !hasHeader(mergedHeaders, 'authorization')) {
      mergedHeaders.Authorization = `Bearer ${token}`;
    }
  }

  return mergedHeaders;
}

function prepareJsonRequestInit(method: string, body: unknown, options: ApiRequestOptions, init?: RequestInit): RequestInit {
  const nextInit: RequestInit = {
    ...init,
    method,
  };

  const headers = buildHeaders(init?.headers, options.auth !== false);

  if (body !== undefined) {
    if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
      nextInit.body = body as BodyInit;
    } else {
      nextInit.body = JSON.stringify(body);
      if (!hasHeader(headers, 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }
    }
  }

  nextInit.headers = headers;
  return nextInit;
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const maybeMessage = (payload as { message?: unknown; error?: unknown }).message
    ?? (payload as { message?: unknown; error?: unknown }).error;

  return typeof maybeMessage === 'string' && maybeMessage.trim() ? maybeMessage : fallback;
}

async function parsePayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

export async function apiRequest<T = unknown>(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {}
): Promise<ApiEnvelope<T>> {
  const requestInit: RequestInit = {
    ...init,
    headers: buildHeaders(init.headers, options.auth !== false),
  };

  const response = await fetch(resolveApiUrl(path), requestInit);
  const payload = await parsePayload(response);

  if (!response.ok) {
    throw new ApiRequestError(
      extractErrorMessage(payload, `HTTP ${response.status}`),
      response.status,
      payload
    );
  }

  if (payload && typeof payload === 'object') {
    const envelope = payload as ApiEnvelope<T>;
    if (envelope.success === false) {
      throw new ApiRequestError(
        envelope.message || 'Request failed',
        response.status,
        envelope
      );
    }
    return envelope;
  }

  return {
    success: true,
    data: payload as T,
  };
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  options: ApiRequestOptions = {}
): Promise<Response> {
  const requestInit: RequestInit = {
    ...init,
    headers: buildHeaders(init.headers, options.auth !== false),
  };

  return fetch(resolveApiUrl(path), requestInit);
}

export async function apiGetData<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiRequest<T>(path, { method: 'GET' }, options);
  return response.data as T;
}

export async function apiPostData<T = unknown>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await apiRequest<T>(
    path,
    prepareJsonRequestInit('POST', body, options),
    options
  );
  return response.data as T;
}

export async function apiPutData<T = unknown>(
  path: string,
  body: unknown,
  options: ApiRequestOptions = {}
): Promise<T> {
  const response = await apiRequest<T>(
    path,
    prepareJsonRequestInit('PUT', body, options),
    options
  );
  return response.data as T;
}

export async function apiDeleteData<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiRequest<T>(path, { method: 'DELETE' }, options);
  return response.data as T;
}
