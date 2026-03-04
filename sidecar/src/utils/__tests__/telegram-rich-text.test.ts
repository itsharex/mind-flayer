import { describe, expect, it } from "vitest"
import { toTelegramHtml } from "../telegram-rich-text"

describe("toTelegramHtml", () => {
  it("converts bold markdown to Telegram HTML bold tags", () => {
    expect(toTelegramHtml("这是 **加粗** 文本")).toBe("这是 <b>加粗</b> 文本")
  })

  it("converts unordered markdown list markers to bullet lines", () => {
    expect(toTelegramHtml("- 第一项\n* 第二项\n+ 第三项")).toBe("• 第一项\n• 第二项\n• 第三项")
  })

  it("converts markdown headings to Telegram HTML bold tags", () => {
    expect(toTelegramHtml("# 一级标题\n## 二级标题\n### 三级标题")).toBe(
      "<b>一级标题</b>\n<b>二级标题</b>\n<b>三级标题</b>"
    )
  })

  it("converts html headings to Telegram HTML bold tags", () => {
    expect(toTelegramHtml('<h1>一级</h1>\n<h2 class="title">二级</h2>')).toBe(
      "<b>一级</b>\n<b>二级</b>"
    )
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
      '<pre><code class="language-ts">const a = 1 &lt; 2</code></pre>\n<code>inline</code>'
    )
  })

  it("does not convert markdown headings inside fenced code blocks", () => {
    expect(toTelegramHtml("```md\n# keep heading literal\n```")).toBe(
      '<pre><code class="language-md"># keep heading literal</code></pre>'
    )
  })

  it("converts markdown underline, strikethrough and spoiler to Telegram HTML tags", () => {
    expect(toTelegramHtml("++underline++ ~~strike~~ ||spoiler||")).toBe(
      "<u>underline</u> <s>strike</s> <tg-spoiler>spoiler</tg-spoiler>"
    )
  })

  it("converts markdown blockquotes to Telegram HTML blockquote", () => {
    expect(toTelegramHtml("> 第一行\n> 第二行\n普通文本")).toBe(
      "<blockquote>第一行\n第二行</blockquote>\n普通文本"
    )
  })
})
