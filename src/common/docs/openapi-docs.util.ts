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
const ADMIN_TAG_PREFIX = 'Admin /';
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

type SwaggerAudience = 'admin' | 'geral' | 'shared';
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
  SwaggerModule.setup(`${SWAGGER_BASE_PATH}/admin`, app, adminDocument, {
    customSiteTitle: 'Capital de Prêmios API - Swagger Admin',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
  SwaggerModule.setup(`${SWAGGER_BASE_PATH}/geral`, app, generalDocument, {
    customSiteTitle: 'Capital de Prêmios API - Swagger Geral',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  logger.log(`📚 Docs index: http://localhost:${port}/api/docs`);
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
      const shouldInclude =
        operationAudience === audience || operationAudience === 'shared';

      if (!shouldInclude) {
        continue;
      }

      nextPathItem[key] = operation;
      hasOperations = true;

      for (const tag of operation.tags ?? []) {
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
      </section>

      <ul>
        <li>JSON Admin: <code>http://localhost:${port}/api/docs-json/admin</code></li>
        <li>JSON Geral: <code>http://localhost:${port}/api/docs-json/geral</code></li>
      </ul>
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
