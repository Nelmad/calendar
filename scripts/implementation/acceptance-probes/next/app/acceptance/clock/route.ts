// Harness-only: reports the (possibly shifted) server clock of this process.
export const dynamic = 'force-dynamic';
export function GET() { return new Response(new Date().toISOString()); }
