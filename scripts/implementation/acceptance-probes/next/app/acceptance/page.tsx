import {Acceptance} from '../../components/Acceptance';

// Harness-only route added to the isolated Next copy: a Server Component passes the query to the client scenario.
export default async function AcceptancePage({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
    const params = Object.fromEntries(Object.entries(await searchParams).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    return <Acceptance params={params}/>;
}
