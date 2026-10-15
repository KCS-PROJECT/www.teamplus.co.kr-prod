"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"

type NativeInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max"
>

export interface NumberInputProps extends NativeInputProps {
  value: number
  /** 입력이 정수로 읽히고 범위 안일 때만 불린다. 범위 밖 값은 칸을 벗어날 때 맞춰서 한 번 더 불린다. */
  onValueChange: (value: number) => void
  min?: number
  max?: number
  /** 기본값은 min 이 음수일 때만 허용 */
  allowNegative?: boolean
}

function clamp(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min
  if (max !== undefined && value > max) return max
  return value
}

/**
 * 정수 입력칸. 입력 중에는 글자를 그대로 들고 있어 지우거나 "-" 부터 칠 수 있다.
 * 칸을 벗어날 때 비어 있거나 숫자가 아니면 칸에 들어올 때의 값으로 되돌리고, 범위 밖이면 범위 안으로 맞춘다.
 * type="number" 는 브라우저마다 "-" 같은 중간 입력을 빈 값으로 넘겨 쓰지 않는다.
 */
const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onValueChange, min, max, allowNegative, onFocus, onBlur, ...props }, ref) => {
    const negativeAllowed = allowNegative ?? (min !== undefined && min < 0)
    const [text, setText] = React.useState(() => String(value))
    const focusValueRef = React.useRef(value)

    React.useEffect(() => {
      setText((current) => (Number.parseInt(current, 10) === value ? current : String(value)))
    }, [value])

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value
      const pattern = negativeAllowed ? /^-?\d*$/ : /^\d*$/
      if (!pattern.test(next)) return
      setText(next)
      const parsed = Number.parseInt(next, 10)
      if (Number.isNaN(parsed)) return
      if (clamp(parsed, min, max) === parsed) onValueChange(parsed)
    }

    const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
      focusValueRef.current = value
      onFocus?.(event)
    }

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      const parsed = Number.parseInt(text, 10)
      if (Number.isNaN(parsed)) {
        // 지우는 도중 잠깐 들어간 값("31" → "3")이 아니라 칸에 들어올 때의 값으로 되돌린다
        const restored = focusValueRef.current
        setText(String(restored))
        if (restored !== value) onValueChange(restored)
      } else {
        const fitted = clamp(parsed, min, max)
        setText(String(fitted))
        if (fitted !== value) onValueChange(fitted)
      }
      onBlur?.(event)
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={negativeAllowed ? "text" : "numeric"}
        autoComplete="off"
        value={text}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)
NumberInput.displayName = "NumberInput"

export { NumberInput }
