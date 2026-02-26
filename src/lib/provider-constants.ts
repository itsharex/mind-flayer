import type { LucideIcon } from "lucide-react"
import { Bot, Search } from "lucide-react"
import {
  AnthropicIcon,
  GeminiIcon,
  KimiIcon,
  MinimaxIcon,
  OpenAIIcon,
  ZhipuIcon
} from "@/components/icons"
import type { ProviderFormData } from "@/types/settings"

type ProviderIconComponent = React.ComponentType<{ className?: string }>

/**
 * Model pricing in USD per 1M tokens.
 */
export interface ModelPricing {
  input: number | null
  output: number | null
  cachedRead: number | null
  cachedWrite: number | null
}

export interface ProviderModel {
  label: string
  api_id: string
  contextWindow?: number | null
  pricing?: ModelPricing
}

export interface Provider {
  id: string
  name: string
  defaultBaseUrl: string
  apiKeyUrl: string
  icon: LucideIcon
  logo?: ProviderIconComponent
  disabled?: boolean
  models?: ProviderModel[]
}

export const MODEL_PROVIDERS: Provider[] = [
  {
    id: "minimax",
    name: "MiniMax",
    defaultBaseUrl: "https://api.minimaxi.com/anthropic/v1",
    apiKeyUrl: "https://platform.minimaxi.com/user-center/basic-information/interface-key",
    icon: Bot,
    logo: MinimaxIcon,
    models: [
      {
        label: "MiniMax-M2.5",
        api_id: "MiniMax-M2.5",
        contextWindow: 204800,
        pricing: {
          input: 0.3,
          output: 1.2,
          cachedRead: 0.03,
          cachedWrite: 0.375
        }
      },
      {
        label: "MiniMax-M2.5-highspeed",
        api_id: "MiniMax-M2.5-highspeed",
        contextWindow: 204800,
        pricing: {
          input: 0.6,
          output: 2.4,
          cachedRead: 0.03,
          cachedWrite: 0.375
        }
      },
      {
        label: "MiniMax-M2.1",
        api_id: "MiniMax-M2.1",
        contextWindow: 204800,
        pricing: {
          input: 0.3,
          output: 1.2,
          cachedRead: 0.03,
          cachedWrite: 0.375
        }
      },
      {
        label: "MiniMax-M2.1-highspeed",
        api_id: "MiniMax-M2.1-highspeed",
        contextWindow: 204800,
        pricing: {
          input: 0.6,
          output: 2.4,
          cachedRead: 0.03,
          cachedWrite: 0.375
        }
      },
      {
        label: "MiniMax-M2",
        api_id: "MiniMax-M2",
        contextWindow: 204800,
        pricing: {
          input: 0.3,
          output: 1.2,
          cachedRead: 0.03,
          cachedWrite: 0.375
        }
      }
    ]
  }
]

export const WEB_SEARCH_PROVIDERS: Provider[] = [
  {
    id: "parallel",
    name: "Parallel",
    defaultBaseUrl: "",
    apiKeyUrl: "https://platform.parallel.ai/settings?tab=api-keys",
    icon: Search
  }
]

export const UPCOMING_PROVIDERS: Provider[] = [
  {
    id: "openai",
    name: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    icon: Bot,
    logo: OpenAIIcon,
    disabled: true,
    models: [
      { label: "GPT-4", api_id: "gpt-4" },
      { label: "GPT-4 Turbo", api_id: "gpt-4-turbo" },
      { label: "GPT-3.5 Turbo", api_id: "gpt-3.5-turbo" }
    ]
  },
  {
    id: "anthropic",
    name: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    icon: Bot,
    logo: AnthropicIcon,
    disabled: true,
    models: [
      { label: "Claude Sonnet 4.5", api_id: "claude-sonnet-4-5-20251022" },
      { label: "Claude Opus 4.5", api_id: "claude-opus-4-5-20251101" }
    ]
  },
  {
    id: "gemini",
    name: "Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    icon: Bot,
    logo: GeminiIcon,
    disabled: true,
    models: []
  },
  {
    id: "kimi",
    name: "Kimi",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    apiKeyUrl: "https://platform.moonshot.cn/console/api-keys",
    icon: Bot,
    logo: KimiIcon,
    disabled: true,
    models: []
  },
  {
    id: "zhipu",
    name: "Zhipu",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKeyUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    icon: Bot,
    logo: ZhipuIcon,
    disabled: true,
    models: []
  }
]

export const ALL_PROVIDERS = [...MODEL_PROVIDERS, ...WEB_SEARCH_PROVIDERS, ...UPCOMING_PROVIDERS]

export const DEFAULT_FORM_DATA = ALL_PROVIDERS.reduce(
  (acc, provider) => {
    acc[provider.id] = { apiKey: "", baseUrl: "" }
    return acc
  },
  {} as Record<string, ProviderFormData>
)
