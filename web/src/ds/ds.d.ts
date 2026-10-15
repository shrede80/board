/* Types for the design-system components extracted from the prototype (ds.jsx). */
import type { CSSProperties, ReactNode, ChangeEvent, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type S = { style?: CSSProperties };

export function Badge(p: S & { children?: ReactNode; tone?: 'accent' | 'dark' | 'outline' | 'success' | 'warning' | 'danger' }): JSX.Element;
export function Icon(p: S & { name: string; size?: number; color?: string; title?: string }): JSX.Element;
export function Button(
  p: S & {
    children?: ReactNode;
    variant?: 'primary' | 'dark' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    icon?: string;
    disabled?: boolean;
    loading?: boolean;
    onClick?: (e: React.MouseEvent) => void;
    type?: 'button' | 'submit';
    title?: string;
    'data-testid'?: string;
  },
): JSX.Element;
export function Card(p: S & { children?: ReactNode; padded?: boolean }): JSX.Element;
export function Table(p: S & { columns: { key: string; label: string; align?: string }[]; rows: Record<string, ReactNode>[]; hoverable?: boolean; align?: string }): JSX.Element;
export function Alert(p: S & { tone?: 'info' | 'success' | 'warning' | 'danger'; title?: ReactNode; children?: ReactNode }): JSX.Element;
export function EmptyState(p: S & { icon?: string; title?: ReactNode; description?: ReactNode; action?: ReactNode }): JSX.Element;
export function Skeleton(p: S & { width?: number | string; height?: number | string; radius?: 'sm' | 'md' | 'lg' | 'pill' }): JSX.Element;
export function Spinner(p: S & { size?: number; color?: string; label?: string }): JSX.Element;
export function Toast(p: S & { tone?: 'info' | 'success' | 'warning' | 'danger'; message: ReactNode; onDismiss?: () => void }): JSX.Element;
export function Checkbox(p: S & { checked?: boolean; onChange?: (v: boolean) => void; label?: ReactNode; disabled?: boolean }): JSX.Element;
export function Field(p: S & { label?: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; htmlFor?: string; children?: ReactNode }): JSX.Element;
export function Input(p: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; 'data-testid'?: string }): JSX.Element;
export function Radio(p: S & { checked?: boolean; onChange?: (v: boolean) => void; label?: ReactNode; disabled?: boolean }): JSX.Element;
export function Search(p: S & { value?: string; onChange?: (e: ChangeEvent<HTMLInputElement>) => void; placeholder?: string }): JSX.Element;
export function Select(p: S & { options: { value: string; label: string }[]; value?: string; onChange?: (e: ChangeEvent<HTMLSelectElement>) => void; disabled?: boolean; invalid?: boolean }): JSX.Element;
export function Switch(p: S & { checked?: boolean; onChange?: (v: boolean) => void; label?: ReactNode; disabled?: boolean }): JSX.Element;
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }): JSX.Element;
export function Tabs<T extends string = string>(p: S & { items: { value: T; label: ReactNode }[]; value?: T | ''; onChange?: (v: T) => void; tone?: 'light' | 'dark' }): JSX.Element;
