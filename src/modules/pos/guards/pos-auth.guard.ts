import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guard de autenticação do canal POS (valida tokens emitidos com `origem: POS`). */
@Injectable()
export class PosAuthGuard extends AuthGuard('jwt-pos') {}
