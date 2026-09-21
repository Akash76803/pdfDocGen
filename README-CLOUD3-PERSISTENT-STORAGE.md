# CLOUD-3 — Persistent Template and Asset Storage

Baseline: `main@6193363467307da12fb72a0364539d415fa1ecb4`

## Storage model

- Firestore stores the current template pointer and immutable version metadata.
- Cloud Storage stores immutable template JSON objects and content-addressed image assets.
- The API resolves only `ACTIVE` records for document generation.
- Desktop/local mode continues to use the filesystem and IndexedDB workflow.
- The generation engine still depends only on `TemplateRepository`; no renderer code is duplicated.

### Firestore paths

```text
documentBuilderTemplates/{templateId}
documentBuilderTemplates/{templateId}/versions/{version}
```

Version creation and the current pointer update occur in one Firestore transaction. `expectedVersion` is checked again inside that transaction so concurrent publishers cannot silently overwrite one another.

### Cloud Storage paths

```text
{templatePrefix}/{templateId}/versions/{version}.json
{assetPrefix}/{sha256}.{extension}
```

Objects use create-only generation preconditions. Images embedded by the Desktop publisher are extracted from template JSON, stored once by SHA-256, and represented in stored JSON with an internal `cloud-asset://` reference. Generation reads verify SHA-256 and hydrate those references back to renderer-compatible data URLs.

## Runtime configuration

| Variable | Required in cloud mode | Default |
| --- | --- | --- |
| `API_TEMPLATE_REPOSITORY_MODE` | Yes | `filesystem` |
| `API_GCP_TEMPLATE_BUCKET` | Yes | none |
| `GOOGLE_CLOUD_PROJECT` | Cloud Run supplies it | Application Default Credentials project |
| `API_GCP_FIRESTORE_DATABASE` | No | `(default)` |
| `API_GCP_TEMPLATE_PREFIX` | No | `document-builder/templates` |
| `API_GCP_ASSET_PREFIX` | No | `document-builder/assets` |

Cloud mode fails during startup when the bucket is absent. It never falls back to Cloud Run's ephemeral filesystem.

## Required GCP resources and IAM

1. Create a Firestore Native Mode database.
2. Create a regional Cloud Storage bucket with uniform bucket-level access.
3. Use a dedicated Cloud Run service account.
4. Grant that service account Firestore document read/write access and object read/create access on the configured bucket.
5. Use Application Default Credentials; do not commit service-account keys.

Authentication of external API callers remains CLOUD-5 scope. Do not expose the service anonymously in production before that gate.

## Version and deletion behavior

- First publish creates version metadata plus the current pointer.
- Update requires `expectedVersion` and exactly the next integer version.
- Historical version metadata and immutable objects remain available for explicit version generation and later rollback tooling.
- The legacy DELETE route removes the current pointer only; immutable history remains retained.
- Rollback activation UI/API is intentionally deferred; CLOUD-3 preserves the data required for it.
