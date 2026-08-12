import { Logger } from '@nestjs/common';
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
//   - guest  -> table:{tableSessionId}
//   - staff  -> frontdesk（KDS 设备走站点级 token，见 kitchen 模块）
//   - rider  -> delivery:{riderId}
@WebSocketGateway({ cors: true })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
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
        client.join(`table:${payload.tableSessionId}`);
        break;
      case 'staff':
        client.join('frontdesk');
        break;
      case 'rider':
        client.join(`delivery:${payload.sub}`);
        break;
      case 'kitchen_station':
        client.join('kitchen');
        break;
    }
  }

  emitToTable(tableSessionId: string, event: string, payload: unknown) {
    this.server.to(`table:${tableSessionId}`).emit(event, payload);
  }

  emitToKitchen(event: string, payload: unknown) {
    this.server.to('kitchen').emit(event, payload);
  }

  emitToFrontdesk(event: string, payload: unknown) {
    this.server.to('frontdesk').emit(event, payload);
  }

  emitToRider(riderId: string, event: string, payload: unknown) {
    this.server.to(`delivery:${riderId}`).emit(event, payload);
  }
}
