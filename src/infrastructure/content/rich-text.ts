import sanitizeHtml from "sanitize-html";

const options = {
  allowedAttributes: {
    li: [{ name: "data-list", values: ["bullet", "ordered"] }],
  },
  allowedTags: [
    "b",
    "blockquote",
    "br",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "i",
    "li",
    "ol",
    "p",
    "strong",
    "u",
    "ul",
  ],
  nestingLimit: 64,
  nonTextTags: [
    "iframe",
    "math",
    "noembed",
    "noframes",
    "noscript",
    "option",
    "plaintext",
    "script",
    "style",
    "svg",
    "template",
    "textarea",
    "title",
    "xmp",
  ],
  parseStyleAttributes: false,
} satisfies sanitizeHtml.IOptions;

export const normalizeContentBody = (html: string): string | undefined => {
  let hasText = false;
  const normalized = sanitizeHtml(html, {
    ...options,
    textFilter: (text) => {
      if (/[^\s\u200b-\u200f\ufeff]/u.test(text)) hasText = true;
      return text;
    },
  });
  return hasText ? normalized : undefined;
};
