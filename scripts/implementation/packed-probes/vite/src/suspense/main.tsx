import {StrictMode} from 'react';
import {hydrateRoot} from 'react-dom/client';
import {Suspended} from './Suspended';

hydrateRoot(document.getElementById('app')!, <StrictMode><Suspended path={location.pathname} server={false}/></StrictMode>);
