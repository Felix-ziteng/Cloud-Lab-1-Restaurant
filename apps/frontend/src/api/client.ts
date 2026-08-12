// 极简 REST 客户端：按 docs/API_DESIGN.md 的令牌模型，从 localStorage 读取对应角色的 token。
// 三种 token 各自存放在不同 key 下，因为同一台设备上 staff/guest 身份不会混用（前台 vs 桌台/顾客）。

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export type TokenKind = 'staffToken' | 'riderToken' | 'guestToken';

export function getToken(kind: TokenKind): string | null {
  return localStorage.getItem(kind);
}

export function setToken(kind: TokenKind, token: string) {
  localStorage.setItem(kind, token);
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; tokenKind?: TokenKind } = {},
): Promise<T> {
  const { method = 'GET', body, tokenKind } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (tokenKind) {
    const token = getToken(tokenKind);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`${res.status} ${message}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  get: <T>(path: string, tokenKind?: TokenKind) => request<T>(path, { tokenKind }),
  post: <T>(path: string, body?: unknown, tokenKind?: TokenKind) =>
    request<T>(path, { method: 'POST', body, tokenKind }),
  patch: <T>(path: string, body?: unknown, tokenKind?: TokenKind) =>
    request<T>(path, { method: 'PATCH', body, tokenKind }),
};
