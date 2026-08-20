import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { AuthPayload } from '../auth/auth.types';

// 对应 docs/API_DESIGN.md 第 4 节的房间划分。
// 只负责服务端 -> 客户端广播；客户端写操作一律走 REST，不在这里接收。
//
// 客户端在建立连接时通过 `socket.handshake.auth.token` 传入与 REST 请求相同的令牌，
// 网关据此把连接放入对应房间：
//   - guest  -> order:{orderId}，堂食顾客再额外加入 table:{tableSessionId}
//     （外卖/自提顾客自助下单没有桌台，guest token 里 tableSessionId 是 null，见 OrdersService.createGuestOrder）
//   - staff  -> frontdesk + kitchen（KDS 复用店员登录，没有单独的站点级 token，见 kitchen 模块）
//   - 打印代理（apps/print-agent）不是店员/顾客身份，拿不到 JWT——用固定的
//     PRINT_AGENT_TOKEN 直连，跟 PrintAgentGuard 校验 REST 请求用的是同一个共享密钥
@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }

    const printAgentToken = this.config.get<string>('PRINT_AGENT_TOKEN');
    if (printAgentToken && token === printAgentToken) {
      client.join('kitchen');
      return;
    }

    try {
      const payload = this.jwtService.verify<AuthPayload>(token);
      this.joinRoomForPayload(client, payload);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`socket disconnected: ${client.id}`);
  }

  private joinRoomForPayload(client: Socket, payload: AuthPayload) {
    switch (payload.type) {
      case 'guest':
        client.join(`order:${payload.orderId}`);
        if (payload.tableSessionId) client.join(`table:${payload.tableSessionId}`);
        break;
      case 'staff':
        // KDS 复用店员登录（见 KitchenPage.tsx/auth.types.ts 的决策记录），所以店员连接
        // 也要加入 kitchen 房间，否则厨房相关事件推不到 KDS 页面
        client.join('frontdesk');
        client.join('kitchen');
        break;
    }
  }

  emitToTable(tableSessionId: string, event: string, payload: unknown) {
    this.server.to(`table:${tableSessionId}`).emit(event, payload);
  }

  emitToOrder(orderId: string, event: string, payload: unknown) {
    this.server.to(`order:${orderId}`).emit(event, payload);
  }

  emitToKitchen(event: string, payload: unknown) {
    this.server.to('kitchen').emit(event, payload);
  }

  emitToFrontdesk(event: string, payload: unknown) {
    this.server.to('frontdesk').emit(event, payload);
  }
}
