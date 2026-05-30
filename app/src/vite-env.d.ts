/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_REPO_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Ambient-Deklarationen für Style-/Asset-Importe (Side-Effect-Imports),
// damit tsc CSS-Importe wie `import "./index.css"` akzeptiert.
declare module "*.css";
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
