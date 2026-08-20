// 极简 REST 客户端：按 docs/API_DESIGN.md 的令牌模型，从 localStorage 读取对应角色的 token。
// 三种 token 各自存放在不同 key 下，因为同一台设备上 staff/guest 身份不会混用（前台 vs 桌台/顾客）。

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

// Socket.IO 网关没有挂在 Nest 的全局前缀（app.setGlobalPrefix('api') 只影响 HTTP 控制器），
// 所以连接地址是去掉 /api 后缀的域名根路径，不能直接复用 BASE_URL。
// 生产构建（给 Caddy/隧道用，见 .env.production）用的是相对路径 '/api'，
// 去掉后缀后剩空字符串——这种情况下传 undefined 给 socket.io-client，
// 让它按"当前页面同源"连接，而不是指望空字符串被正确解析成 URL
export const SOCKET_URL = BASE_URL.replace(/\/api\/?$/, '') || undefined;

// 'guest:{tableId}' 这种带参数的 key 也合法：桌台会话令牌必须按桌台区分存储，
// 不能用一个全局的 'guestToken'，否则扫了 A 桌又扫 B 桌会复用 A 桌的令牌（token 里的 orderId 对不上）
export type TokenKind = 'staffToken' | (string & {});

const AUTH_INVALIDATED_EVENT = 'auth-invalidated';

export function getToken(kind: TokenKind): string | null {
  return localStorage.getItem(kind);
}

export function setToken(kind: TokenKind, token: string) {
  localStorage.setItem(kind, token);
}

export function clearToken(kind: TokenKind) {
  localStorage.removeItem(kind);
}

// 账号失效这件事只在这一处集中处理：不管是页面里的按钮点击、还是轮询定时器发起的请求，
// 只要用某个 tokenKind 发的请求收到 401，就清掉那个 token 并广播出去。页面订阅这个事件，
// 而不是每个发请求的地方（包括轮询、包括 ManagementPanel 里四个独立的子面板）各自去接、
// 各自去处理"该退出登录了"这件事——之前就是因为轮询没接住这个错误，导致账号失效后
// 页面卡死、没有任何反馈、也没有退出按钮可以手动脱困。
export function onAuthInvalidated(tokenKind: TokenKind, callback: () => void): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ tokenKind: TokenKind }>).detail;
    if (detail?.tokenKind === tokenKind) callback();
  };
  window.addEventListener(AUTH_INVALIDATED_EVENT, handler);
  return () => window.removeEventListener(AUTH_INVALIDATED_EVENT, handler);
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
    const text = await res.text();
    // Nest 的错误响应是 { message, error, statusCode } 这种 JSON，能解析就只显示 message，
    // 界面上报错更好读；解析不了（比如根本没连上后端）就把原始文本原样抛出
    let parsedMessage: string | undefined;
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed.message === 'string') parsedMessage = parsed.message;
    } catch {
      // 不是 JSON，走下面的兜底
    }

    if (res.status === 401 && tokenKind) {
      clearToken(tokenKind);
      window.dispatchEvent(new CustomEvent(AUTH_INVALIDATED_EVENT, { detail: { tokenKind } }));
    }

    throw new Error(parsedMessage ?? `${res.status} ${text}`);
  }

  // 判断"这次响应有没有 JSON 内容"不能只看状态码是不是 204——后端有几个接口
  // （清台、拆台、换桌、删除桌台）成功时是 200/201 但响应体是空的，之前只认 204
  // 会硬去 res.json() 解析空字符串，抛出 "Unexpected end of JSON input"，
  // 而这个报错发生在 fetch 已经成功之后，会让调用方误以为操作失败了
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string, tokenKind?: TokenKind) => request<T>(path, { tokenKind }),
  post: <T>(path: string, body?: unknown, tokenKind?: TokenKind) =>
    request<T>(path, { method: 'POST', body, tokenKind }),
  put: <T>(path: string, body?: unknown, tokenKind?: TokenKind) =>
    request<T>(path, { method: 'PUT', body, tokenKind }),
  patch: <T>(path: string, body?: unknown, tokenKind?: TokenKind) =>
    request<T>(path, { method: 'PATCH', body, tokenKind }),
  delete: <T>(path: string, tokenKind?: TokenKind) => request<T>(path, { method: 'DELETE', tokenKind }),
};
