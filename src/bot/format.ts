const MAX_MESSAGE_LEN = 3900;
const FENCE_RE = /```([a-zA-Z0-9+#.-]*)[ \t]*\r?\n?([\s\S]*?)```/g;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineToHtml(segment: string): string {
  let s = escapeHtml(segment);

  s = s.replace(/^\s{0,3}#{1,6}\s+(.+?)\s*#*$/gm, "<b>$1</b>");
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/__([^_\n]+)__/g, "<b>$1</b>");
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  s = s.replace(/^\s{0,4}[-*]\s+/gm, "• ");

  return s.trim();
}

function codeToHtml(lang: string, code: string): string {
  const body = escapeHtml(code.replace(/^\r?\n/, "").replace(/\s+$/, ""));
  const cls = lang ? ` class="language-${lang.toLowerCase()}"` : "";
  return `<pre><code${cls}>${body}</code></pre>`;
}

function toHtmlBlocks(md: string): string[] {
  const blocks: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(md)) !== null) {
    pushTextBlocks(blocks, md.slice(last, m.index));
    blocks.push(codeToHtml(m[1] ?? "", m[2] ?? ""));
    last = m.index + m[0].length;
  }
  pushTextBlocks(blocks, md.slice(last));
  return blocks;
}

function pushTextBlocks(blocks: string[], text: string): void {
  for (const para of text.split(/\n{2,}/)) {
    const html = inlineToHtml(para);
    if (html.length > 0) blocks.push(html);
  }
}

function sliceByLines(text: string, budget: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    const piece = cur.length === 0 ? line : `${cur}\n${line}`;
    if (piece.length <= budget) {
      cur = piece;
      continue;
    }
    if (cur.length > 0) {
      out.push(cur);
      cur = "";
    }
    if (line.length <= budget) {
      cur = line;
    } else {
      for (let i = 0; i < line.length; i += budget) {
        out.push(line.slice(i, i + budget));
      }
    }
  }
  if (cur.length > 0) out.push(cur);
  return out.length > 0 ? out : [""];
}

function hardSplit(block: string): string[] {
  const pre = block.match(/^<pre><code([^>]*)>([\s\S]*)<\/code><\/pre>$/);
  if (pre) {
    const attrs = pre[1] ?? "";
    const inner = pre[2] ?? "";
    const wrapLen = `<pre><code${attrs}></code></pre>`.length;
    return sliceByLines(inner, MAX_MESSAGE_LEN - wrapLen).map(
      (part) => `<pre><code${attrs}>${part}</code></pre>`,
    );
  }
  return sliceByLines(block, MAX_MESSAGE_LEN);
}

function groupBlocks(blocks: string[]): string[] {
  const messages: string[] = [];
  let cur = "";
  for (const block of blocks) {
    const piece = cur.length === 0 ? block : `${cur}\n\n${block}`;
    if (piece.length <= MAX_MESSAGE_LEN) {
      cur = piece;
      continue;
    }
    if (cur.length > 0) {
      messages.push(cur);
      cur = "";
    }
    if (block.length <= MAX_MESSAGE_LEN) {
      cur = block;
    } else {
      messages.push(...hardSplit(block));
    }
  }
  if (cur.length > 0) messages.push(cur);
  return messages.filter((m) => m.trim().length > 0);
}

export function renderSummary(md: string): string[] {
  return groupBlocks(toHtmlBlocks(md));
}

export function htmlToPlain(html: string): string {
  return html
    .replace(/<\/?(b|i|u|s|code|pre)(\s[^>]*)?>/g, "")
    .replace(/<a href="[^"]*">/g, "")
    .replace(/<\/a>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
