import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '../../src/docs/swagger.js';

describe('OpenAPI specification', () => {
  it('loads a valid OpenAPI 3 document with admin paths', () => {
    const spec = getOpenApiSpec();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toContain('LetsMeet');
    expect(spec.paths['/api/v1/admin/dashboard']).toBeTruthy();
    expect(spec.paths['/api/v1/livekit/token']).toBeTruthy();
    expect(spec.components.securitySchemes.bearerAuth).toBeTruthy();
  });
});
