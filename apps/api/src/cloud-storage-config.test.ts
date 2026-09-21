import { describe, expect, it } from 'vitest';
import { resolveGcpStorageConfig } from './cloud-storage-config.js';

describe('CLOUD-3 GCP storage configuration',()=>{
  it('requires an explicit durable bucket in cloud mode wiring',()=>{
    expect(()=>resolveGcpStorageConfig({})).toThrow('API_GCP_TEMPLATE_BUCKET is required');
  });
  it('resolves safe defaults without exposing credentials',()=>{
    expect(resolveGcpStorageConfig({API_GCP_TEMPLATE_BUCKET:'doc-assets',GOOGLE_CLOUD_PROJECT:'project-1'})).toEqual({
      projectId:'project-1',firestoreDatabaseId:'(default)',templateBucket:'doc-assets',
      templatePrefix:'document-builder/templates',assetPrefix:'document-builder/assets',
    });
  });
  it('rejects unsafe object prefixes',()=>{
    expect(()=>resolveGcpStorageConfig({API_GCP_TEMPLATE_BUCKET:'doc-assets',API_GCP_ASSET_PREFIX:'../assets'})).toThrow('cannot contain');
  });
});
