import * as React from 'react';
import { View, type ViewProps } from 'react-native';
import { cn } from '~/lib/utils';
import { Text, TextClassContext } from '~/components/ui/text';

const Card = React.forwardRef<View, ViewProps>(({ className, ...props }, ref) => (
  <View
    ref={ref}
    className={cn(
      'rounded-xl border border-border bg-card',
      className
    )}
    {...props}
  />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<View, ViewProps>(({ className, ...props }, ref) => (
  <View
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-4', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  React.ElementRef<typeof Text>,
  React.ComponentPropsWithoutRef<typeof Text>
>(({ className, ...props }, ref) => (
  <Text
    ref={ref}
    role="heading"
    className={cn('text-xl font-semibold leading-none tracking-tight text-card-foreground', className)}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  React.ElementRef<typeof Text>,
  React.ComponentPropsWithoutRef<typeof Text>
>(({ className, ...props }, ref) => (
  <Text
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<View, ViewProps>(({ className, ...props }, ref) => (
  <TextClassContext.Provider value="text-card-foreground">
    <View ref={ref} className={className} {...props} />
  </TextClassContext.Provider>
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<View, ViewProps>(({ className, ...props }, ref) => (
  <View
    ref={ref}
    className={cn('flex flex-row items-center p-4 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
