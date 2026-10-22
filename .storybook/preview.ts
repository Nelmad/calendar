import type {Preview} from '@storybook/react';

import '@nelmad/calendar/styles.css';

const preview: Preview = {
    parameters: {
        options: {
            storySort: {
                order: ['Calendar', ['Quick start', 'Navigation and loading', 'Agenda', 'Actions and sources', 'Sizing', 'Data states', 'Localization',
                    'Time zones and DST', 'Interval semantics', 'Validation', 'Theming', 'Portals', 'Keyboard']],
            },
        },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
    },
};

export default preview;
