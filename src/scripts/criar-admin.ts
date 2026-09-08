import { PrismaClient, Perfil, StatusUsuario } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as readline from 'node:readline';

/**
 * Cadastra (ou atualiza) um usuário com perfil ADMIN.
 *
 * O ADMIN não tem tabela de perfil própria — ele é apenas uma linha em
 * `Usuario` com `perfil: ADMIN`, que é o que `POST /auth/login` valida.
 * Por isso o script fala direto com o Prisma, sem subir o AppModule.
 *
 * Uso (desenvolvimento):
 *   npm run admin:criar -- --email=fulano@dominio.com --senha=SenhaForte
 *
 * Uso (produção, dentro do container — a senha nunca vai para o `ps` nem
 * para o histórico do shell):
 *   docker compose exec api node dist/src/scripts/criar-admin.js --email=fulano@dominio.com
 *
 * A senha vem, nessa ordem: `--senha`, a variável `ADMIN_SENHA` ou um prompt
 * interativo com o eco desligado. Rodar de novo com o mesmo e-mail redefine a
 * senha do admin existente — é upsert, não erro de duplicidade.
 */

const SALT_ROUNDS = 10;
const SENHA_MINIMA = 6;

interface ArgumentosAdmin {
  email: string;
  senha?: string;
}

function lerArgumentos(args: string[]): ArgumentosAdmin {
  const valores = new Map<string, string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }

    const [chave, valorInline] = arg.slice(2).split('=');
    const valor = valorInline ?? args[++i];

    if (valor === undefined) {
      throw new Error(`Informe um valor para --${chave}`);
    }

    valores.set(chave, valor);
  }

  const email = valores.get('email')?.trim().toLowerCase();

  if (!email) {
    throw new Error(
      'Uso: npm run admin:criar -- --email=admin@dominio.com [--senha=SenhaForte]',
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`E-mail inválido: ${email}`);
  }

  return { email, senha: valores.get('senha') };
}

/**
 * Lê a senha sem ecoar no terminal — em produção o comando roda numa sessão
 * SSH, onde a senha em `--senha` ficaria visível no `ps` de qualquer usuário
 * da máquina e no histórico do shell.
 */
function perguntarSenha(rotulo: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new Error(
          'Sem terminal interativo: informe a senha em --senha ou na variável ADMIN_SENHA',
        ),
      );
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // `_writeToOutput` é o ponto onde o readline ecoa o que foi digitado;
    // sobrescrever é a única forma de esconder a senha sem sair do readline.
    const escrever = (texto: string): void => {
      if (texto.includes(rotulo)) {
        process.stdout.write(texto);
      }
    };
    (rl as unknown as { _writeToOutput: (texto: string) => void })
      ._writeToOutput = escrever;

    rl.question(rotulo, (resposta) => {
      rl.close();
      process.stdout.write('\n');
      resolve(resposta);
    });
  });
}

async function resolverSenha(senhaArgumento?: string): Promise<string> {
  const senha =
    senhaArgumento ?? process.env.ADMIN_SENHA ?? (await perguntarSenha('Senha: '));

  if (senha.length < SENHA_MINIMA) {
    throw new Error(`A senha precisa ter ao menos ${SENHA_MINIMA} caracteres`);
  }

  if (senhaArgumento === undefined && process.env.ADMIN_SENHA === undefined) {
    const confirmacao = await perguntarSenha('Confirme a senha: ');
    if (confirmacao !== senha) {
      throw new Error('As senhas não conferem');
    }
  }

  return senha;
}

async function main(): Promise<void> {
  const { email, senha: senhaArgumento } = lerArgumentos(process.argv.slice(2));
  const senha = await resolverSenha(senhaArgumento);
  const prisma = new PrismaClient();

  try {
    const existente = await prisma.usuario.findUnique({
      where: { email },
      select: { id: true, perfil: true },
    });

    // Reaproveitar um e-mail que já é DISTRIBUIDOR ou VENDEDOR promoveria o
    // dono daquele cadastro a ADMIN e deixaria o perfil órfão da tabela dele.
    if (existente && existente.perfil !== Perfil.ADMIN) {
      throw new Error(
        `O e-mail ${email} já pertence a um usuário ${existente.perfil}. Use outro e-mail.`,
      );
    }

    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    const usuario = await prisma.usuario.upsert({
      where: { email },
      update: {
        senhaHash,
        status: StatusUsuario.ATIVO,
        deveRedefinirSenha: false,
      },
      create: {
        email,
        senhaHash,
        perfil: Perfil.ADMIN,
        status: StatusUsuario.ATIVO,
        deveRedefinirSenha: false,
      },
    });

    console.log(
      existente
        ? `♻️  Senha do admin ${usuario.email} redefinida (id: ${usuario.id})`
        : `✅ Admin criado: ${usuario.email} (id: ${usuario.id})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(`❌ ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
