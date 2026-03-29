import PDFDocument from 'pdfkit';

export type PdfDocument = InstanceType<typeof PDFDocument>;

export type FiltrosRelatorioVendedores = {
  dataInicio?: string;
  dataFim?: string;
  distribuidor?: string;
  ordenarPor?: string;
};

export type FiltrosRelatorioDistribuidores = {
  dataInicio?: string;
  dataFim?: string;
  ordenarPor?: string;
};

export type FiltrosRelatorioClientes = {
  dataInicio?: string;
  dataFim?: string;
  vendedor?: string;
  ordenarPor?: string;
};

export type VendedorRelatorioRow = {
  codigo: number;
  createdAt: Date;
  nome: string;
  cpf: string;
  telefone: string;
  dataNascimento: Date | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string;
  distribuidorNome: string;
  nivel: number;
  totalClientes: number;
};

export type DistribuidorRelatorioRow = {
  codigo: number;
  createdAt: Date;
  nome: string;
  cpf: string;
  telefone: string;
  dataNascimento: Date | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string;
  totalVendedores: number;
};

export type ClienteRelatorioRow = {
  codigo: number;
  createdAt: Date;
  nome: string;
  cpf: string;
  telefone: string;
  dataNascimento: Date | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  email: string | null;
  vendedorNome: string;
  numeroAleatorio: string;
};

export type ClienteRelatorioPdfRow = {
  createdAt: Date;
  nome: string;
  telefone: string;
  email: string | null;
  vendedorNome: string;
};

export type PdfTableCell = {
  text: string;
  width: number;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
};
