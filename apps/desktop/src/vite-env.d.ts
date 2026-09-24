/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_OAUTH_CLIENT_ID?: string;
  readonly VITE_GOOGLE_OAUTH_CLIENT_SECRET?: string;
  readonly VITE_IDENTITY_PLATFORM_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
