import React from 'react';
import {createRoot} from 'react-dom/client';
import {FeasibilitySurface, configureFeasibilityRuntime} from './surface.jsx';
import css from './styles.css?inline';

const options = new URLSearchParams(location.search);
// Explicit host bootstrap in this experiment, not SDK module initialization.
if (options.get('shadowDOM') !== 'off') configureFeasibilityRuntime();
const withStyles = host => {
    const root = host.attachShadow({mode: 'open'});
    // Fixture-owned host styles: not an SDK runtime injection strategy.
    const styles = document.createElement('style');
    styles.textContent = css;
    root.appendChild(styles);
    const container = document.createElement('div');
    root.appendChild(container);
    return container;
};
const host = document.getElementById('app');
const target = options.get('root') === 'shadow' ? withStyles(host) : host;
const portalHost = document.createElement('div');
portalHost.id = 'portal-host';
document.body.appendChild(portalHost);
const portal = options.get('portal') === 'shadow' ? withStyles(portalHost) : portalHost;
createRoot(target).render(<FeasibilitySurface portalContainer={portal} />);
