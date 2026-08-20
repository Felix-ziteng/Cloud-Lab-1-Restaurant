import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL, getToken, type TokenKind } from '../api/client';

const RealtimeContext = createContext<Socket | null>(null);

// 一个页面只应该有一条 WebSocket 连接，往下用 Context 分发给需要监听事件的子组件，
// 而不是每个用到实时事件的组件各自 io() 一次。
//
// 只在挂载时读一次 token：调用方负责保证挂载这个 Provider 的时候 token 已经写进
// localStorage 了（比如登录成功之后、或者顾客 join 桌台成功之后再渲染这一层），
// 不在这里轮询 localStorage 等 token 出现。
export function RealtimeProvider({ tokenKind, children }: { tokenKind: TokenKind; children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const token = getToken(tokenKind);
    if (!token) return;

    const instance = SOCKET_URL ? io(SOCKET_URL, { auth: { token } }) : io({ auth: { token } });
    setSocket(instance);

    return () => {
      instance.disconnect();
      setSocket(null);
    };
  }, [tokenKind]);

  return <RealtimeContext.Provider value={socket}>{children}</RealtimeContext.Provider>;
}

// event 传 'connect' 用来在连接建立/重连成功时做一次全量刷新，弥补断线期间错过的事件——
// Socket.IO 客户端自带重连（带退避），我们不再需要额外的轮询兜底。
export function useRealtimeEvent(event: string, handler: (...args: unknown[]) => void) {
  const socket = useContext(RealtimeContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const wrapped = (...args: unknown[]) => handlerRef.current(...args);
    socket.on(event, wrapped);
    return () => {
      socket.off(event, wrapped);
    };
  }, [socket, event]);
}

// 给挂载 RealtimeProvider 本身的那个页面组件用：Provider 只对它的子树生效，
// 页面组件自己拿不到 context（渲染 Provider 的那一层不算在它的子树里），
// 所以顶层页面要监听事件、刷新自己的 state 时，用这个空组件当"事件订阅点"塞进子树里。
export function RealtimeListener({ event, onEvent }: { event: string; onEvent: (...args: unknown[]) => void }) {
  useRealtimeEvent(event, onEvent);
  return null;
}
