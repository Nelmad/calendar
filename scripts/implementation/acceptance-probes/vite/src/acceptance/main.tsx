import {StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {Acceptance} from './Acceptance';
import '../app.css';

const params = Object.fromEntries(new URLSearchParams(location.search));
hydrateRoot(document.getElementById('app')!, <StrictMode><Acceptance params={params}/></StrictMode>);
