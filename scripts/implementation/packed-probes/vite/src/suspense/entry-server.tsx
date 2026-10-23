import {StrictMode} from 'react';
import {renderToString} from 'react-dom/server';
import {Suspended} from './Suspended';

export function render(path: string) {
    return renderToString(<StrictMode><Suspended path={path} server/></StrictMode>);
}
