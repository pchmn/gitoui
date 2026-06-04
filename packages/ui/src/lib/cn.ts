import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class lists, resolving Tailwind conflicts (last wins). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
