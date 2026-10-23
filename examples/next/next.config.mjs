/** @type {import('next').NextConfig} */
export default {
    // Keep `next dev` from writing AGENTS.md/CLAUDE.md into the example directory.
    agentRules: false,
    // Bounded build parallelism keeps `next build` predictable on small CI machines.
    experimental: {cpus: 2},
};
