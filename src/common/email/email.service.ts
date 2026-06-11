import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  compraAprovadaTemplate,
  type CompraAprovadaParams,
} from './templates/compra-aprovada.template';
import {
  compraAprovadaSenaTemplate,
  type CompraAprovadaSenaParams,
} from './templates/compra-aprovada-sena.template';
import {
  boasVindasTemplate,
  type BoasVindasParams,
} from './templates/boas-vindas.template';
import {
  recuperacaoSenhaTemplate,
  type RecuperacaoSenhaParams,
} from './templates/recuperacao-senha.template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly fromAddress: string;
  private readonly logoUrl: string;
  private readonly logoSenaUrl: string;

  constructor(private readonly config: ConfigService) {
    this.fromAddress = this.config.get<string>(
      'EMAIL_FROM',
      'Capital de Prêmios <noreply@capitaldepremios.com.br>',
    );

    this.logoUrl = this.config.get<string>(
      'EMAIL_LOGO_URL',
      'https://s3-capital-premios.s3.amazonaws.com/logo/logo-email.png',
    );

    this.logoSenaUrl = this.config.get<string>(
      'EMAIL_LOGO_SENA_URL',
      'https://s3-capital-premios.s3.us-east-1.amazonaws.com/logo_sena_OF.png',
    );

    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp-relay.brevo.com'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER'),
        pass: this.config.get<string>('SMTP_PASS'),
      },
    });
  }

  async enviarCompraAprovada(
    para: string,
    params: Omit<CompraAprovadaParams, 'logoUrl'>,
  ): Promise<void> {
    const html = compraAprovadaTemplate({ ...params, logoUrl: this.logoUrl });
    await this.enviar({
      para,
      assunto: `Seus números estão confirmados! Boa sorte 🍀`,
      html,
    });
  }

  async enviarCompraAprovadaSena(
    para: string,
    params: Omit<CompraAprovadaSenaParams, 'logoUrl'>,
  ): Promise<void> {
    const html = compraAprovadaSenaTemplate({ ...params, logoUrl: this.logoSenaUrl });
    await this.enviar({
      para,
      assunto: `Seus números estão confirmados! Boa sorte na Sena 🍀`,
      html,
    });
  }

  async enviarBoasVindas(
    para: string,
    params: Omit<BoasVindasParams, 'logoUrl'>,
  ): Promise<void> {
    const html = boasVindasTemplate({ ...params, logoUrl: this.logoUrl });
    await this.enviar({
      para,
      assunto: 'Bem-vindo(a)! Sua conta está pronta',
      html,
    });
  }

  async enviarRecuperacaoSenha(
    para: string,
    params: Omit<RecuperacaoSenhaParams, 'logoUrl'>,
  ): Promise<void> {
    const html = recuperacaoSenhaTemplate({ ...params, logoUrl: this.logoUrl });
    await this.enviar({
      para,
      assunto: 'Sua nova senha de acesso',
      html,
    });
  }

  private async enviar(opts: {
    para: string;
    assunto: string;
    html: string;
  }): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: opts.para,
        subject: opts.assunto,
        html: opts.html,
      });
      this.logger.log(`Email enviado para ${opts.para}: "${opts.assunto}"`);
    } catch (err) {
      this.logger.error(
        `Falha ao enviar email para ${opts.para}: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
