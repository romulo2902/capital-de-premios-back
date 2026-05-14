import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ObjectCannedACL,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import type { UploadFile } from '../types/upload-file.type';

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class S3UploadService {
  private readonly logger = new Logger(S3UploadService.name);
  private readonly s3: S3Client;

  constructor(private readonly config: ConfigService) {
    this.s3 = new S3Client(this.buildS3ClientConfig());
  }

  async uploadImage(file: UploadFile, folder: string): Promise<string> {
    const normalizedFile = this.validateImageFile(file);
    const extension = IMAGE_EXTENSIONS[normalizedFile.mimetype];
    const key = `${this.normalizeFolder(folder)}/${randomUUID()}.${extension}`;

    return this.uploadPublicObject({
      body: normalizedFile.buffer,
      contentType: normalizedFile.mimetype,
      key,
    });
  }

  async uploadImageFromBase64(
    base64: string,
    folder: string,
  ): Promise<string | null> {
    if (!base64) {
      return null;
    }

    const match = base64.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      // Se não tiver o prefixo data:image, tenta tratar como base64 puro
      // mas precisamos do mimetype. Vamos assumir que se não tem prefixo, 
      // pode ser um erro ou formato não suportado se não soubermos o tipo.
      throw new BadRequestException(
        'Formato base64 inválido. Use o padrão data:image/png;base64,...',
      );
    }

    const mimetype = match[1];
    const buffer = Buffer.from(match[2], 'base64');

    const normalizedFile = this.validateImageFile({
      buffer,
      mimetype,
      size: buffer.length,
    });

    const extension = IMAGE_EXTENSIONS[normalizedFile.mimetype];
    const key = `${this.normalizeFolder(folder)}/${randomUUID()}.${extension}`;

    return this.uploadPublicObject({
      body: normalizedFile.buffer,
      contentType: normalizedFile.mimetype,
      key,
    });
  }

  async uploadPublicObject(params: {
    body: Buffer | Uint8Array;
    contentType: string;
    key: string;
  }): Promise<string> {
    const bucket = this.getBucket();
    const commandInput = this.buildPutObjectCommandInput(bucket, params);

    try {
      await this.s3.send(new PutObjectCommand(commandInput));

      return this.buildPublicUrl(bucket, params.key);
    } catch (error) {
      const errorMessage = (error as Error).message;

      if (commandInput.ACL && this.isAclDisabledError(errorMessage)) {
        this.logger.warn(
          'Bucket S3 não permite ACL. Repetindo upload sem ACL explícita',
        );

        try {
          await this.s3.send(
            new PutObjectCommand({
              ...commandInput,
              ACL: undefined,
            }),
          );

          return this.buildPublicUrl(bucket, params.key);
        } catch (retryError) {
          this.handleUploadError((retryError as Error).message);
        }
      }

      this.handleUploadError(errorMessage);
    }
  }

  private validateImageFile(file: UploadFile | undefined): {
    buffer: Buffer | Uint8Array;
    mimetype: string;
    size: number;
  } {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Arquivo de imagem não enviado');
    }

    const mimetype = file.mimetype?.trim().toLowerCase() ?? '';
    if (!IMAGE_EXTENSIONS[mimetype]) {
      throw new BadRequestException(
        'Formato de imagem inválido. Envie PNG, JPG, JPEG, WEBP ou GIF',
      );
    }

    const size = file.size ?? file.buffer.length;
    const maxSizeMb = this.config.get<number>('AWS_IMAGE_MAX_SIZE_MB', 10);
    const maxSizeBytes = maxSizeMb * 1024 * 1024;

    if (size > maxSizeBytes) {
      throw new BadRequestException(`Imagem excede o limite de ${maxSizeMb}MB`);
    }

    return {
      buffer: file.buffer,
      mimetype,
      size,
    };
  }

  private getBucket(): string {
    const bucket = this.config.get<string>('AWS_BUCKET_NAME', '').trim();

    if (!bucket) {
      throw new ServiceUnavailableException(
        'Upload de imagem indisponível: bucket S3 não configurado',
      );
    }

    return bucket;
  }

  private getRegion(): string {
    return this.config.get<string>('AWS_REGION', 'sa-east-1');
  }

  private buildPublicUrl(bucket: string, key: string): string {
    const publicBaseUrl = this.config
      .get<string>('AWS_S3_PUBLIC_BASE_URL', '')
      .trim()
      .replace(/\/+$/, '');

    if (publicBaseUrl) {
      return `${publicBaseUrl}/${key}`;
    }

    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }

  private normalizeFolder(folder: string): string {
    return folder.replace(/^\/+|\/+$/g, '');
  }

  private buildPutObjectCommandInput(
    bucket: string,
    params: {
      body: Buffer | Uint8Array;
      contentType: string;
      key: string;
    },
  ): PutObjectCommandInput {
    const acl = this.getObjectAcl();

    return {
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      ...(acl ? { ACL: acl } : {}),
    };
  }

  private isBucketEndpointError(errorMessage: string): boolean {
    return (
      errorMessage.includes('must be addressed using the specified endpoint') ||
      errorMessage.includes('PermanentRedirect')
    );
  }

  private isAclDisabledError(errorMessage: string): boolean {
    return (
      errorMessage.includes('The bucket does not allow ACLs') ||
      errorMessage.includes('AccessControlListNotSupported')
    );
  }

  private handleUploadError(errorMessage: string): never {
    this.logger.error(`Falha ao enviar arquivo para o S3: ${errorMessage}`);

    if (this.isCredentialsError(errorMessage)) {
      throw new ServiceUnavailableException(
        'Upload de imagem indisponível: credenciais AWS não configuradas',
      );
    }

    if (this.isBucketEndpointError(errorMessage)) {
      throw new InternalServerErrorException(
        'Falha ao enviar imagem para o S3. Verifique se AWS_REGION corresponde à região do bucket configurado',
      );
    }

    throw new InternalServerErrorException('Falha ao enviar imagem para o S3');
  }

  private getObjectAcl(): ObjectCannedACL | undefined {
    const useAclRaw = this.config
      .get<string>('AWS_S3_USE_ACL', 'true')
      .trim()
      .toLowerCase();
    const useAcl = ['1', 'true', 'yes', 'sim'].includes(useAclRaw);

    if (!useAcl) {
      return undefined;
    }

    return this.config.get<ObjectCannedACL>('AWS_S3_OBJECT_ACL', 'public-read');
  }

  private buildS3ClientConfig(): S3ClientConfig {
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID', '').trim();
    const secretAccessKey = this.config
      .get<string>('AWS_SECRET_ACCESS_KEY', '')
      .trim();

    const clientConfig: S3ClientConfig = {
      region: this.getRegion(),
      followRegionRedirects: true,
    };

    if (accessKeyId && secretAccessKey) {
      return {
        ...clientConfig,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      };
    }

    if (accessKeyId || secretAccessKey) {
      this.logger.warn(
        'Credenciais AWS do S3 incompletas. Usando provider chain padrão do SDK',
      );
    }

    return clientConfig;
  }

  private isCredentialsError(errorMessage: string): boolean {
    return (
      errorMessage.includes('a non-empty Access Key (AKID) must be provided') ||
      errorMessage.includes('Resolved credential object is not valid') ||
      errorMessage.includes('Could not load credentials from any providers') ||
      errorMessage.includes('Missing credentials in config')
    );
  }
}
