'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

function cn(...classes: Array<string | undefined | null | false>) {
    return classes.filter(Boolean).join(' ');
}

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Trigger>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
        ref={ref}
        className={cn(
            'flex h-10 w-full items-center justify-between rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none',
            'focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            className
        )}
        {...props}
    >
        {children}
        <SelectPrimitive.Icon className="ml-2 text-muted-foreground">
            ▾
        </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
    <SelectPrimitive.Portal>
        <SelectPrimitive.Content
            ref={ref}
            position={position}
            align="start"
            sideOffset={8}
            className={cn(
                'z-[9999] min-w-[12rem] overflow-hidden rounded-xl border border-border shadow-2xl ring-1 ring-border',
                'bg-white text-black dark:bg-black dark:text-white',
                className
            )}
            {...props}
        >
            <SelectPrimitive.Viewport className="bg-white p-2 text-black dark:bg-black dark:text-white">
                {children}
            </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
    React.ElementRef<typeof SelectPrimitive.Item>,
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
        ref={ref}
        className={cn(
            'relative flex w-full cursor-pointer select-none items-center rounded-lg px-3 py-2 text-sm outline-none',
            'focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
            className
        )}
        {...props}
    >
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';