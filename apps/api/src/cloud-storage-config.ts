export type GcpStorageConfig = {
  projectId?: string;
  firestoreDatabaseId: string;
  templateBucket: string;
  templatePrefix: string;
  assetPrefix: string;
};

function normalizedPrefix(value: string | undefined, fallback: string): string {
  const normalized = (value?.trim() || fallback).replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.includes('..')) {
    throw Object.assign(new Error('Cloud storage object prefixes must be non-empty and cannot contain "..".'), { code:'INVALID_CLOUD_STORAGE_CONFIG' });
  }
  return normalized;
}

export function resolveGcpStorageConfig(env: NodeJS.ProcessEnv = process.env): GcpStorageConfig {
  const templateBucket = env.API_GCP_TEMPLATE_BUCKET?.trim();
  if (!templateBucket) {
    throw Object.assign(new Error('API_GCP_TEMPLATE_BUCKET is required when API_TEMPLATE_REPOSITORY_MODE=cloud.'), { code:'INVALID_CLOUD_STORAGE_CONFIG' });
  }
  return {
    ...(env.GOOGLE_CLOUD_PROJECT?.trim() ? { projectId:env.GOOGLE_CLOUD_PROJECT.trim() } : {}),
    firestoreDatabaseId: env.API_GCP_FIRESTORE_DATABASE?.trim() || '(default)',
    templateBucket,
    templatePrefix: normalizedPrefix(env.API_GCP_TEMPLATE_PREFIX, 'document-builder/templates'),
    assetPrefix: normalizedPrefix(env.API_GCP_ASSET_PREFIX, 'document-builder/assets'),
  };
}
