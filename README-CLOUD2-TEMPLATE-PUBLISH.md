# CLOUD-2 — Template Publish System

Baseline: `main@26f18e4562eac1b7a7db8c2163981005f9ed34b1`

## Boundary

- Desktop remains local-first and keeps its existing browser/Tauri template persistence.
- `Publish to Cloud` is an explicit operation; ordinary Save does not require network access.
- The hosted API owns publication validation, optimistic version checks and repository writes.
- Generation continues to depend only on `TemplateRepository`; no renderer or template-engine code is duplicated.
- CLOUD-3 can replace the filesystem publisher with a persistent driver implementing the same publish/read boundary.

## Endpoint

`PUT /api/v1/templates/{templateId}/publish`

Request fields:

- `templateId`: stable template identifier; must match the URL.
- `name`: non-empty display name.
- `version`: positive integer version being created.
- `expectedVersion`: last cloud version observed by the caller; required for updates and checked atomically by the repository adapter.
- `status`: `DRAFT`, `ACTIVE`, or `ARCHIVED`.
- `metadata`: extensible publication metadata such as document type, category and desktop timestamps.
- `template`: self-contained Desktop template entry. IndexedDB image references are materialized before transport.

Success:

- `201` with `status: published` for the first publication.
- `200` with `status: updated` for a version-safe update.

Errors:

- `400` invalid ID, payload, status or version.
- `409 TEMPLATE_VERSION_CONFLICT` for a stale `expectedVersion`, a skipped version, or an existing immutable version snapshot.
- `413` request above the configured body limit.
- `503 TEMPLATE_PUBLISH_UNAVAILABLE` when the selected repository has no publisher implementation.

## Filesystem reference adapter

The CLOUD-2 filesystem adapter is a local/CI reference implementation, not the CLOUD-3 production storage choice. It writes:

- `{templateId}.json` — current publication record.
- `{templateId}.v{version}.json` — immutable version snapshot.

Only `ACTIVE` publication records are visible to document generation. Legacy local template JSON remains readable, and an explicit first publish can promote a legacy current file into the versioned publication format.

## Desktop configuration

Set the hosted API URL in **Settings → Hosted Document API**. A `VITE_CLOUD_API_BASE_URL` build-time default is also supported. The locally saved value takes precedence.

Authentication remains intentionally deferred to CLOUD-5. Do not expose a production deployment anonymously.
