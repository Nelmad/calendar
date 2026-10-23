import React from 'react';
import {createRoot} from 'react-dom/client';
import {enableShadowDOM} from '@react-stately/flags';
import {TouchSurface} from './touch-surface.jsx';
import css from './touch.css?inline';

enableShadowDOM();
const options = new URLSearchParams(location.search);
const scope = (host, shadow) => {
    if (!shadow) return host;
    const root = host.attachShadow({mode: 'open'});
    const style = document.createElement('style');
    style.textContent = css;
    const target = document.createElement('div');
    root.append(style, target);
    return target;
};
const portal = document.createElement('div');
portal.id = 'touch-portal';
document.body.append(portal);
createRoot(scope(document.getElementById('app'), options.get('root') === 'shadow')).render(
    <TouchSurface portalContainer={scope(portal, options.get('portal') === 'shadow')} />,
);
