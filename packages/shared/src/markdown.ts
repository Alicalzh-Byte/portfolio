/**
 * Markdown 渲染管线 —— 全项目唯一实现（AGENTS.md §4.4 / TECH_DESIGN §4.5）。
 *
 * 顺序固定：remark-parse → remark-rehype → Shiki 高亮 → rehype-sanitize → rehype-stringify。
 * **sanitize 必须在最后**：放在高亮之前会把高亮产物当成不可信 HTML 清洗掉。
 *
 * 三个设计约束，改动前请先读 TECH_DESIGN §4.5：
 * 1. 后台预览与线上渲染调用的是同一函数，这是「预览与线上一致」的技术保证，不允许各写一套；
 * 2. 消毒必须是纯 AST 变换（rehype-sanitize），因为 Workers 运行时没有 DOM；
 * 3. Shiki 只注册常用语言，Workers 有 CPU 时间上限，语言集不能无限扩张。
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import themeGithubDark from 'shiki/themes/github-dark.mjs';
import langBash from 'shiki/langs/bash.mjs';
import langCss from 'shiki/langs/css.mjs';
import langHtml from 'shiki/langs/html.mjs';
import langJson from 'shiki/langs/json.mjs';
import langJs from 'shiki/langs/javascript.mjs';
import langMarkdown from 'shiki/langs/markdown.mjs';
import langPython from 'shiki/langs/python.mjs';
import langSql from 'shiki/langs/sql.mjs';
import langTs from 'shiki/langs/typescript.mjs';
import type { TocItem } from './types';

/**
 * 允许被高亮的语言。刻意不注册全部语言：Workers 的 CPU 时间与包体积都吃紧。
 * 需要新增语言时同时改这里与 TECH_DESIGN §1.5 的记录。
 */
const SUPPORTED_LANGUAGES = [
  { name: 'javascript', grammar: langJs },
  { name: 'typescript', grammar: langTs },
  { name: 'json', grammar: langJson },
  { name: 'html', grammar: langHtml },
  { name: 'css', grammar: langCss },
  { name: 'bash', grammar: langBash },
  { name: 'sql', grammar: langSql },
  { name: 'python', grammar: langPython },
  { name: 'markdown', grammar: langMarkdown },
] as const;

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  shell: 'bash',
  md: 'markdown',
  py: 'python',
};

let highlighterPromise: Promise<HighlighterCore | null> | null = null;

/**
 * 惰性初始化高亮器：首次渲染时才创建，避免拖慢冷启动。
 * 使用 JS 正则引擎（而非 WASM 的 oniguruma）以适配 Workers 运行时。
 * 初始化失败时返回 null —— 高亮是增强项，失败绝不能让整篇文章渲染不出来。
 */
function getHighlighter(): Promise<HighlighterCore | null> {
  highlighterPromise ??= createHighlighterCore({
    themes: [themeGithubDark],
    langs: SUPPORTED_LANGUAGES.map((item) => item.grammar),
    engine: createJavaScriptRegexEngine(),
  })
    .then((highlighter) => highlighter as HighlighterCore)
    .catch(() => null);
  return highlighterPromise;
}

/* ------------------------------------------------------------------ *
 * hast 工具（手写递归，避免为一个遍历引入额外依赖）
 * ------------------------------------------------------------------ */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

/** 递归取出节点的纯文本内容，用于生成标题 id 与目录文本。 */
function collectText(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (!node.children) return '';
  return node.children.map(collectText).join('');
}

function isElement(node: HastNode, tagName: string): boolean {
  return node.type === 'element' && node.tagName === tagName;
}

/**
 * 标题锚点 id 生成器。
 * 与 extractHeadings 共用同一套规则，保证「目录里的链接一定跳得到正文标题」。
 * 重复标题追加 -1/-2 后缀，避免 id 冲突导致锚点只跳到第一个。
 */
function createHeadingSlugger(): (text: string) => string {
  const seen = new Map<string, number>();
  return (text: string): string => {
    const base = slugifyHeading(text) || 'section';
    const hit = seen.get(base) ?? 0;
    seen.set(base, hit + 1);
    return hit === 0 ? base : `${base}-${hit}`;
  };
}

/** 保留中英文与数字，其余折成连字符 —— 中文标题也能得到可读的锚点。 */
function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\u4e00-\u9fa5\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ------------------------------------------------------------------ *
 * rehype 插件
 * ------------------------------------------------------------------ */

/**
 * 用 Shiki 高亮代码块。
 * 输出的是真正的 hast 元素（而非 raw HTML 字符串），这样后续 sanitize 能逐节点审查，
 * 也让「高亮 → 消毒」的顺序在类型层面成立。
 */
function rehypeShikiHighlight() {
  return async (tree: HastNode): Promise<void> => {
    const highlighter = await getHighlighter();
    if (!highlighter) return;

    const targets: { pre: HastNode; code: HastNode; parent: HastNode }[] = [];
    const walk = (node: HastNode, parent: HastNode | null): void => {
      if (parent && isElement(node, 'pre') && node.children?.length === 1) {
        const onlyChild = node.children[0];
        if (onlyChild && isElement(onlyChild, 'code')) {
          targets.push({ pre: node, code: onlyChild, parent });
          return;
        }
      }
      node.children?.forEach((child) => walk(child, node));
    };
    walk(tree, null);

    for (const target of targets) {
      const className = (target.code.properties?.className as unknown[]) ?? [];
      const rawLang = className
        .map((item) => String(item))
        .find((item) => item.startsWith('language-'))
        ?.slice('language-'.length);
      const language = rawLang ? (LANGUAGE_ALIASES[rawLang] ?? rawLang) : 'text';
      const code = collectText(target.code).replace(/\n$/, '');

      const registered = SUPPORTED_LANGUAGES.some((item) => item.name === language);
      if (!registered) continue;

      try {
        // codeToHast 返回一个 root，其第一个子节点就是完整的 <pre>，直接整体替换。
        const highlighted = await highlighter.codeToHast(code, {
          lang: language,
          theme: 'github-dark',
        });
        const replacement = (highlighted as unknown as HastNode).children?.[0];
        if (!replacement) continue;
        const index = target.parent.children?.indexOf(target.pre) ?? -1;
        if (index >= 0 && target.parent.children) target.parent.children[index] = replacement;
      } catch {
        // 单个代码块高亮失败（语言未注册、语法异常）时保留原始 <pre>，不影响整篇渲染。
      }
    }
  };
}

/** 为标题写入 id，供目录锚点跳转使用。 */
function rehypeHeadingIds() {
  return (tree: HastNode): void => {
    const slugger = createHeadingSlugger();
    const walk = (node: HastNode): void => {
      if (node.type === 'element' && /^h[1-6]$/.test(node.tagName ?? '')) {
        const text = collectText(node);
        node.properties = { ...(node.properties ?? {}), id: slugger(text) };
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

/**
 * 外链补 rel="noopener noreferrer" 且新窗口打开。
 * 不加 rel 的 target="_blank" 会让被打开的页面拿到 window.opener 引用（反向劫持风险）。
 */
function rehypeExternalLinks() {
  return (tree: HastNode): void => {
    const walk = (node: HastNode): void => {
      if (isElement(node, 'a')) {
        const href = String(node.properties?.href ?? '');
        if (/^https?:\/\//i.test(href)) {
          node.properties = {
            ...(node.properties ?? {}),
            target: '_blank',
            rel: 'noopener noreferrer',
          };
        }
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

/* ------------------------------------------------------------------ *
 * 消毒白名单
 * ------------------------------------------------------------------ */

/** 构造 hast-util-sanitize 的属性定义元组，保留正则约束。 */
function attr(name: string, ...patterns: RegExp[]): [string, ...RegExp[]] {
  return [name, ...patterns];
}

/**
 * 在默认白名单基础上做最小放开：
 * - 放开 `className` / `id`：高亮与标题锚点需要；
 * - 放开 span/pre 的 `style`，但**限定为纯颜色声明**——Shiki 用内联样式上色，
 *   而任意 style 值是 CSS 注入面，所以用正则把取值钉死在 `color/background-color: #hex`。
 * 白名单之外的一切（script、on* 事件、javascript: 协议、iframe、style 标签）一律剔除。
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'id', 'className'],
    code: [...(defaultSchema.attributes?.code ?? []), attr('className', /^language-/)],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      attr('className', /^shiki/),
      attr('style', /^(?:color|background-color):#[0-9a-f]{3,8}$/i),
    ],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      attr('className', /^shiki/),
      attr('style', /^(?:color|background-color):#[0-9a-f]{3,8}$/i),
    ],
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
  },
};

/* ------------------------------------------------------------------ *
 * 处理器与对外 API
 * ------------------------------------------------------------------ */

/**
 * 处理器在模块级复用（插件内部状态都是「每次调用新建」的，因此可安全共享）。
 * 注意不能把 slugger 之类状态放到模块级，否则多篇文章会互相污染 id 计数。
 */
const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeShikiHighlight)
  .use(rehypeHeadingIds)
  .use(rehypeExternalLinks)
  .use(rehypeSanitize, sanitizeSchema)
  .use(rehypeStringify);

/** 渲染 Markdown 为 HTML 字符串。后台预览与线上渲染必须都走这里。 */
export async function renderMarkdown(markdown: string): Promise<string> {
  if (!markdown.trim()) return '';
  const file = await processor.process(markdown);
  return String(file);
}

/**
 * 渲染并同时返回目录。
 * 目录从**源 Markdown** 提取而非从 HTML 反解，这样锚点规则只有一处实现。
 */
export async function renderMarkdownWithToc(
  markdown: string,
): Promise<{ html: string; toc: TocItem[] }> {
  const [html, toc] = await Promise.all([renderMarkdown(markdown), Promise.resolve(extractHeadings(markdown))]);
  return { html, toc };
}

/**
 * 从 Markdown 原文提取一~六级标题作为目录。
 * 跳过代码块内的 `#`（``` 围栏内的行不算标题），否则代码示例会被误当成章节。
 */
export function extractHeadings(markdown: string): TocItem[] {
  const slugger = createHeadingSlugger();
  const items: TocItem[] = [];
  let insideFence = false;

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence) continue;

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) continue;

    const depth = match[1]?.length ?? 1;
    const text = stripInlineMarkdown(match[2] ?? '');
    items.push({ id: slugger(text), text, depth });
  }
  return items;
}

/** 目录文本去掉行内标记（`code`、**粗体**、[链接](url)），只保留可读文字。 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

/**
 * 估算阅读时长（分钟），对应 PRD AC4.3「由正文词数自动估算，无需手工填写」。
 * 中文按约 300 字/分钟、西文按约 200 词/分钟折算；结果至少 1 分钟（避免出现「0 分钟」）。
 */
export function estimateReadingMinutes(markdown: string): number {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  const cjkCount = (plain.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const wordCount = (plain.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;

  const minutes = cjkCount / 300 + wordCount / 200;
  return Math.max(1, Math.round(minutes));
}
