// Lightweight markdown to HTML converter for AI responses
// Handles: headers, bold, italic, lists, line breaks

export function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push('<br/>');
      continue;
    }

    // Headers
    if (trimmed.startsWith('#### ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h4>${inlineFormat(trimmed.slice(5))}</h4>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
      continue;
    }

    // Unordered list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push(`<li>${inlineFormat(numMatch[1])}</li>`);
      continue;
    }

    // Regular paragraph
    if (inList) { result.push('</ul>'); inList = false; }
    result.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  if (inList) result.push('</ul>');
  return result.join('');
}

function inlineFormat(text: string): string {
  return text
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`(.+?)`/g, '<code>$1</code>');
}
