import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ServiceUnavailableException } from '@nestjs/common';
import { S3UploadService } from './s3-upload.service';

const mockSend = jest.fn();
const configValues: Record<string, unknown> = {};

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');

  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

describe('S3UploadService', () => {
  let service: S3UploadService;

  const mockConfig = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const defaults: Record<string, unknown> = {
        AWS_REGION: 'sa-east-1',
        AWS_BUCKET_NAME: 's3-capital-premios',
        AWS_ACCESS_KEY_ID: 'key',
        AWS_SECRET_ACCESS_KEY: 'secret',
        AWS_S3_USE_ACL: 'true',
        AWS_S3_OBJECT_ACL: 'public-read',
      };

      return configValues[key] ?? defaults[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    Object.keys(configValues).forEach((key) => delete configValues[key]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3UploadService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<S3UploadService>(S3UploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
    expect(S3Client).toHaveBeenCalled();
  });

  it('should create the S3 client without explicit credentials when env vars are absent', async () => {
    configValues.AWS_ACCESS_KEY_ID = '';
    configValues.AWS_SECRET_ACCESS_KEY = '';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3UploadService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    module.get<S3UploadService>(S3UploadService);

    expect(S3Client).toHaveBeenLastCalledWith({
      region: 'sa-east-1',
      followRegionRedirects: true,
    });
  });

  it('should retry upload without ACL when bucket does not allow ACLs', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('The bucket does not allow ACLs'))
      .mockResolvedValueOnce({});

    const result = await service.uploadPublicObject({
      body: Buffer.from('imagem'),
      contentType: 'image/png',
      key: 'edicoes/teste.png',
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(PutObjectCommand);
    expect(mockSend.mock.calls[1][0]).toBeInstanceOf(PutObjectCommand);
    expect(result).toBe(
      'https://s3-capital-premios.s3.amazonaws.com/edicoes/teste.png',
    );
  });

  it('should throw a handled error when retry without ACL also fails', async () => {
    mockSend
      .mockRejectedValueOnce(new Error('The bucket does not allow ACLs'))
      .mockRejectedValueOnce(new Error('Access denied'));

    await expect(
      service.uploadPublicObject({
        body: Buffer.from('imagem'),
        contentType: 'image/png',
        key: 'edicoes/teste.png',
      }),
    ).rejects.toThrow('Falha ao enviar imagem para o S3');
  });

  it('should return a treated error when AWS credentials are missing', async () => {
    mockSend.mockRejectedValueOnce(
      new Error(
        'The authorization header is malformed; a non-empty Access Key (AKID) must be provided in the credential.',
      ),
    );

    await expect(
      service.uploadPublicObject({
        body: Buffer.from('imagem'),
        contentType: 'image/png',
        key: 'edicoes/teste.png',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
