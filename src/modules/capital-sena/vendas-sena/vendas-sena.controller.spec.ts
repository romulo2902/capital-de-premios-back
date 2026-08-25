import { Test, TestingModule } from '@nestjs/testing';
import { VendasSenaController } from './vendas-sena.controller';
import { VendasSenaLojaController } from './vendas-sena-loja.controller';
import { VendasSenaService } from './vendas-sena.service';
import { CreateVendaSenaDto } from './dto/create-venda-sena.dto';
import type { RequestUser } from '../../auth/strategies/jwt.strategy';

/**
 * O vínculo comercial da venda Sena define para quem vai a comissão
 * (gerarComissaoSena credita o saldo a partir dele). Estes testes travam a
 * regra de que ele nunca pode ser escolhido pelo corpo da requisição.
 */
describe('Vendas Sena — vínculo comercial nos controllers', () => {
  let controller: VendasSenaController;
  let lojaController: VendasSenaLojaController;

  let dtoRecebido: CreateVendaSenaDto | undefined;

  const mockService = {
    create: jest.fn((dto: CreateVendaSenaDto) => {
      dtoRecebido = dto;
      return Promise.resolve({ id: 'venda-sena-1' });
    }),
  };

  const dtoBase = {
    edicaoSenaId: 'edicao-1',
    numeros: [{ numeros: [1, 2, 3, 4, 5, 6], bola_extra: 7 }],
  } as unknown as CreateVendaSenaDto;

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
    dtoRecebido = undefined;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendasSenaController, VendasSenaLojaController],
      providers: [{ provide: VendasSenaService, useValue: mockService }],
    }).compile();

    controller = module.get<VendasSenaController>(VendasSenaController);
    lojaController = module.get<VendasSenaLojaController>(
      VendasSenaLojaController,
    );
  });

  describe('rota autenticada (POST /admin/capital-sena/vendas)', () => {
    it('VENDEDOR: ignora distribuidorId do corpo e usa o vendedor do token', async () => {
      await controller.create(
        { ...dtoBase, distribuidorId: 'distribuidor-de-outra-rede' },
        usuario({ perfil: 'VENDEDOR', vendedorId: 'vendedor-logado' }),
      );

      expect(dtoRecebido?.vendedorId).toBe('vendedor-logado');
      expect(dtoRecebido?.distribuidorId).toBeUndefined();
    });

    it('DISTRIBUIDOR: ignora vendedorId do corpo e usa o distribuidor do token', async () => {
      await controller.create(
        { ...dtoBase, vendedorId: 'vendedor-de-outra-rede' },
        usuario({
          perfil: 'DISTRIBUIDOR',
          distribuidorId: 'distribuidor-logado',
        }),
      );

      expect(dtoRecebido?.distribuidorId).toBe('distribuidor-logado');
      expect(dtoRecebido?.vendedorId).toBeUndefined();
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

      expect(dtoRecebido?.vendedorId).toBe('vendedor-1');
      expect(dtoRecebido?.distribuidorId).toBe('distribuidor-1');
    });
  });

  describe('rota publica (POST /capital-sena/comprar)', () => {
    it('descarta vendedorId e distribuidorId enviados no corpo', async () => {
      await lojaController.comprar({
        ...dtoBase,
        vendedorId: 'vendedor-escolhido-pelo-atacante',
        distribuidorId: 'distribuidor-escolhido-pelo-atacante',
      });

      expect(dtoRecebido?.vendedorId).toBeUndefined();
      expect(dtoRecebido?.distribuidorId).toBeUndefined();
    });

    it('preserva seller_id, que e o unico vinculo aceito na loja', async () => {
      await lojaController.comprar({
        ...dtoBase,
        seller_id: 'usuario-do-vendedor',
        distribuidorId: 'distribuidor-injetado',
      });

      expect(dtoRecebido?.seller_id).toBe('usuario-do-vendedor');
      expect(dtoRecebido?.distribuidorId).toBeUndefined();
    });
  });
});
