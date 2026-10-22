import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {App} from './App';
import './app.css';

// `npm start` serves server-rendered HTML for every route (`/` also embeds the prefetched records in #app-data), so the
// client hydrates whenever the container holds markup; `npm run dev` serves the bare index.html and renders on the client.
const container = document.getElementById('app')!, data = document.getElementById('app-data');
const app = <StrictMode><App path={location.pathname} {...(data ? {prefetch: JSON.parse(data.textContent!)} : {})}/></StrictMode>;
if (container.firstElementChild) hydrateRoot(container, app);
else createRoot(container).render(app);
