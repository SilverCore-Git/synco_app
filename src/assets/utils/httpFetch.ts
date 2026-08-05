import { invoke } from '@tauri-apps/api/core';

function isTauriPlatform(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

interface NativeHttpResponse {
  status: number;
  body: string;
}

async function nativeRequest(
  url: string,
  method: string,
  body?: string,
  contentType?: string,
  authToken?: string
): Promise<Response> {
  const res = await invoke<NativeHttpResponse>('http_request', {
    url, method, body, contentType, authToken,
  });
  return new Response(res.body, { status: res.status });
}

export default async function httpFetch(url: string, options?: RequestInit): Promise<Response> {
  if (isTauriPlatform()) {
    const method = options?.method || 'GET';
    const contentType = (options?.headers as Record<string, string>)?.['Content-Type'];
    const authHeader = (options?.headers as Record<string, string>)?.['Authorization'];
    const authToken = authHeader?.replace('Bearer ', '');
    const body = typeof options?.body === 'string' ? options.body : undefined;
    return nativeRequest(url, method, body, contentType, authToken);
  }
  return window.fetch(url, options);
}