import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'node:https';
import * as fs from 'node:fs';
import type {
  PaymentGateway,
  CriarCobrancaInput,
  CriarCobrancaOutput,
  ConsultarCobrancaOutput,
  StatusCobrancaGateway,
} from './payment-gateway.interface';

/**
 * Mapeia status do PIX Inter para status interno normalizado.
 */
const STATUS_MAP: Record<string, StatusCobrancaGateway> = {
  ATIVA: 'PENDENTE',
  CONCLUIDA: 'APROVADO',
  REMOVIDA_PELO_USUARIO_RECEBEDOR: 'CANCELADO',
  REMOVIDA_PELO_PSP: 'CANCELADO',
  EXPIRADA: 'EXPIRADO',
};

interface InterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface InterCobResponse {
  txid: string;
  status: string;
  pixCopiaECola: string;
  location: string;
  pix?: Array<{
    endToEndId: string;
    horario: string;
    valor: string;
  }>;
  [key: string]: unknown;
}

@Injectable()
export class InterPixGateway implements PaymentGateway {
  private readonly logger = new Logger(InterPixGateway.name);

  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;

  private readonly apiUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly certPath: string;
  private readonly keyPath: string;
  private readonly pixKey: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>(
      'INTER_API_URL',
      'https://cdpj.partners.bancointer.com.br',
    );
    this.clientId = this.config.get<string>('INTER_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('INTER_CLIENT_SECRET', '');
    this.certPath = this.config.get<string>('INTER_CERT_PATH', '');
    this.keyPath = this.config.get<string>('INTER_KEY_PATH', '');
    this.pixKey = this.config.get<string>('INTER_PIX_KEY', '');
  }

  async criarCobranca(input: CriarCobrancaInput): Promise<CriarCobrancaOutput> {
    const token = await this.obterToken();
    const txid = this.gerarTxid(input.vendaId);
    const valorStr = (input.valorCentavos / 100).toFixed(2);

    const body = {
      calendario: {
        expiracao: input.expiracaoSegundos ?? 1800,
      },
      devedor: {
        cpf: input.cpfPagador.replace(/\D/g, ''),
        nome: input.nomePagador,
      },
      valor: {
        original: valorStr,
      },
      chave: this.pixKey,
      solicitacaoPagador: input.descricao,
      infoAdicionais: [
        { nome: 'vendaId', valor: input.vendaId },
      ],
    };

    const response = await this.request<InterCobResponse>(
      'PUT',
      `/pix/v2/cob/${txid}`,
      token,
      body,
    );

    this.logger.log(`Cobrança PIX criada: txid=${txid}`);

    return {
      gatewayId: response.txid,
      pixCopiaECola: response.pixCopiaECola,
      qrCodeBase64: undefined, // QR code pode ser gerado localmente a partir do pixCopiaECola
      payload: response as unknown as Record<string, unknown>,
    };
  }

  async consultarCobranca(gatewayId: string): Promise<ConsultarCobrancaOutput> {
    const token = await this.obterToken();

    const response = await this.request<InterCobResponse>(
      'GET',
      `/pix/v2/cob/${gatewayId}`,
      token,
    );

    const status = STATUS_MAP[response.status] ?? 'PENDENTE';
    const paidAt =
      status === 'APROVADO' && response.pix?.[0]?.horario
        ? new Date(response.pix[0].horario)
        : undefined;

    return {
      status,
      paidAt,
      payload: response as unknown as Record<string, unknown>,
    };
  }

  async cancelarCobranca(gatewayId: string): Promise<void> {
    const token = await this.obterToken();

    await this.request(
      'PATCH',
      `/pix/v2/cob/${gatewayId}`,
      token,
      { status: 'REMOVIDA_PELO_USUARIO_RECEBEDOR' },
    );

    this.logger.log(`Cobrança PIX cancelada: txid=${gatewayId}`);
  }

  // ─── Helpers ───────────────────────────────────────────

  private async obterToken(): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.tokenExpiresAt > now) {
      return this.cachedToken;
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: 'cob.write cob.read pix.read pix.write',
      grant_type: 'client_credentials',
    });

    const response = await this.request<InterTokenResponse>(
      'POST',
      '/oauth/v2/token',
      null,
      params.toString(),
      'application/x-www-form-urlencoded',
    );

    this.cachedToken = response.access_token;
    // Margem de segurança de 60 segundos
    this.tokenExpiresAt = now + (response.expires_in - 60) * 1000;

    this.logger.log('Token OAuth2 do Inter obtido com sucesso');
    return this.cachedToken;
  }

  private gerarTxid(vendaId: string): string {
    // txid do PIX aceita apenas [a-zA-Z0-9] e até 35 caracteres
    return vendaId.replace(/-/g, '').substring(0, 35);
  }

  private getHttpsAgent(): https.Agent {
    return new https.Agent({
      cert: fs.readFileSync(this.certPath),
      key: fs.readFileSync(this.keyPath),
      rejectUnauthorized: true,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    token: string | null,
    body?: unknown,
    contentType = 'application/json',
  ): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': contentType,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const agent = this.getHttpsAgent();

    const requestBody =
      typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined;

    const response = await fetch(url, {
      method,
      headers,
      body: requestBody,
      // @ts-expect-error Node.js fetch suporta agent via dispatcher
      dispatcher: agent,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Erro na API Inter: ${method} ${path} → ${response.status}: ${errorBody}`,
      );
      throw new Error(
        `API Inter retornou ${response.status}: ${errorBody}`,
      );
    }

    const text = await response.text();
    return text ? (JSON.parse(text) as T) : ({} as T);
  }
}
