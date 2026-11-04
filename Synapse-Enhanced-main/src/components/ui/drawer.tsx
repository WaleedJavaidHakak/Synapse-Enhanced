'use client'

import * as React from "react"
import * as DrawerPrimitives from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"

const Drawer = (
  props: React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Root>,
) => {
  return <DrawerPrimitives.Root {...props} />
}
Drawer.displayName = "Drawer"

const DrawerTrigger = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitives.Trigger>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Trigger>
>(({ className, ...props }, ref) => {
  return (
    <DrawerPrimitives.Trigger ref={ref} className={cn(className)} {...props} />
  )
})
DrawerTrigger.displayName = "Drawer.Trigger"

const DrawerClose = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Close>
>(({ className, ...props }, ref) => {
  return (
    <DrawerPrimitives.Close ref={ref} className={cn(className)} {...props} />
  )
})
DrawerClose.displayName = "Drawer.Close"

const DrawerPortal = DrawerPrimitives.Portal
DrawerPortal.displayName = "DrawerPortal"

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitives.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Overlay>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DrawerPrimitives.Overlay
      ref={forwardedRef}
      className={cn(
        "fixed inset-0 z-50 overflow-y-auto bg-black/30 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  )
})
DrawerOverlay.displayName = "DrawerOverlay"

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Content>
>(({ className, children, ...props }, forwardedRef) => {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitives.Content
        ref={forwardedRef}
        className={cn(
          "fixed inset-y-2 mx-auto flex w-[95vw] flex-1 flex-col overflow-y-auto rounded-md border p-4 shadow-lg focus:outline-none max-sm:inset-x-2 sm:inset-y-2 sm:right-2 sm:max-w-lg sm:p-6 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right transition-colors duration-300",
          className,
        )}
        {...props}
      >
        {children}
      </DrawerPrimitives.Content>
    </DrawerPortal>
  )
})
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ children, className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-start justify-between gap-x-4 border-b border-slate-200 pb-4 dark:border-slate-700",
        className,
      )}
      {...props}
    >
      <div className="mt-1 flex flex-col gap-y-1">
        {children}
      </div>
      <DrawerPrimitives.Close asChild>
        <Button
          variant="ghost"
          className="aspect-square p-1 hover:bg-slate-100 hover:dark:bg-slate-800 transition-colors duration-200"
        >
          <X className="h-6 w-6 text-slate-600 dark:text-slate-400" aria-hidden="true" />
        </Button>
      </DrawerPrimitives.Close>
    </div>
  )
})
DrawerHeader.displayName = "Drawer.Header"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Title>
>(({ className, ...props }, forwardedRef) => (
  <DrawerPrimitives.Title
    ref={forwardedRef}
    className={cn(
      "text-base font-semibold text-slate-900 dark:text-slate-50",
      className,
    )}
    {...props}
  />
))
DrawerTitle.displayName = "DrawerTitle"

const DrawerBody = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => {
  return (
    <div ref={ref} className={cn("flex-1 py-4", className)} {...props} />
  )
})
DrawerBody.displayName = "Drawer.Body"

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Description>
>(({ className, ...props }, forwardedRef) => {
  return (
    <DrawerPrimitives.Description
      ref={forwardedRef}
      className={cn("text-slate-500 dark:text-slate-400", className)}
      {...props}
    />
  )
})
DrawerDescription.displayName = "DrawerDescription"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn(
        "flex flex-col-reverse border-t border-slate-200 pt-4 sm:flex-row sm:justify-end sm:space-x-2 dark:border-slate-700",
        className,
      )}
      {...props}
    />
  )
}
DrawerFooter.displayName = "DrawerFooter"

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} 