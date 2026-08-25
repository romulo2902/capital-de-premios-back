import { Test, TestingModule } from '@nestjs/testing';
import { ClientesService } from './clientes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ClientesService', () => {
  let service: ClientesService;

  const mockPrisma = {
    cliente: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    vendedor: {
      findUnique: jest.fn(),
    },
    distribuidor: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    // `resetAllMocks` (e não `clearAllMocks`) porque este último preserva as
    // implementações de `mockResolvedValue`, fazendo um teste herdar o mock do
    // anterior e passar por ordenação em vez de por asserção.
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClientesService>(ClientesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll should return data array', async () => {
    mockPrisma.cliente.findMany.mockResolvedValue([]);
    mockPrisma.cliente.count.mockResolvedValue(0);
    const result = await service.findAll();
    expect(result.data).toBeDefined();
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      lastPage: 0,
    });
  });

  it('buscarMeusDados should retornar dados sensiveis mascarados por CPF', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Tiago Lima',
      cpf: '03112345675',
      email: 'tiago@hotmail.com',
      telefone: '(64) 98461-4339',
      dataNascimento: new Date('1990-05-20T00:00:00.000Z'),
    });

    const result = await service.buscarMeusDados('031.123.456-75');

    expect(mockPrisma.cliente.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [{ cpf: '03112345675' }, { cpf: '031.123.456-75' }],
      },
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        telefone: true,
        dataNascimento: true,
      },
    });
    expect(result).toEqual({
      message: 'Dados do cliente encontrados',
      data: {
        cliente: {
          id: 'cliente-1',
          nome: 'Tiago Lima',
          cpf: '031.***.***-75',
          cpfMascarado: '031.***.***-75',
          email: 'tia***@hotmail.com',
          emailMascarado: 'tia***@hotmail.com',
          telefone: '(64) *****-4339',
          telefoneMascarado: '(64) *****-4339',
          dataNascimento: '1990-**-**',
          dataNascimentoMascarada: '1990-**-**',
        },
      },
    });
  });

  it('atualizarMeusDados should atualizar pelo id e retornar mascarado', async () => {
    mockPrisma.cliente.update.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Tiago Lima',
      cpf: '03112345675',
      email: 'tiago.novo@hotmail.com',
      telefone: '(64) 98461-4339',
      dataNascimento: new Date('1990-05-20T00:00:00.000Z'),
    });

    const result = await service.atualizarMeusDados('cliente-1', {
      nome: ' Tiago Lima ',
      email: 'TIAGO.NOVO@HOTMAIL.COM',
      telefone: ' (64) 98461-4339 ',
      dataNascimento: '1990-05-20',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith({
      where: { id: 'cliente-1' },
      data: {
        nome: 'Tiago Lima',
        email: 'tiago.novo@hotmail.com',
        telefone: '(64) 98461-4339',
        dataNascimento: new Date('1990-05-20T00:00:00.000Z'),
      },
      select: {
        id: true,
        nome: true,
        cpf: true,
        email: true,
        telefone: true,
        dataNascimento: true,
      },
    });
    expect(result.data.cliente).toEqual({
      id: 'cliente-1',
      nome: 'Tiago Lima',
      cpf: '031.***.***-75',
      cpfMascarado: '031.***.***-75',
      email: 'tia***@hotmail.com',
      emailMascarado: 'tia***@hotmail.com',
      telefone: '(64) *****-4339',
      telefoneMascarado: '(64) *****-4339',
      dataNascimento: '1990-**-**',
      dataNascimentoMascarada: '1990-**-**',
    });
  });

  it('atualizarMeusDados should exigir ao menos um campo', async () => {
    await expect(service.atualizarMeusDados('cliente-1', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  // A carteira é da rede, não do vendedor: quem está logado enxerga todos os
  // clientes do próprio distribuidor, inclusive os que outro vendedor da rede
  // atendeu e os captados direto pelo distribuidor.
  it('findAll should limitar clientes à rede do vendedor autenticado', async () => {
    mockPrisma.cliente.findMany.mockResolvedValue([]);
    mockPrisma.cliente.count.mockResolvedValue(0);
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      distribuidorId: 'distribuidor-1',
    });

    await service.findAll(1, 20, undefined, undefined, undefined, {
      id: 'usuario-vendedor',
      email: 'vend@test.com',
      cpf: '12345678900',
      perfil: 'VENDEDOR',
      status: 'ATIVO',
      vendedorId: 'vendedor-1',
    });

    expect(mockPrisma.vendedor.findUnique).toHaveBeenCalledWith({
      where: { id: 'vendedor-1' },
      select: { distribuidorId: true },
    });
    expect(mockPrisma.cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { distribuidorId: 'distribuidor-1' },
      }),
    );
  });

  it('findOne should aceitar cliente de outro vendedor da mesma rede', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      distribuidorId: 'distribuidor-1',
    });
    mockPrisma.cliente.findFirst.mockResolvedValue({
      id: 'cliente-do-colega',
      vendedorId: 'vendedor-2',
      distribuidorId: 'distribuidor-1',
    });

    const cliente = await service.findOne('cliente-do-colega', {
      id: 'usuario-vendedor',
      email: 'vend@test.com',
      cpf: '12345678900',
      perfil: 'VENDEDOR',
      status: 'ATIVO',
      vendedorId: 'vendedor-1',
    });

    expect(cliente.id).toBe('cliente-do-colega');
    expect(mockPrisma.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { id: 'cliente-do-colega' },
            { distribuidorId: 'distribuidor-1' },
          ],
        },
      }),
    );
  });

  // Sem cadastro de vendedor não há rede. Cair para escopo vazio devolveria a
  // base inteira, que é o oposto do que o escopo existe para fazer.
  it('findAll should recusar vendedor cujo cadastro não existe mais', async () => {
    mockPrisma.vendedor.findUnique.mockResolvedValue(null);

    await expect(
      service.findAll(1, 20, undefined, undefined, undefined, {
        id: 'usuario-vendedor',
        email: 'vend@test.com',
        cpf: '12345678900',
        perfil: 'VENDEDOR',
        status: 'ATIVO',
        vendedorId: 'vendedor-fantasma',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.cliente.findMany).not.toHaveBeenCalled();
  });

  it('create should vincular cliente ao vendedor autenticado', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
    mockPrisma.vendedor.findUnique.mockResolvedValueOnce({
      id: 'vendedor-logado',
      distribuidorId: 'distribuidor-1',
    });
    mockPrisma.cliente.create.mockResolvedValue({
      id: 'cliente-1',
      vendedorId: 'vendedor-logado',
      distribuidorId: 'distribuidor-1',
    });

    await service.create(
      {
        cpf: '200.074.694-20',
        nome: 'Cliente Teste',
        telefone: '(84) 99999-9999',
        dataNascimento: '1990-01-01',
      },
      {
        id: 'usuario-1',
        email: 'vend@test.com',
        cpf: '12345678900',
        perfil: 'VENDEDOR',
        status: 'ATIVO',
        vendedorId: 'vendedor-logado',
      },
    );

    expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendedorId: 'vendedor-logado',
          distribuidorId: 'distribuidor-1',
        }),
      }),
    );
  });

  it('create should impedir distribuidor de usar vendedor fora da propria rede', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
    mockPrisma.vendedor.findUnique.mockResolvedValueOnce({
      id: 'vendedor-externo',
      distribuidorId: 'distribuidor-externo',
    });

    await expect(
      service.create(
        {
          cpf: '200.074.694-20',
          nome: 'Cliente Teste',
          telefone: '(84) 99999-9999',
          dataNascimento: '1990-01-01',
          vendedorId: 'vendedor-externo',
        },
        {
          id: 'usuario-2',
          email: 'dist@test.com',
          cpf: '12345678900',
          perfil: 'DISTRIBUIDOR',
          status: 'ATIVO',
          distribuidorId: 'distribuidor-1',
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('create should exigir data de nascimento', async () => {
    mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.create(
        {
          cpf: '200.074.694-20',
          nome: 'Cliente Teste',
          telefone: '(84) 99999-9999',
        },
        {
          id: 'usuario-1',
          email: 'admin@test.com',
          cpf: '12345678900',
          perfil: 'ADMIN',
          status: 'ATIVO',
        },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('update should normalize empty distribuidorId to null', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
      id: 'cliente-1',
      nome: 'Cliente Teste',
      vendedorId: 'vendedor-1',
      distribuidorId: 'distribuidor-1',
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-1',
      nome: 'Vendedor Teste',
      distribuidorId: 'distribuidor-1',
    });
    mockPrisma.cliente.update.mockResolvedValue({
      id: 'cliente-1',
      vendedorId: 'vendedor-1',
      distribuidorId: 'distribuidor-1',
    });

    await service.update('cliente-1', {
      vendedorId: 'vendedor-1',
      distribuidorId: '',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cliente-1' },
        data: expect.objectContaining({
          vendedorId: 'vendedor-1',
          distribuidorId: 'distribuidor-1',
        }),
      }),
    );
  });

  it('update should manter vendedor e distribuidor quando ambos sao informados', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
      id: 'cliente-2',
      nome: 'Cliente Teste 2',
      vendedorId: null,
      distribuidorId: null,
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-2',
      nome: 'Vendedor Teste 2',
      distribuidorId: 'distribuidor-2',
    });
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'distribuidor-2',
      nome: 'Distribuidor Teste 2',
    });
    mockPrisma.cliente.update.mockResolvedValue({
      id: 'cliente-2',
      vendedorId: 'vendedor-2',
      distribuidorId: 'distribuidor-2',
    });

    await service.update('cliente-2', {
      vendedorId: 'vendedor-2',
      distribuidorId: 'distribuidor-2',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cliente-2' },
        data: expect.objectContaining({
          vendedorId: 'vendedor-2',
          distribuidorId: 'distribuidor-2',
        }),
      }),
    );
  });

  it('update should respeitar o distribuidor informado mesmo divergindo do vendedor', async () => {
    // Antes esta combinacao era recusada com ConflictException. A regra mudou:
    // o valor explicito vence, e a coerencia passou a ser garantida no
    // controller (so ADMIN informa distribuidorId livremente).
    mockPrisma.cliente.findFirst.mockResolvedValueOnce({
      id: 'cliente-3',
      nome: 'Cliente Teste 3',
      vendedorId: null,
      distribuidorId: null,
    });
    mockPrisma.vendedor.findUnique.mockResolvedValue({
      id: 'vendedor-3',
      nome: 'Vendedor Teste 3',
      distribuidorId: 'distribuidor-correto',
    });
    mockPrisma.distribuidor.findUnique.mockResolvedValue({
      id: 'distribuidor-informado',
      nome: 'Distribuidor Informado',
    });
    mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-3' });

    await service.update('cliente-3', {
      vendedorId: 'vendedor-3',
      distribuidorId: 'distribuidor-informado',
    });

    expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cliente-3' },
        data: expect.objectContaining({
          vendedorId: 'vendedor-3',
          distribuidorId: 'distribuidor-informado',
        }),
      }),
    );
  });

  it('findOne should nao retornar cliente fora do distribuidor autenticado', async () => {
    mockPrisma.cliente.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('cliente-1', {
        id: 'usuario-dist',
        email: 'dist@test.com',
        cpf: '12345678900',
        perfil: 'DISTRIBUIDOR',
        status: 'ATIVO',
        distribuidorId: 'distribuidor-1',
      }),
    ).rejects.toThrow('Cliente não encontrado');

    expect(mockPrisma.cliente.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ id: 'cliente-1' }, { distribuidorId: 'distribuidor-1' }],
        },
      }),
    );
  });
  // ─── CHARACTERIZATION: derivacao do vinculo cliente ──────────────────
  // Contraparte dos testes em VendasService. Aqui a regra JA e estrita:
  // par divergente e rejeitado. Este e o comportamento que deve prevalecer
  // quando os dois caminhos passarem pelo helper unico.
  describe('create — vinculo do cliente (ADMIN)', () => {
    const admin = {
      id: 'usuario-admin',
      email: 'admin@test.com',
      cpf: '12345678900',
      perfil: 'ADMIN',
      status: 'ATIVO',
    };

    const dtoBase = {
      cpf: '200.074.694-20',
      nome: 'Cliente Teste',
      telefone: '(84) 99999-9999',
      dataNascimento: '1990-01-01',
    };

    it('deriva o distribuidor a partir do vendedor quando nao informado', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
      mockPrisma.vendedor.findUnique.mockResolvedValueOnce({
        id: 'vendedor-1',
        distribuidorId: 'distribuidor-do-vendedor',
      });
      mockPrisma.cliente.create.mockResolvedValue({ id: 'cliente-1' });

      await service.create({ ...dtoBase, vendedorId: 'vendedor-1' }, admin);

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-1',
            distribuidorId: 'distribuidor-do-vendedor',
          }),
        }),
      );
    });

    it('EXPLICITO VENCE: usa o distribuidor informado mesmo divergindo do vendedor', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
      mockPrisma.vendedor.findUnique.mockResolvedValueOnce({
        id: 'vendedor-1',
        distribuidorId: 'distribuidor-real',
      });
      mockPrisma.distribuidor.findUnique.mockResolvedValueOnce({
        id: 'distribuidor-informado',
      });
      mockPrisma.cliente.create.mockResolvedValue({ id: 'cliente-1' });

      await service.create(
        {
          ...dtoBase,
          vendedorId: 'vendedor-1',
          distribuidorId: 'distribuidor-informado',
        },
        admin,
      );

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-1',
            distribuidorId: 'distribuidor-informado',
          }),
        }),
      );
    });

    it('permite cliente orfao quando nenhum vinculo e informado', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
      mockPrisma.cliente.create.mockResolvedValue({ id: 'cliente-1' });

      await service.create({ ...dtoBase }, admin);

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: null,
            distribuidorId: null,
          }),
        }),
      );
    });

    it('permite vinculo apenas com distribuidor, sem vendedor', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
      mockPrisma.distribuidor.findUnique.mockResolvedValueOnce({
        id: 'distribuidor-1',
      });
      mockPrisma.cliente.create.mockResolvedValue({ id: 'cliente-1' });

      await service.create(
        { ...dtoBase, distribuidorId: 'distribuidor-1' },
        admin,
      );

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: null,
            distribuidorId: 'distribuidor-1',
          }),
        }),
      );
    });
  });
  // ─── REGRESSAO: distribuidor armazenado nao e "explicito" ────────────
  // Só o que chega NA REQUISICAO conta como valor explicito. O distribuidor
  // ja gravado no cliente nao e escolha do chamador — quando o campo nao vem
  // no DTO e ha vendedor, o vinculo tem de ser derivado dele.
  describe('update — origem do distribuidor', () => {
    it('deriva do vendedor quando o distribuidor nao veio na requisicao', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-x',
        nome: 'Cliente X',
        vendedorId: null,
        distribuidorId: 'distribuidor-antigo',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-novo',
        distribuidorId: 'distribuidor-novo',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-x' });

      // PATCH informa SO o vendedor; distribuidorId ausente do DTO.
      await service.update('cliente-x', { vendedorId: 'vendedor-novo' });

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-novo',
            distribuidorId: 'distribuidor-novo',
          }),
        }),
      );
    });

    it('preserva o distribuidor atual quando nao ha vendedor envolvido', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-y',
        nome: 'Cliente Y',
        vendedorId: null,
        distribuidorId: 'distribuidor-atual',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-y' });

      // Remove o vendedor (ja era nulo) sem tocar no distribuidor.
      await service.update('cliente-y', { vendedorId: null });

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: null,
            distribuidorId: 'distribuidor-atual',
          }),
        }),
      );
    });

    it('distribuidor informado na requisicao continua vencendo', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-z',
        nome: 'Cliente Z',
        vendedorId: null,
        distribuidorId: 'distribuidor-antigo',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-1',
        distribuidorId: 'distribuidor-do-vendedor',
      });
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-informado',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-z' });

      await service.update('cliente-z', {
        vendedorId: 'vendedor-1',
        distribuidorId: 'distribuidor-informado',
      });

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-1',
            distribuidorId: 'distribuidor-informado',
          }),
        }),
      );
    });
  });
  // ─── REGRESSAO: PATCH sem guard de perfil ────────────────────────────
  // Ao remover o ConflictException, o update ficou sem qualquer checagem de
  // perfil — e PATCH /admin/clientes/:id e aberto a ADMIN, DISTRIBUIDOR e
  // VENDEDOR. O escopo de leitura controla QUAIS clientes o usuario enxerga,
  // nao para onde ele pode move-los.
  describe('update — guard de rede por perfil', () => {
    const clienteProprio = {
      id: 'cliente-1',
      nome: 'Cliente',
      vendedorId: 'vendedor-logado',
      distribuidorId: 'distribuidor-A',
    };

    const vendedorLogado = {
      id: 'usuario-v',
      email: 'v@test.com',
      cpf: '12345678900',
      perfil: 'VENDEDOR',
      status: 'ATIVO',
      vendedorId: 'vendedor-logado',
    } as const;

    const distribuidorLogado = {
      id: 'usuario-d',
      email: 'd@test.com',
      cpf: '12345678900',
      perfil: 'DISTRIBUIDOR',
      status: 'ATIVO',
      distribuidorId: 'distribuidor-A',
    } as const;

    it('VENDEDOR nao move cliente para distribuidor de outra rede', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-B',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-logado',
        distribuidorId: 'distribuidor-A',
      });

      await expect(
        service.update(
          'cliente-1',
          { distribuidorId: 'distribuidor-B' },
          vendedorLogado,
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
    });

    it('VENDEDOR nao aponta cliente para outro vendedor', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'outro-vendedor',
        distribuidorId: 'distribuidor-A',
      });

      await expect(
        service.update(
          'cliente-1',
          { vendedorId: 'outro-vendedor' },
          vendedorLogado,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DISTRIBUIDOR nao move cliente para outra rede', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-B',
      });

      await expect(
        service.update(
          'cliente-1',
          { distribuidorId: 'distribuidor-B' },
          distribuidorLogado,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DISTRIBUIDOR nao aponta cliente para vendedor de outra rede', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-externo',
        distribuidorId: 'distribuidor-B',
      });

      await expect(
        service.update(
          'cliente-1',
          { vendedorId: 'vendedor-externo' },
          distribuidorLogado,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('VENDEDOR ainda atualiza dados do proprio cliente', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-1' });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-logado',
        distribuidorId: 'distribuidor-A',
      });

      await service.update('cliente-1', { nome: 'Novo Nome' }, vendedorLogado);

      expect(mockPrisma.cliente.update).toHaveBeenCalled();
    });

    it('ADMIN segue com vinculo livre', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-B',
      });
      // O cliente tem vendedor: a decisão precisa da rede dele para saber se
      // o vendedor cede ao distribuidor informado.
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-logado',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-1' });

      await service.update(
        'cliente-1',
        { distribuidorId: 'distribuidor-B' },
        {
          id: 'usuario-admin',
          email: 'admin@test.com',
          cpf: '12345678900',
          perfil: 'ADMIN',
          status: 'ATIVO',
        },
      );

      expect(mockPrisma.cliente.update).toHaveBeenCalled();
    });
  });
  // ─── REGRESSAO: par cruzado a partir do vendedor armazenado ──────────
  describe('update — distribuidor explicito vs vendedor do cadastro', () => {
    const admin = {
      id: 'usuario-admin',
      email: 'admin@test.com',
      cpf: '12345678900',
      perfil: 'ADMIN',
      status: 'ATIVO',
    } as const;

    it('limpa o vendedor do cadastro quando o distribuidor informado e de outra rede', async () => {
      // O vendedor V nao foi escolhido nesta requisicao; o distribuidor sim.
      // Gravar {V, B} criaria um cliente visivel por duas redes ao mesmo tempo.
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-1',
        nome: 'Cliente',
        vendedorId: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-B',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-1' });

      await service.update(
        'cliente-1',
        { distribuidorId: 'distribuidor-B' },
        admin,
      );

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: null,
            distribuidorId: 'distribuidor-B',
          }),
        }),
      );
    });

    it('mantem o vendedor do cadastro quando o distribuidor informado e o da rede dele', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-2',
        nome: 'Cliente',
        vendedorId: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-A',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-2' });

      await service.update(
        'cliente-2',
        { distribuidorId: 'distribuidor-A' },
        admin,
      );

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-rede-A',
            distribuidorId: 'distribuidor-A',
          }),
        }),
      );
    });

    it('vendedor explicito de outra rede continua vencendo (regra do explicito)', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-3',
        nome: 'Cliente',
        vendedorId: null,
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-rede-B',
        distribuidorId: 'distribuidor-B',
      });
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-B',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-3' });

      await service.update(
        'cliente-3',
        { vendedorId: 'vendedor-rede-B', distribuidorId: 'distribuidor-B' },
        admin,
      );

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-rede-B',
            distribuidorId: 'distribuidor-B',
          }),
        }),
      );
    });
  });

  // ─── REGRESSAO: null explicito atravessava o guard ───────────────────
  describe('update — desvinculacao explicita por perfil', () => {
    const clienteProprio = {
      id: 'cliente-1',
      nome: 'Cliente',
      vendedorId: 'vendedor-logado',
      distribuidorId: 'distribuidor-A',
    };

    it('VENDEDOR nao pode desvincular o cliente de si mesmo', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-logado',
        distribuidorId: 'distribuidor-A',
      });

      await expect(
        service.update(
          'cliente-1',
          { vendedorId: null },
          {
            id: 'usuario-v',
            email: 'v@test.com',
            cpf: '12345678900',
            perfil: 'VENDEDOR',
            status: 'ATIVO',
            vendedorId: 'vendedor-logado',
          },
        ),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.cliente.update).not.toHaveBeenCalled();
    });

    it('DISTRIBUIDOR nao pode desvincular o cliente da propria rede', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);

      await expect(
        service.update(
          'cliente-1',
          { distribuidorId: null },
          {
            id: 'usuario-d',
            email: 'd@test.com',
            cpf: '12345678900',
            perfil: 'DISTRIBUIDOR',
            status: 'ATIVO',
            distribuidorId: 'distribuidor-A',
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('DISTRIBUIDOR pode soltar o vendedor mantendo o cliente na rede', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce(clienteProprio);
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-1' });

      await service.update(
        'cliente-1',
        { vendedorId: null },
        {
          id: 'usuario-d',
          email: 'd@test.com',
          cpf: '12345678900',
          perfil: 'DISTRIBUIDOR',
          status: 'ATIVO',
          distribuidorId: 'distribuidor-A',
        },
      );

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: null,
            distribuidorId: 'distribuidor-A',
          }),
        }),
      );
    });
  });

  // ─── REGRESSAO: guard de update vazou para a criacao ─────────────────
  // O DTO converte string vazia em null e documenta isso como "remover o
  // vinculo". Na CRIACAO nao ha vinculo a remover: o campo em branco significa
  // apenas "nao informado" e o vinculo e forcado ao do proprio usuario.
  describe('create — vinculo enviado vazio', () => {
    it('VENDEDOR cria cliente normalmente com vendedorId nulo no payload', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-logado',
        distribuidorId: 'distribuidor-1',
      });
      mockPrisma.cliente.create.mockResolvedValue({ id: 'cliente-1' });

      await service.create(
        {
          cpf: '200.074.694-20',
          nome: 'Cliente Teste',
          telefone: '(84) 99999-9999',
          dataNascimento: '1990-01-01',
          vendedorId: null,
        },
        {
          id: 'usuario-1',
          email: 'vend@test.com',
          cpf: '12345678900',
          perfil: 'VENDEDOR',
          status: 'ATIVO',
          vendedorId: 'vendedor-logado',
        },
      );

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-logado',
            distribuidorId: 'distribuidor-1',
          }),
        }),
      );
    });

    it('DISTRIBUIDOR cria cliente normalmente com distribuidorId nulo no payload', async () => {
      mockPrisma.cliente.findUnique.mockResolvedValueOnce(null);
      mockPrisma.cliente.create.mockResolvedValue({ id: 'cliente-2' });

      await service.create(
        {
          cpf: '200.074.694-20',
          nome: 'Cliente Teste',
          telefone: '(84) 99999-9999',
          dataNascimento: '1990-01-01',
          distribuidorId: null,
        },
        {
          id: 'usuario-2',
          email: 'dist@test.com',
          cpf: '12345678900',
          perfil: 'DISTRIBUIDOR',
          status: 'ATIVO',
          distribuidorId: 'distribuidor-1',
        },
      );

      expect(mockPrisma.cliente.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: null,
            distribuidorId: 'distribuidor-1',
          }),
        }),
      );
    });
  });

  // ─── REGRESSAO: PATCH sem mudanca nao pode apagar o vendedor ─────────
  // A regra "o vendedor do cadastro cede ao distribuidor explicito" existe
  // para quando o cliente MUDA de rede. Reenviar o distribuidor atual nao
  // pede mudanca nenhuma e nao pode destruir o vinculo do vendedor.
  describe('update — reenvio do distribuidor atual e idempotente', () => {
    const admin = {
      id: 'usuario-admin',
      email: 'admin@test.com',
      cpf: '12345678900',
      perfil: 'ADMIN',
      status: 'ATIVO',
    } as const;

    it('preserva o vendedor quando o distribuidor informado e o que ja estava gravado', async () => {
      // Par cruzado pre-existente: legitimo sob a regra do explicito vence.
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-1',
        nome: 'Cliente',
        vendedorId: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-B',
      });
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-B',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-1' });

      await service.update(
        'cliente-1',
        { distribuidorId: 'distribuidor-B' },
        admin,
      );

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: 'vendedor-rede-A',
            distribuidorId: 'distribuidor-B',
          }),
        }),
      );
    });

    it('ainda cede quando a rede muda de verdade', async () => {
      mockPrisma.cliente.findFirst.mockResolvedValueOnce({
        id: 'cliente-2',
        nome: 'Cliente',
        vendedorId: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.distribuidor.findUnique.mockResolvedValue({
        id: 'distribuidor-B',
      });
      mockPrisma.vendedor.findUnique.mockResolvedValue({
        id: 'vendedor-rede-A',
        distribuidorId: 'distribuidor-A',
      });
      mockPrisma.cliente.update.mockResolvedValue({ id: 'cliente-2' });

      await service.update(
        'cliente-2',
        { distribuidorId: 'distribuidor-B' },
        admin,
      );

      expect(mockPrisma.cliente.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vendedorId: null,
            distribuidorId: 'distribuidor-B',
          }),
        }),
      );
    });
  });
});
