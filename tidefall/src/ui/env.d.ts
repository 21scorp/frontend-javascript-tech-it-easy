/* UI-local ambient types. Kept inside src/ui so the shell's tsconfig
   stays untouched: CSS side-effect imports and Vite's BASE_URL are
   the only two things this layer needs the compiler to know about. */

declare module "*.css";

interface ImportMetaEnv {
  readonly BASE_URL: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
