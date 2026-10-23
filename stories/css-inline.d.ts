// Vite returns the processed stylesheet as a string for `?inline` imports (stories only).
declare module '*.css?inline' {
    const css: string;
    export default css;
}
