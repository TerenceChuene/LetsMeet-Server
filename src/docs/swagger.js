import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const openApiPath = path.resolve(__dirname, '../../docs/openapi.yaml');

let cachedSpec;

export function getOpenApiSpec() {
  if (!cachedSpec) {
    const raw = readFileSync(openApiPath, 'utf8');
    cachedSpec = YAML.parse(raw);
  }
  return cachedSpec;
}

export function mountSwagger(app) {
  const spec = getOpenApiSpec();
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, {
    customSiteTitle: 'LetsMeet API Docs',
    swaggerOptions: {
      persistAuthorization: true,
    },
  }));

  app.get('/api/docs.json', (_req, res) => {
    res.json(spec);
  });

  app.get('/api/openapi.yaml', (_req, res) => {
    res.type('text/yaml').send(readFileSync(openApiPath, 'utf8'));
  });
}
