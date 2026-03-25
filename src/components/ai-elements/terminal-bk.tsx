import AnsiModule from "ansi-to-react"
import { CheckIcon, CopyIcon, XIcon } from "lucide-react"
import type { ComponentType, HTMLAttributes } from "react"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { useActionConstants } from "@/lib/constants"
import { cn } from "@/lib/utils"

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string
  isStreaming?: boolean
  autoScroll?: boolean
  onClear?: () => void
}

const COPY_TIMEOUT_MS = 2000
type AnsiComponentProps = {
  children?: string
  className?: string
  linkify?: boolean | "fuzzy"
}

const resolvedAnsiModule = AnsiModule as unknown as
  | ComponentType<AnsiComponentProps>
  | { default: ComponentType<AnsiComponentProps> }

const Ansi =
  typeof resolvedAnsiModule === "function" ? resolvedAnsiModule : resolvedAnsiModule.default

export const Terminal = memo(
  ({
    output,
    isStreaming = false,
    autoScroll = true,
    onClear,
    className,
    ...props
  }: TerminalProps) => {
    const actionConstants = useActionConstants()
    const { t } = useTranslation("settings")
    const [copied, setCopied] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      if (autoScroll && contentRef.current) {
        const nextScrollTop = output.length === 0 ? 0 : contentRef.current.scrollHeight
        contentRef.current.scrollTop = nextScrollTop
      }
    }, [autoScroll, output])

    const handleCopy = useCallback(async () => {
      if (!output) {
        return
      }

      try {
        await navigator.clipboard.writeText(output)
        setCopied(true)

        window.setTimeout(() => {
          setCopied(false)
        }, COPY_TIMEOUT_MS)
      } catch (error) {
        console.error("Failed to copy terminal output:", error)
      }
    }, [output])

    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-950 text-zinc-100 shadow-sm",
          className
        )}
        data-terminal="true"
        {...props}
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-2">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2 rounded-full bg-red-400/80" />
            <span className="size-2 rounded-full bg-yellow-400/80" />
            <span className="size-2 rounded-full bg-green-400/80" />
          </div>
          <div className="flex items-center gap-1">
            <Button
              aria-label={copied ? actionConstants.copied : actionConstants.copy}
              className={cn(
                "size-6 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                copied ? "text-zinc-100" : undefined
              )}
              disabled={output.length === 0}
              size="icon-xs"
              type="button"
              variant="ghost"
              onClick={handleCopy}
            >
              {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
              <span className="sr-only">
                {copied ? actionConstants.copied : actionConstants.copy}
              </span>
            </Button>
            {onClear ? (
              <Button
                aria-label={t("providers.clear")}
                className="size-6 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                size="icon-xs"
                type="button"
                variant="ghost"
                onClick={onClear}
              >
                <XIcon className="size-3.5" />
                <span className="sr-only">{t("providers.clear")}</span>
              </Button>
            ) : null}
          </div>
        </div>

        <div
          ref={contentRef}
          className="scrollbar-thin max-h-56 overflow-auto p-3 font-mono text-xs leading-relaxed"
          data-terminal-content="true"
        >
          <pre className="whitespace-pre-wrap break-words">
            <Ansi>{output}</Ansi>
            {isStreaming ? (
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-100 align-middle" />
            ) : null}
          </pre>
        </div>
      </div>
    )
  }
)

Terminal.displayName = "Terminal"
