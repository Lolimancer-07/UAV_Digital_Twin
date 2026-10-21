"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

interface SliderProps
  extends Omit<SliderPrimitive.Root.Props, "value" | "defaultValue" | "onValueChange"> {
  value?: number | number[]
  defaultValue?: number | number[]
  onValueChange?: (value: number) => void
  indicatorClassName?: string
  thumbClassName?: string
  trackClassName?: string
}

function Slider({
  className,
  value,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  indicatorClassName,
  thumbClassName,
  trackClassName,
  ...props
}: SliderProps) {
  const handleValueChange = React.useCallback(
    (val: number | number[]) => {
      if (onValueChange) {
        const raw = Array.isArray(val) ? val[0] : val
        const num = typeof raw === "number" && !isNaN(raw) ? raw : Number(raw) || 0
        // Dual-compatible: functions both as a primitive number and supports [0] indexing
        const dual: any = num
        try {
          Object.defineProperty(dual, "0", { value: num, enumerable: false, configurable: true })
        } catch {
          // Primitive numbers cannot have properties defined, handled by callers
        }
        onValueChange(num)
      }
    },
    [onValueChange]
  )

  const safeValue = React.useMemo(() => {
    if (value === undefined || value === null) return undefined
    const raw = Array.isArray(value) ? value[0] : value
    const num = Number(raw)
    return isNaN(num) ? min : num
  }, [value, min])

  const safeDefaultValue = React.useMemo(() => {
    if (defaultValue === undefined || defaultValue === null) return undefined
    const raw = Array.isArray(defaultValue) ? defaultValue[0] : defaultValue
    const num = Number(raw)
    return isNaN(num) ? min : num
  }, [defaultValue, min])

  return (
    <SliderPrimitive.Root
      value={safeValue}
      defaultValue={safeDefaultValue}
      onValueChange={handleValueChange}
      min={min}
      max={max}
      step={step}
      data-slot="slider"
      className={cn(
        "group/slider relative flex w-full touch-none select-none items-center py-2.5 cursor-pointer",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Control
        data-slot="slider-control"
        className="relative flex w-full items-center"
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className={cn(
            "relative h-2 w-full grow overflow-hidden rounded-full bg-muted/90 border border-border/60 shadow-inner transition-colors duration-200 group-hover/slider:border-border",
            trackClassName
          )}
        >
          <SliderPrimitive.Indicator
            data-slot="slider-indicator"
            className={cn(
              "h-full rounded-full bg-primary shadow-xs transition-[width] duration-150 ease-out",
              indicatorClassName
            )}
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          className={cn(
            "block size-4.5 rounded-full border-2 border-primary bg-background shadow-md shadow-primary/25 outline-none transition-[transform,box-shadow,border-color] duration-150 ease-out hover:scale-120 hover:shadow-lg hover:shadow-primary/40 active:scale-95 focus-visible:ring-3 focus-visible:ring-primary/40 cursor-grab active:cursor-grabbing",
            thumbClassName
          )}
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
