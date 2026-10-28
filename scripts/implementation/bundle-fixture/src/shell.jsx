import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';

// The consumer shell both builds share: React, ReactDOM and the mount. The calendar is the only difference.
export const mount = content => createRoot(document.getElementById('app')).render(<StrictMode>{content}</StrictMode>);
