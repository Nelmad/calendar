import {useState, type ComponentProps} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Button, Checkbox, Dialog, DialogTrigger, Heading, Icon, IconButton, Menu, MenuItem, MenuTrigger, Modal, Popover, Skeleton, Stack, Text, ThemeRoot} from '../../src/v02/primitives/index.js';

type Options = {portalContainer?: Element; direction?: 'ltr' | 'rtl'; density?: 'compact' | 'comfortable'; colorScheme?: 'light' | 'dark' | 'system'};
function Foundation({portalContainer, direction = 'ltr', density = 'compact', colorScheme = 'system'}: Options) {
    const [presses, setPresses] = useState(0), [selected, setSelected] = useState(false), [action, setAction] = useState('none');
    return <ThemeRoot id="foundation" lang="en-US" dir={direction} density={density} colorScheme={colorScheme}>
        <Stack>
            <Heading>Classic foundation</Heading>
            <Text tone="muted">Private T09 controls — keyboard and theme fixture.</Text>
            <Stack direction="row">
                <Button id="press" onPress={() => setPresses(value => value + 1)}>Run</Button>
                <Button id="disabled" isDisabled onPress={() => setPresses(-100)}>Disabled</Button>
                <IconButton id="previous" aria-label="Previous month"><Icon name="previous"/></IconButton>
                <Button tone="danger">Delete</Button>
            </Stack>
            <Checkbox id="work" isSelected={selected} onChange={setSelected}>Work calendar</Checkbox>
            <Checkbox id="disabled-check" isDisabled onChange={() => setPresses(-200)}>Disabled calendar</Checkbox>
            <Stack direction="row">
                <MenuTrigger><Button id="menu-trigger">Actions</Button>
                    <Popover UNSTABLE_portalContainer={portalContainer}><Menu aria-label="Item actions" onAction={key => setAction(String(key))}>
                        <MenuItem id="open">Open item</MenuItem><MenuItem id="blocked" isDisabled>Blocked action</MenuItem><MenuItem id="remove" tone="danger">Remove item</MenuItem>
                    </Menu></Popover>
                </MenuTrigger>
                <DialogTrigger><Button id="popover-trigger">Information</Button>
                    <Popover UNSTABLE_portalContainer={portalContainer}><Dialog aria-label="Information"><Heading slot="title">Information</Heading><Button slot="close">Close information</Button></Dialog></Popover>
                </DialogTrigger>
                <DialogTrigger><Button id="dialog-trigger">Open dialog</Button>
                    <Modal UNSTABLE_portalContainer={portalContainer}><Dialog aria-label="Calendar settings"><Stack>
                        <Heading slot="title">Calendar settings</Heading><Checkbox>Show details</Checkbox><Button slot="close">Close settings</Button>
                    </Stack></Dialog></Modal>
                </DialogTrigger>
            </Stack>
            <Skeleton style={{width: '12rem'}}/>
            <output id="result">{presses}/{String(selected)}/{action}</output>
        </Stack>
    </ThemeRoot>;
}
export const serverFoundation = (options: Options = {}) => renderToString(<Foundation {...options}/>);
export function mountFoundation(container: Element, options: Options = {}) {
    const root = createRoot(container);
    root.render(<Foundation {...options}/>);
    return () => root.unmount();
}
export async function hydrateFoundation(container: Element, options: Options = {}) {
    const errors: string[] = [];
    const root = hydrateRoot(container, <Foundation {...options}/>, {onRecoverableError: error => errors.push(String(error))});
    await new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done())));
    return {errors, html: container.innerHTML, unmount: () => root.unmount()};
}

type RegressionOptions = Options & {locale?: string; placement?: ComponentProps<typeof Popover>['placement']; menuCount?: number; triggerTop?: number};
function FoundationRegression({portalContainer, direction = 'ltr', locale = 'en-US', placement, menuCount = 3, triggerTop = 0}: RegressionOptions) {
    return <ThemeRoot id="regression-foundation" lang={locale} dir={direction} colorScheme="light"
        style={{width: 'min(320px, 100%)', marginInline: 'auto', padding: 16}}>
        <div style={{paddingTop: triggerTop}}>
            <MenuTrigger><Button id="regression-trigger">Actions</Button>
                <Popover placement={placement} UNSTABLE_portalContainer={portalContainer}><Menu aria-label="Regression actions">
                    {Array.from({length: menuCount}, (_, index) => <MenuItem id={`action-${index + 1}`} key={index}>Action {index + 1}</MenuItem>)}
                </Menu></Popover>
            </MenuTrigger>
        </div>
        <ThemeRoot id="icons-rtl" lang="ar" dir="rtl">
            <Icon name="previous"/><Icon name="next"/><Icon name="close"/>
            <ThemeRoot id="icons-ltr" lang="en-US" dir="ltr">
                <Icon name="previous"/><Icon name="next"/><Icon name="close"/>
                <ThemeRoot id="icons-inner-rtl" lang="ar" dir="rtl">
                    <Icon name="previous"/><Icon name="next"/><Icon name="close"/>
                </ThemeRoot>
            </ThemeRoot>
        </ThemeRoot>
    </ThemeRoot>;
}
export function mountFoundationRegression(container: Element, options: RegressionOptions = {}) {
    const root = createRoot(container);
    root.render(<FoundationRegression {...options}/>);
    return () => root.unmount();
}
