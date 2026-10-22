import type {ReactNode} from 'react';
import Link from 'next/link';
import './app.css';

export const metadata = {title: '@nelmad/calendar · Next.js example'};

// The SDK stylesheet is imported by the client components that render Calendar.
export default function RootLayout({children}: {children: ReactNode}) {
    return <html lang="ru"><head><link rel="icon" href="data:,"/></head><body>
        <nav className="example-nav" lang="en"><Link href="/">Demo</Link><Link href="/quick-start">Quick start</Link><Link href="/streaming">Streaming</Link><Link href="/workspace">Workspace</Link></nav>
        <main>{children}</main>
    </body></html>;
}
