import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
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

    it('DISTRIBUIDOR: usa o distribuidor do token e preserva o vendedor do corpo', async () => {
      // Mesma regra do Capital Premios: o distribuidor pode lancar venda para
      // um vendedor da propria rede, e o service valida a posse.
      await controller.create(
        { ...dtoBase, vendedorId: 'vendedor-da-rede' },
        usuario({
          perfil: 'DISTRIBUIDOR',
          distribuidorId: 'distribuidor-logado',
        }),
      );

      expect(dtoRecebido?.distribuidorId).toBe('distribuidor-logado');
      expect(dtoRecebido?.vendedorId).toBe('vendedor-da-rede');
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
  describe('vinculo do token vence seller_id e ausencia de vinculo', () => {
    // Regressao: o service faz `sellerOrigem.X ?? dto.X`, entao um seller_id
    // apontando para outra rede sobrescrevia o vinculo vindo do token.
    it('VENDEDOR: descarta seller_id do corpo', async () => {
      await controller.create(
        { ...dtoBase, seller_id: 'usuario-de-outra-rede' },
        usuario({ perfil: 'VENDEDOR', vendedorId: 'vendedor-logado' }),
      );

      expect(dtoRecebido?.seller_id).toBeUndefined();
      expect(dtoRecebido?.vendedorId).toBe('vendedor-logado');
    });

    it('DISTRIBUIDOR: descarta seller_id do corpo', async () => {
      await controller.create(
        { ...dtoBase, seller_id: 'usuario-de-outra-rede' },
        usuario({
          perfil: 'DISTRIBUIDOR',
          distribuidorId: 'distribuidor-logado',
        }),
      );

      expect(dtoRecebido?.seller_id).toBeUndefined();
      expect(dtoRecebido?.distribuidorId).toBe('distribuidor-logado');
    });

    it('ADMIN: preserva seller_id', async () => {
      await controller.create(
        { ...dtoBase, seller_id: 'usuario-seller' },
        usuario({ perfil: 'ADMIN' }),
      );

      expect(dtoRecebido?.seller_id).toBe('usuario-seller');
    });

    it('VENDEDOR sem vinculo no token e recusado', async () => {
      expect(() =>
        controller.create(
          { ...dtoBase, distribuidorId: 'qualquer-rede' },
          usuario({ perfil: 'VENDEDOR', vendedorId: undefined }),
        ),
      ).toThrow(ForbiddenException);

      expect(mockService.create).not.toHaveBeenCalled();
    });
  });
});
