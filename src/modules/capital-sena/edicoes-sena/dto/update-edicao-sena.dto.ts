import { PartialType } from '@nestjs/swagger';
import { CreateEdicaoSenaDto } from './create-edicao-sena.dto';

export class UpdateEdicaoSenaDto extends PartialType(CreateEdicaoSenaDto) {}
