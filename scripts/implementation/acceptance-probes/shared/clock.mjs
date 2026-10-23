// Harness-only preload: shifts the server clock so SSR output can be compared across clocks.
const offset = Number(process.env.ACCEPTANCE_CLOCK_OFFSET_MS ?? 0);
if (offset) {
    const Real = Date;
    class Shifted extends Real {
        constructor(...args) { super(...(args.length ? args : [Real.now() + offset])); }
        static now() { return Real.now() + offset; }
    }
    globalThis.Date = Shifted;
}
