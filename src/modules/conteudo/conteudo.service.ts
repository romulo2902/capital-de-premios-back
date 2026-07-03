import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaginaDto } from './dto/create-pagina.dto';
import { UpdatePaginaDto } from './dto/update-pagina.dto';

@Injectable()
export class ConteudoService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaginaDto) {
    const slugExiste = await (this.prisma as any).paginaConteudo.findUnique({
      where: { slug: dto.slug },
    });

    if (slugExiste) {
      throw new ConflictException(`Já existe uma página com o slug '${dto.slug}'`);
    }

    const pagina = await (this.prisma as any).paginaConteudo.create({
      data: {
        slug: dto.slug,
        titulo: dto.titulo,
        conteudo: dto.conteudo,
        ativo: dto.ativo ?? true,
      },
    });

    return { message: 'Página criada com sucesso', data: pagina };
  }

  async findAll() {
    const paginas = await (this.prisma as any).paginaConteudo.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return { message: 'Páginas listadas', data: paginas };
  }

  async findOne(id: string) {
    const pagina = await (this.prisma as any).paginaConteudo.findUnique({
      where: { id },
    });

    if (!pagina) throw new NotFoundException('Página não encontrada');

    return { message: 'Página encontrada', data: pagina };
  }

  async findBySlug(slug: string) {
    const pagina = await (this.prisma as any).paginaConteudo.findUnique({
      where: { slug },
    });

    if (!pagina || !pagina.ativo) throw new NotFoundException('Página não encontrada ou inativa');

    return { message: 'Página encontrada', data: pagina };
  }

  async update(id: string, dto: UpdatePaginaDto) {
    const pagina = await (this.prisma as any).paginaConteudo.findUnique({ where: { id } });
    if (!pagina) throw new NotFoundException('Página não encontrada');

    if (dto.slug && dto.slug !== pagina.slug) {
      const slugExiste = await (this.prisma as any).paginaConteudo.findUnique({
        where: { slug: dto.slug },
      });
      if (slugExiste) throw new ConflictException(`Já existe uma página com o slug '${dto.slug}'`);
    }

    const paginaAtualizada = await (this.prisma as any).paginaConteudo.update({
      where: { id },
      data: dto,
    });

    return { message: 'Página atualizada com sucesso', data: paginaAtualizada };
  }

  async remove(id: string) {
    const pagina = await (this.prisma as any).paginaConteudo.findUnique({ where: { id } });
    if (!pagina) throw new NotFoundException('Página não encontrada');

    await (this.prisma as any).paginaConteudo.delete({ where: { id } });

    return { message: 'Página removida com sucesso' };
  }
}
