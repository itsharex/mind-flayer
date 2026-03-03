import { describe, expect, it } from "vitest"
import { toTelegramHtml } from "../telegram-rich-text"

describe("toTelegramHtml", () => {
  it("converts bold markdown to Telegram HTML bold tags", () => {
    expect(toTelegramHtml("这是 **加粗** 文本")).toBe("这是 <b>加粗</b> 文本")
  })

  it("converts unordered markdown list markers to bullet lines", () => {
    expect(toTelegramHtml("- 第一项\n* 第二项\n+ 第三项")).toBe("• 第一项\n• 第二项\n• 第三项")
  })

  it("converts markdown links to Telegram HTML links for http/https", () => {
    expect(toTelegramHtml("[Mind Flayer](https://example.com/path?q=1&v=2)")).toBe(
      '<a href="https://example.com/path?q=1&amp;v=2">Mind Flayer</a>'
    )
  })

  it("escapes raw html-like tags in non-formatted content", () => {
    expect(toTelegramHtml("Use <tag> & keep safe")).toBe("Use &lt;tag&gt; &amp; keep safe")
  })

  it("renders fenced and inline code as HTML code tags", () => {
    expect(toTelegramHtml("```ts\nconst a = 1 < 2\n```\n`inline`")).toBe(
      "<pre><code>const a = 1 &lt; 2</code></pre>\n<code>inline</code>"
    )
  })
})
