import {StrictMode} from 'react';
import {renderToString} from 'react-dom/server';
import {Acceptance} from './Acceptance';

export function render(search: string) {
    const params = Object.fromEntries(new URLSearchParams(search));
    return renderToString(<StrictMode><Acceptance params={params}/></StrictMode>);
}
