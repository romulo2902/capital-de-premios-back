import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';
import { CreateVendaDto } from './dto/create-venda.dto';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

/**
 * O vínculo comercial da venda define para quem vai a comissão. Ele precisa vir
 * do token, nunca do corpo da requisição — caso contrário um VENDEDOR poderia
 * informar o `distribuidorId` de outra rede e desviar a comissão do
 * distribuidor para ela.
 */
describe('VendasController — vínculo comercial', () => {
  let controller: VendasController;

  // Captura o DTO na implementação do mock: evita indexar `mock.calls`, que o
  // eslint trata como acesso a `any`.
  let dtoRecebidoPeloService: CreateVendaDto | undefined;

  const mockVendasService = {
    create: jest.fn((dto: CreateVendaDto) => {
      dtoRecebidoPeloService = dto;
      return Promise.resolve({ id: 'venda-1' });
    }),
  };

  const dtoBase = {
    edicaoId: 'edicao-1',
    quantidadeCartelas: 1,
  } as CreateVendaDto;

  const usuario = (extra: Partial<RequestUser>): RequestUser => ({
    id: 'usuario-1',
    email: 'user@test.com',
    cpf: '12345678900',
    status: 'ATIVO',
    perfil: 'ADMIN',
    ...extra,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    dtoRecebidoPeloService = undefined;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendasController],
      providers: [{ provide: VendasService, useValue: mockVendasService }],
    }).compile();

    controller = module.get<VendasController>(VendasController);
  });

  it('VENDEDOR: ignora distribuidorId do corpo e usa o vendedor do token', async () => {
    await controller.create(
      { ...dtoBase, distribuidorId: 'distribuidor-de-outra-rede' },
      usuario({ perfil: 'VENDEDOR', vendedorId: 'vendedor-logado' }),
    );

    const enviado = dtoRecebidoPeloService;
    expect(enviado?.vendedorId).toBe('vendedor-logado');
    expect(enviado?.distribuidorId).toBeUndefined();
  });

  it('VENDEDOR: sobrescreve vendedorId forjado no corpo', async () => {
    await controller.create(
      { ...dtoBase, vendedorId: 'outro-vendedor' },
      usuario({ perfil: 'VENDEDOR', vendedorId: 'vendedor-logado' }),
    );

    expect(dtoRecebidoPeloService?.vendedorId).toBe('vendedor-logado');
  });

  it('DISTRIBUIDOR: usa o distribuidor do token e preserva o vendedor do corpo', async () => {
    // O distribuidor pode lancar venda para um vendedor da propria rede, entao
    // o vendedorId sobrevive ao controller. Quem valida a posse e o service.
    await controller.create(
      { ...dtoBase, vendedorId: 'vendedor-da-rede' },
      usuario({
        perfil: 'DISTRIBUIDOR',
        distribuidorId: 'distribuidor-logado',
      }),
    );

    const enviado = dtoRecebidoPeloService;
    expect(enviado?.distribuidorId).toBe('distribuidor-logado');
    expect(enviado?.vendedorId).toBe('vendedor-da-rede');
  });

  it('ADMIN: preserva o par informado no corpo', async () => {
    await controller.create(
      {
        ...dtoBase,
        vendedorId: 'vendedor-1',
        distribuidorId: 'distribuidor-1',
      },
      usuario({ perfil: 'ADMIN' }),
    );

    const enviado = dtoRecebidoPeloService;
    expect(enviado?.vendedorId).toBe('vendedor-1');
    expect(enviado?.distribuidorId).toBe('distribuidor-1');
  });
  // Regressao: os ramos do guard exigiam user.vendedorId/user.distribuidorId,
  // entao um token com perfil mas sem vinculo caia FORA dos dois e os campos
  // do corpo sobreviviam intactos.
  it('VENDEDOR sem vinculo no token e recusado, nao ignorado', async () => {
    expect(() =>
      controller.create(
        { ...dtoBase, distribuidorId: 'qualquer-rede' },
        usuario({ perfil: 'VENDEDOR', vendedorId: undefined }),
      ),
    ).toThrow(ForbiddenException);

    expect(mockVendasService.create).not.toHaveBeenCalled();
  });

  it('DISTRIBUIDOR sem vinculo no token e recusado, nao ignorado', async () => {
    expect(() =>
      controller.create(
        { ...dtoBase, vendedorId: 'qualquer-vendedor' },
        usuario({ perfil: 'DISTRIBUIDOR', distribuidorId: undefined }),
      ),
    ).toThrow(ForbiddenException);

    expect(mockVendasService.create).not.toHaveBeenCalled();
  });
});
