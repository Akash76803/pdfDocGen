import { describe, expect, it } from 'vitest';
import { contentTypeForFormat, UnconfiguredDocumentGenerationService } from '../src/index.ts';

describe('generation core contract', () => {
  it('maps supported formats to content types', () => {
    expect(contentTypeForFormat('pdf')).toBe('application/pdf');
    expect(contentTypeForFormat('docx-exact')).toContain('wordprocessingml.document');
  });
  it('fails explicitly when no runtime adapter is configured', async () => {
    await expect(new UnconfiguredDocumentGenerationService().generate({ templateId:'x', output:{format:'pdf'}, data:{} })).rejects.toMatchObject({ code:'GENERATION_SERVICE_UNAVAILABLE' });
  });
});
