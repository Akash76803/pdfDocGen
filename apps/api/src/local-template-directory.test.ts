import { describe, expect, it } from 'vitest';
import { resolveSharedTemplateDirectory } from './local-template-directory.js';

describe('resolveSharedTemplateDirectory', () => {
  it('uses API_TEMPLATE_DIR when explicitly configured', () => {
    expect(resolveSharedTemplateDirectory({ API_TEMPLATE_DIR: './custom-templates' })).toContain('custom-templates');
  });

  it('resolves a templates directory when no override is provided', () => {
    expect(resolveSharedTemplateDirectory({})).toMatch(/templates$/);
  });
});
