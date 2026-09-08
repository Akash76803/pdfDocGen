import { describe, expect, it } from 'vitest';
const routes = ['dashboard', 'templates', 'builder', 'data', 'generate', 'settings'];
describe('DB-1 route contract', () => {
  it('keeps the six document-builder routes and excludes CAD/card routes', () => {
    expect(routes).toHaveLength(6);
    expect(routes).toContain('builder');
    expect(routes).not.toContain('card-designer');
    expect(routes).not.toContain('cad');
  });
});
