import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type {
  OperationObject,
  PathItemObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { Response } from 'express';

const DOCS_BASE_PATH = 'api/docs';
const SWAGGER_BASE_PATH = 'api/swagger';
const DOCS_JSON_BASE_PATH = 'api/docs-json';
const SWAGGER_ADMIN_FLAT_PATH = 'api/swagger-admin';
const SWAGGER_GERAL_FLAT_PATH = 'api/swagger-geral';
const SWAGGER_WHATSAPP_FLAT_PATH = 'api/swagger-whatsapp';
const SWAGGER_POS_FLAT_PATH = 'api/swagger-pos';
const SWAGGER_SENA_ADMIN_FLAT_PATH = 'api/swagger-sena-admin';
const SWAGGER_SENA_LOJA_FLAT_PATH = 'api/swagger-sena-loja';
const ADMIN_TAG_PREFIX = 'Admin /';
const SENA_ADMIN_TAG_PREFIX = 'Sena Admin /';
const SENA_LOJA_TAG_PREFIX = 'Sena /';
const WHATSAPP_TAG = 'WhatsApp API';
const REDOC_STANDALONE_JS_URL =
  'https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js';
const DOCS_FAVICON_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%23b45309'/%3E%3Cpath d='M20 18h16c7.732 0 14 6.268 14 14S43.732 46 36 46H20zm8 8v12h8a6 6 0 1 0 0-12z' fill='white'/%3E%3C/svg%3E";
const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
] as const;

type SwaggerAudience =
  | 'admin'
  | 'geral'
  | 'whatsapp'
  | 'pos'
  | 'sena-admin'
  | 'sena-loja'
  | 'shared';
type HttpMethod = (typeof HTTP_METHODS)[number];

export function setupOpenApiDocs(
  app: NestExpressApplication,
  port: number,
  logger: Logger,
): void {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Capital de Prêmios API')
    .setDescription('Documentação completa da Capital de Prêmios API.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const fullDocument = SwaggerModule.createDocument(app, swaggerConfig);
  const adminDocument = buildAudienceDocument(
    fullDocument,
    'admin',
    'Capital de Prêmios API - Admin',
    [
      'Rotas do painel administrativo.',
      '',
      '**Usuários**: ADMIN, DISTRIBUIDOR, VENDEDOR',
      '',
      '- Login admin: `POST /api/auth/login` (email + senha)',
      '- Refresh token: `POST /api/auth/refresh`',
      '- Redefinir senha migrada: `POST /api/auth/redefinir-senha-primeiro-acesso`',
      '- Demais endpoints administrativos em `/api/admin/*`',
      '',
      '**Fluxo de teste do sorteio**',
      '',
      '- Criar ou ajustar a edição em `POST /api/admin/edicoes` ou `PATCH /api/admin/edicoes/{id}`',
      '- Usar datas no formato `YYYY-MM-DDTHH:mm`, por exemplo `2026-04-28T15:30`',
      '- Ativar a edição em `PATCH /api/admin/edicoes/{id}/ativar`',
      '- A edição precisa chegar em `ENCERRADA` para permitir `POST /api/admin/sorteio/{edicaoId}/iniciar`',
      '- Após iniciar, usar `POST /api/admin/sorteio/{edicaoId}/premio/{premioId}/marcar` para marcar números',
      '- Finalizar em `POST /api/admin/sorteio/{edicaoId}/finalizar`',
    ].join('\n'),
  );
  const whatsappDocument = buildAudienceDocument(
    fullDocument,
    'whatsapp',
    'Capital de Prêmios API - WhatsApp',
    [
      '## WhatsApp API — Guia de Integração',
      '',
      'Collection dedicada para bots e CRMs que vendem bilhetes via WhatsApp.',
      '',
      '### Fluxo recomendado',
      '',
      '```',
      '1. POST /api/whatsapp/auth                         — Registrar/autenticar cliente por CPF',
      '2. GET  /api/whatsapp/campanhas/ativa              — Consultar campanha/edição ativa',
      '3. POST /api/whatsapp/campanhas/:id/cotas/preview  — Preview de cotas (sem reservar)',
      '4. POST /api/whatsapp/pedidos                      — Criar pedido + gerar PIX (requer Bearer)',
      '5. GET  /api/whatsapp/pedidos/:id/pagamento        — Consultar status do pagamento (requer Bearer)',
      '6. GET  /api/whatsapp/pedidos/:id/cartelas         — Retornar cartelas compradas (requer Bearer)',
      '7. GET  /api/whatsapp/pedidos                      — Listar pedidos do cliente (requer Bearer)',
      '8. POST /api/whatsapp/webhook/pagamento            — Webhook PagBank (sem auth)',
      '```',
      '',
      '### Autenticação',
      '',
      'Use o `accessToken` retornado em `POST /api/whatsapp/auth` no header:',
      '`Authorization: Bearer {accessToken}`',
    ].join('\n'),
  );
  const posDocument = buildAudienceDocument(
    fullDocument,
    'pos',
    'Capital de Prêmios API - POS',
    [
      '## POS — Terminais de venda',
      '',
      'Rotas exclusivas para terminais físicos, incluindo Capital de Prêmios e Capital Sena.',
      '',
      '### Fluxo recomendado',
      '```',
      '1. POST /api/pos/auth/login                               — Login por CPF do operador',
      '2. GET  /api/pos/edicoes                                  — Edições ativas de Prêmios',
      '3. GET  /api/pos/edicoes/:edicaoId/opcoes                 — Listar configurações de venda',
      '4. GET  /api/pos/edicoes/:edicaoId/combos                 — Navegar cartelas/combos disponíveis',
      '5. POST /api/pos/edicoes/:edicaoId/reservas               — Reservar pré-compra por 5 minutos',
      '6. POST /api/pos/vendas                                   — Criar venda Prêmios + gerar cobrança',
      '7. GET  /api/pos/vendas/:id/pagamento                     — Consultar status Prêmios',
      '8. GET  /api/pos/capital-sena/edicoes                     — Edições ativas Sena',
      '9. POST /api/pos/capital-sena/vendas                      — Criar venda Sena + gerar cobrança',
      '10. GET /api/pos/capital-sena/vendas/:id/pagamento        — Consultar status Sena',
      '```',
      '',
      '### Autenticação',
      'Use o `accessToken` retornado em `POST /api/pos/auth/login` no header:',
      '`Authorization: Bearer {accessToken}`',
      '',
      'O token POS usa secret próprio (`JWT_POS_SECRET`), expiração longa (`JWT_POS_EXPIRES`) e não acessa rotas administrativas.',
      '',
      '### Pagamento',
      'A API cria a cobrança PIX no PagBank e a confirmação ocorre pelo webhook, igual ao fluxo WhatsApp.',
      'O terminal deve fazer polling a cada 3–5 segundos nos endpoints de status até `pago=true` ou `status` ∈ { `APROVADO`, `RECUSADO`, `CANCELADO` }.',
    ].join('\n'),
  );
  const senaAdminDocument = buildAudienceDocument(
    fullDocument,
    'sena-admin',
    'Capital Sena API - Admin',
    [
      '## Capital Sena — Painel Administrativo',
      '',
      'Gerenciamento completo do sistema de cartelas baseado na Mega-Sena.',
      '',
      '**Usuários**: ADMIN, DISTRIBUIDOR, VENDEDOR',
      '',
      '- Login admin/distribuidor/vendedor: `POST /api/auth/login` (email + senha)',
      '- Buscar cliente por CPF no painel: `GET /api/admin/clientes/cpf/{cpf}` (Bearer)',
      '- Refresh token: `POST /api/auth/refresh`',
      '',
      '### Fluxo operacional',
      '```',
      '1. POST /api/auth/login                              — Login ADMIN, DISTRIBUIDOR ou VENDEDOR',
      '2. POST /api/admin/capital-sena/edicoes              — Criar edição Sena',
      '3. PATCH /api/admin/capital-sena/edicoes/:id/ativar  — Ativar edição',
      '4. GET  /api/admin/clientes/cpf/:cpf                 — Buscar dados do cliente por CPF',
      '5. POST /api/capital-sena/comprar                    — Vender cartelas (via loja)',
      '6. POST /api/admin/capital-sena/vendas               — Vender cartelas (admin/manual)',
      '7. PATCH /api/admin/capital-sena/edicoes/:id/encerrar — Encerrar edição',
      '8. POST /api/admin/capital-sena/sorteio/:id/resultado — Inserir resultado Mega-Sena',
      '9. POST /api/admin/capital-sena/apuracao/:id         — Executar apuração automática',
      '10. GET /api/admin/capital-sena/apuracao/:id/ganhadores — Listar premiados',
      '```',
      '',
      '### Faixas de premiação',
      '- **QUADRA** — 4 acertos',
      '- **QUINA** — 5 acertos',
      '- **SENA** — 6 acertos',
      '- **SENA_BONUS** — 6 acertos + 7º número',
    ].join('\n'),
  );
  const senaLojaDocument = buildAudienceDocument(
    fullDocument,
    'sena-loja',
    'Capital Sena API - Loja',
    [
      '## Capital Sena — Loja (Cliente)',
      '',
      'Endpoints públicos e de área do cliente para o Capital Sena.',
      '',
      '### Fluxo de compra',
      '```',
      '1. GET  /api/capital-sena/edicoes              — Listar edições ativas para compra',
      '2. GET  /api/capital-sena/edicao-ativa         — Edição ativa com prêmios/combos',
      '3. POST /api/capital-sena/comprar              — Comprar cartela(s) (PIX ou Cartão)',
      '4. POST /api/auth/loja                         — Login/área do cliente por CPF',
      '5. GET  /api/capital-sena/vendas/:id/status    — Consultar status de pagamento',
      '6. GET  /api/capital-sena/minhas-cartelas      — Área do cliente (Bearer)',
      '7. GET  /api/capital-sena/resultado/:edicaoId  — Resultado público',
      '```',
      '',
      '### Autenticação do cliente',
      'Use `POST /api/auth/loja` com CPF. Se o CPF já existir, a resposta retorna os dados do cliente e os tokens; se for primeiro acesso, informe também nome, telefone e dataNascimento.',
      '',
      '### 7º Número',
      'Gerado automaticamente após confirmação do pagamento. Visível em **minhas-cartelas**.',
    ].join('\n'),
  );

  const generalDocument = buildAudienceDocument(
    fullDocument,
    'geral',
    'Capital de Prêmios API - Geral',
    [
      'Rotas do painel cliente e demais fluxos da API.',
      '',
      '**Usuários**: CLIENTE',
      '',
      '- Login cliente: `POST /api/auth/loja` (CPF, sem senha)',
      '- Refresh token: `POST /api/auth/refresh`',
    ].join('\n'),
  );

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.get('/api/docs', (_request: unknown, response: Response) => {
    response.type('html').send(buildDocsIndexHtml(port));
  });
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/admin`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_ADMIN_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/admin/`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_ADMIN_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/geral`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_GERAL_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/geral/`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_GERAL_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/pos`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_POS_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/pos/`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_POS_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${DOCS_JSON_BASE_PATH}/admin`,
    (_request: unknown, response: Response) => {
      response.json(adminDocument);
    },
  );
  expressApp.get(
    `/${DOCS_JSON_BASE_PATH}/geral`,
    (_request: unknown, response: Response) => {
      response.json(generalDocument);
    },
  );
  expressApp.get(
    `/${DOCS_JSON_BASE_PATH}/pos`,
    (_request: unknown, response: Response) => {
      response.json(posDocument);
    },
  );
  expressApp.get(
    `/${DOCS_BASE_PATH}/admin`,
    (_request: unknown, response: Response) => {
      response
        .type('html')
        .send(
          buildRedocHtml(
            'Capital de Prêmios API - Admin',
            `/${DOCS_JSON_BASE_PATH}/admin`,
          ),
        );
    },
  );
  expressApp.get(
    `/${DOCS_BASE_PATH}/geral`,
    (_request: unknown, response: Response) => {
      response
        .type('html')
        .send(
          buildRedocHtml(
            'Capital de Prêmios API - Geral',
            `/${DOCS_JSON_BASE_PATH}/geral`,
          ),
        );
    },
  );
  expressApp.get(
    `/${DOCS_BASE_PATH}/pos`,
    (_request: unknown, response: Response) => {
      response
        .type('html')
        .send(
          buildRedocHtml(
            'Capital de Prêmios API - POS',
            `/${DOCS_JSON_BASE_PATH}/pos`,
          ),
        );
    },
  );
  SwaggerModule.setup(SWAGGER_ADMIN_FLAT_PATH, app, adminDocument, {
    customSiteTitle: 'Capital de Prêmios API - Swagger Admin',
    swaggerOptions: {
      persistAuthorization: true,
      url: `/${DOCS_JSON_BASE_PATH}/admin`,
    },
  });
  SwaggerModule.setup(SWAGGER_GERAL_FLAT_PATH, app, generalDocument, {
    customSiteTitle: 'Capital de Prêmios API - Swagger Geral',
    swaggerOptions: {
      persistAuthorization: true,
      url: `/${DOCS_JSON_BASE_PATH}/geral`,
    },
  });
  SwaggerModule.setup(SWAGGER_POS_FLAT_PATH, app, posDocument, {
    customSiteTitle: 'Capital de Prêmios API - Swagger POS',
    swaggerOptions: {
      persistAuthorization: true,
      url: `/${DOCS_JSON_BASE_PATH}/pos`,
    },
  });

  expressApp.get(
    `/${SWAGGER_BASE_PATH}/sena-admin`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_SENA_ADMIN_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/sena-loja`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_SENA_LOJA_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${DOCS_JSON_BASE_PATH}/sena-admin`,
    (_request: unknown, response: Response) => {
      response.json(senaAdminDocument);
    },
  );
  expressApp.get(
    `/${DOCS_JSON_BASE_PATH}/sena-loja`,
    (_request: unknown, response: Response) => {
      response.json(senaLojaDocument);
    },
  );
  expressApp.get(
    `/${DOCS_BASE_PATH}/sena-admin`,
    (_request: unknown, response: Response) => {
      response
        .type('html')
        .send(
          buildRedocHtml(
            'Capital Sena API - Admin',
            `/${DOCS_JSON_BASE_PATH}/sena-admin`,
          ),
        );
    },
  );
  expressApp.get(
    `/${DOCS_BASE_PATH}/sena-loja`,
    (_request: unknown, response: Response) => {
      response
        .type('html')
        .send(
          buildRedocHtml(
            'Capital Sena API - Loja',
            `/${DOCS_JSON_BASE_PATH}/sena-loja`,
          ),
        );
    },
  );
  SwaggerModule.setup(SWAGGER_SENA_ADMIN_FLAT_PATH, app, senaAdminDocument, {
    customSiteTitle: 'Capital Sena API - Swagger Admin',
    swaggerOptions: {
      persistAuthorization: true,
      url: `/${DOCS_JSON_BASE_PATH}/sena-admin`,
    },
  });
  SwaggerModule.setup(SWAGGER_SENA_LOJA_FLAT_PATH, app, senaLojaDocument, {
    customSiteTitle: 'Capital Sena API - Swagger Loja',
    swaggerOptions: {
      persistAuthorization: true,
      url: `/${DOCS_JSON_BASE_PATH}/sena-loja`,
    },
  });

  expressApp.get(
    `/${SWAGGER_BASE_PATH}/whatsapp`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_WHATSAPP_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${SWAGGER_BASE_PATH}/whatsapp/`,
    (_request: unknown, response: Response) => {
      response.redirect(302, `/${SWAGGER_WHATSAPP_FLAT_PATH}`);
    },
  );
  expressApp.get(
    `/${DOCS_JSON_BASE_PATH}/whatsapp`,
    (_request: unknown, response: Response) => {
      response.json(whatsappDocument);
    },
  );
  expressApp.get(
    `/${DOCS_BASE_PATH}/whatsapp`,
    (_request: unknown, response: Response) => {
      response
        .type('html')
        .send(
          buildRedocHtml(
            'Capital de Prêmios API - WhatsApp',
            `/${DOCS_JSON_BASE_PATH}/whatsapp`,
          ),
        );
    },
  );
  SwaggerModule.setup(SWAGGER_WHATSAPP_FLAT_PATH, app, whatsappDocument, {
    customSiteTitle: 'Capital de Prêmios API - Swagger WhatsApp',
    swaggerOptions: {
      persistAuthorization: true,
      url: `/${DOCS_JSON_BASE_PATH}/whatsapp`,
    },
  });
  logger.log(`📚 Redoc WhatsApp: http://localhost:${port}/api/docs/whatsapp`);
  logger.log(`📚 Redoc POS: http://localhost:${port}/api/docs/pos`);
  logger.log(
    `📚 Swagger WhatsApp: http://localhost:${port}/api/swagger/whatsapp`,
  );
  logger.log(`📚 Swagger POS: http://localhost:${port}/api/swagger/pos`);
  logger.log(
    `📚 OpenAPI WhatsApp JSON: http://localhost:${port}/api/docs-json/whatsapp`,
  );
  logger.log(
    `📚 OpenAPI POS JSON: http://localhost:${port}/api/docs-json/pos`,
  );
  logger.log(
    `📚 Redoc Sena Admin: http://localhost:${port}/api/docs/sena-admin`,
  );
  logger.log(
    `📚 Redoc Sena Loja:  http://localhost:${port}/api/docs/sena-loja`,
  );
  logger.log(
    `📚 Swagger Sena Admin: http://localhost:${port}/api/swagger/sena-admin`,
  );
  logger.log(
    `📚 Swagger Sena Loja:  http://localhost:${port}/api/swagger/sena-loja`,
  );
  logger.log(`📚 Redoc Admin: http://localhost:${port}/api/docs/admin`);
  logger.log(`📚 Redoc Geral: http://localhost:${port}/api/docs/geral`);
  logger.log(`📚 Swagger Admin: http://localhost:${port}/api/swagger/admin`);
  logger.log(`📚 Swagger Geral: http://localhost:${port}/api/swagger/geral`);
  logger.log(
    `📚 OpenAPI Admin JSON: http://localhost:${port}/api/docs-json/admin`,
  );
  logger.log(
    `📚 OpenAPI Geral JSON: http://localhost:${port}/api/docs-json/geral`,
  );
}

function isHttpMethod(value: string): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod);
}

function isAdminPath(path: string): boolean {
  return (
    path.startsWith('/admin/') ||
    path.startsWith('admin/') ||
    path.includes('/admin/')
  );
}

function getSwaggerAudience(
  path: string,
  operation: OperationObject,
): SwaggerAudience {
  if (path.includes('/pos/') || path.startsWith('pos/')) {
    return 'pos';
  }

  if (path.endsWith('/auth/refresh')) {
    return 'shared';
  }

  // Login admin e redefinir-senha são do painel admin
  // (ADMIN, DISTRIBUIDOR, VENDEDOR logam por /auth/login)
  if (
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/redefinir-senha-primeiro-acesso')
  ) {
    return 'admin';
  }

  // Login cliente é do painel geral (CLIENTE loga por /auth/loja)
  if (path.endsWith('/auth/loja')) {
    return 'geral';
  }

  if (path.includes('/whatsapp/')) {
    return 'whatsapp';
  }

  // Capital Sena
  if (path.includes('/capital-sena/')) {
    const isSenaAdmin =
      isAdminPath(path) ||
      (operation.tags ?? []).some((tag: string) =>
        tag.startsWith(SENA_ADMIN_TAG_PREFIX),
      );
    if (isSenaAdmin) return 'sena-admin';
    return 'sena-loja';
  }

  if (
    isAdminPath(path) ||
    (operation.tags ?? []).some((tag: string) =>
      tag.startsWith(ADMIN_TAG_PREFIX),
    )
  ) {
    return 'admin';
  }

  return 'geral';
}

function isSenaAdminExtraPath(path: string): boolean {
  return (
    path.endsWith('/auth/login') ||
    path.endsWith('/auth/redefinir-senha-primeiro-acesso') ||
    path.endsWith('/auth/admin/redefinir-senha') ||
    path.includes('/admin/clientes/cpf/')
  );
}

function isSenaLojaExtraPath(path: string): boolean {
  return path.endsWith('/auth/loja');
}

function shouldIncludeOperation(
  path: string,
  operationAudience: SwaggerAudience,
  audience: Exclude<SwaggerAudience, 'shared'>,
): boolean {
  if (operationAudience === audience) {
    return true;
  }

  if (operationAudience === 'shared') {
    return audience !== 'pos';
  }

  if (audience === 'sena-admin' && isSenaAdminExtraPath(path)) {
    return true;
  }

  if (audience === 'sena-loja' && isSenaLojaExtraPath(path)) {
    return true;
  }

  return false;
}

function normalizeAudienceOperationTags(
  operation: OperationObject,
  audience: Exclude<SwaggerAudience, 'shared'>,
): OperationObject {
  if (audience !== 'pos') {
    return operation;
  }

  const tags = operation.tags ?? [];
  const hasSpecificPosTag = tags.some((tag) => tag.startsWith('POS /'));
  if (!hasSpecificPosTag) {
    return operation;
  }

  return {
    ...operation,
    tags: tags.filter((tag) => tag !== 'Pos' && tag !== 'POS'),
  };
}

function buildAudienceDocument(
  document: OpenAPIObject,
  audience: Exclude<SwaggerAudience, 'shared'>,
  title: string,
  description: string,
): OpenAPIObject {
  const allowedTags = new Set<string>();
  const filteredPaths = Object.entries(document.paths).reduce<
    OpenAPIObject['paths']
  >((paths, [path, pathItem]) => {
    const nextPathItem: PathItemObject = {};
    let hasOperations = false;

    for (const [key, value] of Object.entries(pathItem)) {
      if (!isHttpMethod(key)) {
        if (key === '$ref') {
          nextPathItem.$ref = value as string;
        }

        if (key === 'summary') {
          nextPathItem.summary = value as string;
        }

        if (key === 'description') {
          nextPathItem.description = value as string;
        }

        if (key === 'servers') {
          nextPathItem.servers = value as NonNullable<
            PathItemObject['servers']
          >;
        }

        if (key === 'parameters') {
          nextPathItem.parameters = value as NonNullable<
            PathItemObject['parameters']
          >;
        }

        continue;
      }

      if (!value) {
        continue;
      }

      const operation = value as OperationObject;
      const operationAudience = getSwaggerAudience(path, operation);
      const shouldInclude = shouldIncludeOperation(
        path,
        operationAudience,
        audience,
      );

      if (!shouldInclude) {
        continue;
      }

      const normalizedOperation = normalizeAudienceOperationTags(
        operation,
        audience,
      );
      nextPathItem[key] = normalizedOperation;
      hasOperations = true;

      for (const tag of normalizedOperation.tags ?? []) {
        allowedTags.add(tag);
      }
    }

    if (hasOperations) {
      paths[path] = nextPathItem;
    }

    return paths;
  }, {});

  return {
    ...document,
    info: {
      ...document.info,
      title,
      description,
    },
    paths: filteredPaths,
    tags: document.tags?.filter((tag) => allowedTags.has(tag.name)),
  };
}

function buildDocsIndexHtml(port: number): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Capital de Prêmios API Docs</title>
    <link rel="icon" href="${DOCS_FAVICON_DATA_URL}" type="image/svg+xml" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f4efe7;
        --card: #ffffff;
        --text: #1f2937;
        --muted: #5b6472;
        --border: #e5d8c8;
        --accent: #b45309;
        --accent-soft: #fff2df;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top, #fff7ed 0, transparent 35%),
          linear-gradient(180deg, #fdf8f2 0%, var(--bg) 100%);
        color: var(--text);
      }

      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 48px 20px 64px;
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 4vw, 3rem);
      }

      p {
        margin: 0 0 24px;
        color: var(--muted);
        line-height: 1.6;
      }

      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .card {
        display: block;
        padding: 20px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 18px;
        text-decoration: none;
        color: inherit;
        box-shadow: 0 10px 30px rgba(31, 41, 55, 0.08);
      }

      .card:hover {
        border-color: var(--accent);
        transform: translateY(-1px);
      }

      .eyebrow {
        display: inline-block;
        margin-bottom: 10px;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        text-transform: uppercase;
      }

      code {
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 0.9em;
      }

      ul {
        margin: 28px 0 0;
        padding-left: 20px;
        color: var(--muted);
      }

      .commands {
        margin-top: 28px;
        padding: 18px 20px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(31, 41, 55, 0.08);
      }

      .commands h2 {
        margin: 0 0 12px;
        color: #0f172a;
      }

      .commands p {
        margin-bottom: 12px;
      }

      .commands pre {
        margin: 0;
        padding: 14px;
        border-radius: 12px;
        border: 1px solid var(--border);
        background: #fffaf5;
        overflow-x: auto;
      }
    </style>
  </head>
  <body>
    <main>
      <span class="eyebrow">Documentação</span>
      <h1>Capital de Prêmios API</h1>
      <p>
        A documentação foi separada para ficar mais fácil navegar por contexto.
        Abra o painel que quiser revisar agora. Os JSONs continuam disponíveis
        separadamente para integrações e automações.
      </p>

      <section class="grid">
        <a class="card" href="/api/docs/admin">
          <span class="eyebrow">Redoc</span>
          <h2>Redoc Admin</h2>
          <p>Rotas do painel administrativo e endpoints exclusivos desse fluxo.</p>
          <code>/api/docs/admin</code>
        </a>

        <a class="card" href="/api/docs/geral">
          <span class="eyebrow">Redoc</span>
          <h2>Redoc Geral</h2>
          <p>Rotas da loja, autenticações não administrativas e demais recursos da API.</p>
          <code>/api/docs/geral</code>
        </a>

        <a class="card" href="/api/docs/whatsapp">
          <span class="eyebrow">Redoc</span>
          <h2>Redoc WhatsApp</h2>
          <p>Collection dedicada para bots e CRMs que vendem bilhetes via WhatsApp.</p>
          <code>/api/docs/whatsapp</code>
        </a>

        <a class="card" href="/api/docs/pos">
          <span class="eyebrow">Redoc</span>
          <h2>Redoc POS</h2>
          <p>Rotas exclusivas dos terminais físicos, com login por CPF e confirmação de pagamento.</p>
          <code>/api/docs/pos</code>
        </a>

        <a class="card" href="/api/docs/sena-admin">
          <span class="eyebrow" style="background:#fef3c7;color:#b45309">Sena · Redoc</span>
          <h2>Redoc Capital Sena Admin</h2>
          <p>Gerenciamento de edições, sorteios, apuração e ganhadores da Mega-Sena.</p>
          <code>/api/docs/sena-admin</code>
        </a>

        <a class="card" href="/api/docs/sena-loja">
          <span class="eyebrow" style="background:#fef3c7;color:#b45309">Sena · Redoc</span>
          <h2>Redoc Capital Sena Loja</h2>
          <p>Endpoints de compra de cartelas, resultado público e área do cliente.</p>
          <code>/api/docs/sena-loja</code>
        </a>

        <a class="card" href="/api/swagger/admin">
          <span class="eyebrow">Swagger</span>
          <h2>Swagger Admin</h2>
          <p>Interface interativa para testar as rotas administrativas em tempo real.</p>
          <code>/api/swagger/admin</code>
        </a>

        <a class="card" href="/api/swagger/geral">
          <span class="eyebrow">Swagger</span>
          <h2>Swagger Geral</h2>
          <p>Interface interativa para testar os fluxos da loja e demais rotas da API.</p>
          <code>/api/swagger/geral</code>
        </a>

        <a class="card" href="/api/swagger/whatsapp">
          <span class="eyebrow">Swagger</span>
          <h2>Swagger WhatsApp</h2>
          <p>Interface interativa para testar os fluxos da API de vendas via WhatsApp.</p>
          <code>/api/swagger/whatsapp</code>
        </a>

        <a class="card" href="/api/swagger/pos">
          <span class="eyebrow">Swagger</span>
          <h2>Swagger POS</h2>
          <p>Interface interativa para testar vendas presenciais de Prêmios e Capital Sena.</p>
          <code>/api/swagger/pos</code>
        </a>

        <a class="card" href="/api/swagger/sena-admin">
          <span class="eyebrow" style="background:#fef3c7;color:#b45309">Sena · Swagger</span>
          <h2>Swagger Capital Sena Admin</h2>
          <p>Interface interativa para testar e executar as rotas administrativas do Capital Sena.</p>
          <code>/api/swagger/sena-admin</code>
        </a>

        <a class="card" href="/api/swagger/sena-loja">
          <span class="eyebrow" style="background:#fef3c7;color:#b45309">Sena · Swagger</span>
          <h2>Swagger Capital Sena Loja</h2>
          <p>Interface interativa para o fluxo de compra e área do cliente Sena.</p>
          <code>/api/swagger/sena-loja</code>
        </a>

        <a class="card" href="/api/admin/filas">
          <span class="eyebrow">Bull Board</span>
          <h2>Filas e Tasks</h2>
          <p>Painel visual das filas BullMQ (auto-encerramento e jobs recorrentes).</p>
          <code>/api/admin/filas (fallback: /admin/filas)</code>
        </a>
      </section>

      <ul>
        <li>JSON Admin: <code>http://localhost:${port}/api/docs-json/admin</code></li>
        <li>JSON Geral: <code>http://localhost:${port}/api/docs-json/geral</code></li>
        <li>JSON WhatsApp: <code>http://localhost:${port}/api/docs-json/whatsapp</code></li>
        <li>JSON POS: <code>http://localhost:${port}/api/docs-json/pos</code></li>
      </ul>

      <section class="commands">
        <h2>Deploy Docker (Homologação)</h2>
        <p>Comandos sugeridos para atualizar a API no servidor:</p>
        <pre><code>docker compose down
docker compose build api --no-cache
docker compose up -d api
docker compose logs -f api

# (opcional) conferir migrations
docker compose exec api npx prisma migrate status</code></pre>
      </section>
    </main>
  </body>
</html>`;
}

function buildRedocHtml(title: string, specUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="icon" href="${DOCS_FAVICON_DATA_URL}" type="image/svg+xml" />
    <style>
      body {
        margin: 0;
        background: #f8fafc;
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 20px;
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
        font-family: "Segoe UI", sans-serif;
      }

      .brand {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .title {
        font-size: 1rem;
        font-weight: 700;
        color: #0f172a;
      }

      .subtitle {
        font-size: 0.875rem;
        color: #475569;
      }

      .links {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }

      .links a {
        color: #b45309;
        text-decoration: none;
        font: 600 0.9rem "Segoe UI", sans-serif;
      }

      redoc {
        display: block;
        height: calc(100vh - 67px);
      }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <span class="title">${title}</span>
        <span class="subtitle">Visualização Redoc a partir do OpenAPI JSON</span>
      </div>
      <nav class="links">
        <a href="/api/docs">Índice</a>
        <a href="${specUrl}">JSON</a>
      </nav>
    </header>

    <redoc spec-url="${specUrl}"></redoc>
    <script src="${REDOC_STANDALONE_JS_URL}"></script>
  </body>
</html>`;
}
