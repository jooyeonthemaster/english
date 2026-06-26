// Empty stub module. Browser-side fallback for the optional `canvas` native
// module that pdfjs-dist references but we never use in the browser.
// Wired via `turbopack.resolveAlias` in next.config.ts (Turbopack's equivalent
// of webpack's `resolve.alias = { canvas: false }`).
export default {};
