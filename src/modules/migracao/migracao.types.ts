type TipoPlanilha =
  | 'DISTRIBUIDORES'
  | 'VENDEDORES'
  | 'CLIENTES'
  | 'DESCONHECIDA';

export interface ContagemImportacao {
  lidos: number;
  criados: number;
  atualizados: number;
  ignorados: number;
  erros: number;
}

export interface LinhaVendedorImportacao {
  rowNumber: number;
  nome: string;
  cpf: string;
  telefone: string | null;
  dataNascimento: Date | undefined;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string;
  distribuidorId: string;
}

export interface RelatorioImportacao {
  distribuidores: ContagemImportacao;
  vendedores: ContagemImportacao;
  clientes: ContagemImportacao;
  erros: string[];
}

export interface ArquivoXlsxUpload {
  buffer: Uint8Array;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

export type { TipoPlanilha };
