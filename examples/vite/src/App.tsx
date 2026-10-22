import {ReleaseCalendar, type ReleasePrefetch} from './ReleaseCalendar';
import {Schedule} from './Schedule';
import {Workspace} from './Workspace';

/** Three routes: `/` is the full demo, `/quick-start` is the README quick start, `/workspace` the alpha.2 integrations. */
export function App({path, prefetch}: {path: string; prefetch?: ReleasePrefetch}) {
    return <>
        <nav className="example-nav" lang="en"><a href="/">Demo</a><a href="/quick-start">Quick start</a><a href="/workspace">Workspace</a></nav>
        <main>{path === '/quick-start' ? <><h1 className="example-title" lang="en">Quick start</h1><Schedule/></>
            : path === '/workspace' ? <Workspace/> : <ReleaseCalendar {...(prefetch ? {prefetch} : {})}/>}</main>
    </>;
}
