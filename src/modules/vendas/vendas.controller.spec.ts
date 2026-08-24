import { Test, TestingModule } from '@nestjs/testing';
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

  it('DISTRIBUIDOR: ignora vendedorId do corpo e usa o distribuidor do token', async () => {
    await controller.create(
      { ...dtoBase, vendedorId: 'vendedor-de-outra-rede' },
      usuario({
        perfil: 'DISTRIBUIDOR',
        distribuidorId: 'distribuidor-logado',
      }),
    );

    const enviado = dtoRecebidoPeloService;
    expect(enviado?.distribuidorId).toBe('distribuidor-logado');
    expect(enviado?.vendedorId).toBeUndefined();
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
});
