import Markdown from 'react-markdown';

export function AiResponse({ text }: { text: string }) {
  return (
    <div className="ai-markdown">
      <Markdown
        skipHtml
        allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'code', 'pre', 'blockquote']}
        unwrapDisallowed
      >
        {text}
      </Markdown>
    </div>
  );
}

export function AiThinking() {
  return (
    <div className="ai-thinking" role="status">
      <span className="ai-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>Preparando resposta…</span>
    </div>
  );
}
