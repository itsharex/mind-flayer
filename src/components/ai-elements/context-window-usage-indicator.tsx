import type { LanguageModelUsage } from "ai"
import { useTranslation } from "react-i18next"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import {
  computeContextWindowUsage,
  formatCompactTokens,
  resolveUsedTokens,
  type UsageLevel
} from "@/lib/context-window-usage"
import { cn } from "@/lib/utils"

const RING_COLOR_BY_LEVEL: Record<UsageLevel, string> = {
  green: "var(--color-brand-green)",
  yellow: "#eab308",
  red: "var(--color-destructive)"
}

const PERCENT_MAX_FRACTION_DIGITS = 1

export interface ContextWindowUsageIndicatorProps {
  usage?: LanguageModelUsage
  contextWindow?: number | null
  className?: string
}

export function ContextWindowUsageIndicator({
  usage,
  contextWindow,
  className
}: ContextWindowUsageIndicatorProps) {
  const { t, i18n } = useTranslation("chat")

  if (!usage) {
    return null
  }

  const usageView = computeContextWindowUsage(usage, contextWindow)
  const usedTokens = resolveUsedTokens(usage)
  const usedTokensText = formatCompactTokens(usedTokens)

  const ringColor = usageView
    ? RING_COLOR_BY_LEVEL[usageView.level]
    : "var(--color-muted-foreground)"
  const ringPercent = usageView ? usageView.percent : 0
  const ringDegrees = ringPercent * 3.6
  const ringStyle = {
    background: `conic-gradient(${ringColor} ${ringDegrees}deg, var(--color-border) ${ringDegrees}deg 360deg)`
  } as const

  const usageSummary = (() => {
    if (!usageView) {
      return t("contextWindowUsage.unavailable")
    }

    const percentText = new Intl.NumberFormat(i18n.language, {
      maximumFractionDigits: PERCENT_MAX_FRACTION_DIGITS
    }).format(usageView.percent)

    return t("contextWindowUsage.summary", {
      used: usedTokensText,
      limit: formatCompactTokens(usageView.limitTokens),
      percent: percentText
    })
  })()

  const triggerAriaLabel = t("contextWindowUsage.ariaLabel", { summary: usageSummary })

  return (
    <HoverCard closeDelay={100} openDelay={100}>
      <HoverCardTrigger asChild>
        <button
          aria-label={triggerAriaLabel}
          className={cn(
            "inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
            className
          )}
          type="button"
        >
          <span className="relative block size-4 rounded-full" style={ringStyle}>
            <span className="absolute inset-0.75 rounded-full bg-chat-input-bg" />
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-auto p-3">
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t("contextWindowUsage.title")}</p>
          <p className="text-xs text-muted-foreground">{usageSummary}</p>
          {!usageView && (
            <p className="text-xs text-muted-foreground/80">
              {t("contextWindowUsage.usedInputOnly", { used: usedTokensText })}
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
