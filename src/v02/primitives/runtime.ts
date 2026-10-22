// The flag module React Aria itself reads. `react-stately` is pinned to the exact version that react-aria and
// react-aria-components pin, so a consumer install has one flag instance (QA-05); a separate flags package
// resolved its own newer react-stately and enabled a copy nothing read.
import {enableShadowDOM} from 'react-stately/private/flags/flags';

// An explicit call from a used component survives the package's sideEffects
// policy. A side-effect-only import would be removed by production tree shaking.
// Public, idempotent flag; no DOM/clock access or consumer bootstrap.
export function initializeUIRuntime() { enableShadowDOM(); }
