import type {CalendarBaseProps as ReferenceBaseProps, CalendarProps as ReferenceProps} from './reference.js';
import type {CalendarBaseProps, CalendarLayout, CalendarProps} from './public.js';
import type {LaterProp, SurfaceProp} from './surface.js';

// Compile-time guard, never imported: the spelled-out public base props equal the reference props of this prerelease
// (with the optional prerelease layout), and the unavailable keys are exactly the reference props outside the slice.
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Picked<I, S> = Pick<ReferenceBaseProps<I, S>, Exclude<Extract<SurfaceProp, keyof ReferenceBaseProps>, 'layout'>> & {layout?: CalendarLayout};
type Flat<T> = {[K in keyof T]: T[K]};
type Data = {ticket: number};
const base: [Same<Flat<CalendarBaseProps>, Flat<Picked<unknown, unknown>>>, Same<Flat<CalendarBaseProps<Data, Data>>, Flat<Picked<Data, Data>>>] = [true, true];
const later: Same<LaterProp, Exclude<keyof ReferenceProps, SurfaceProp>> = true;
const keys: Same<keyof CalendarProps, keyof ReferenceProps> = true;
void base; void later; void keys;
