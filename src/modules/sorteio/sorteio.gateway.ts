import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SorteioService } from './sorteio.service';

interface MarcarNumeroPayload {
  edicaoId: string;
  numero: number;
  sequenciaBolas: number[];
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/',
})
export class SorteioGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SorteioGateway.name);

  constructor(private readonly sorteioService: SorteioService) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) {
        client.disconnect();
        return;
      }
      // JWT validation is done in the SorteioService
      const usuario = await this.sorteioService.validarToken(token);
      if (!usuario) {
        client.disconnect();
        return;
      }
      client.data.usuario = usuario;
      this.logger.log(`Cliente conectado: ${client.id} [${usuario.perfil}]`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { edicaoId: string },
  ): void {
    const room = `edicao-${data.edicaoId}`;
    client.join(room);
    this.logger.log(`${client.id} entrou na room: ${room}`);
  }

  @SubscribeMessage('leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { edicaoId: string },
  ): void {
    const room = `edicao-${data.edicaoId}`;
    client.leave(room);
    this.logger.log(`${client.id} saiu da room: ${room}`);
  }

  @SubscribeMessage('sorteio:marcar_numero')
  async handleMarcarNumero(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: MarcarNumeroPayload,
  ): Promise<void> {
    const { usuario } = client.data;
    if (!usuario || usuario.perfil !== 'ADMIN') {
      client.emit('error', { message: 'Apenas administradores podem marcar números' });
      return;
    }

    const room = `edicao-${payload.edicaoId}`;

    // Persist and check winners
    const resultado = await this.sorteioService.marcarNumero(payload);

    // Broadcast numero marcado
    this.server.to(room).emit('sorteio:numero_marcado', {
      edicaoId: payload.edicaoId,
      numero: payload.numero,
      sequenciaBolas: payload.sequenciaBolas,
    });

    // Broadcast winners if any
    if (resultado.ganhadores && resultado.ganhadores.length > 0) {
      for (const ganhador of resultado.ganhadores) {
        this.server.to(room).emit('sorteio:ganhador', ganhador);
      }
    }

    // Broadcast status update
    if (resultado.statusAtualizado) {
      this.server.to(room).emit('sorteio:status', {
        edicaoId: payload.edicaoId,
        status: resultado.statusAtualizado,
      });
    }

    // Broadcast final result
    if (resultado.finalizado) {
      this.server.to(room).emit('sorteio:resultado_final', {
        edicaoId: payload.edicaoId,
        ganhadores: resultado.ganhadores,
      });
    }
  }

  emitirStatus(edicaoId: string, status: string): void {
    this.server.to(`edicao-${edicaoId}`).emit('sorteio:status', { edicaoId, status });
  }
}
