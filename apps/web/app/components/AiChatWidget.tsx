'use client';

import { useEffect, useRef, useState } from 'react';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

type AiChatWidgetProps = {
  locale: string;
  token?: string | null;
  // ✅ Evita any: el contexto es dinámico, así que unknown/Record es lo correcto
  context?: Record<string, unknown> | null;
};

export function AiChatWidget(props: AiChatWidgetProps) {
  const { locale, token = null, context = {} } = props;

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        locale?.startsWith('es')
          ? 'Soy tu asistente IA. Puedo ayudarte con estrategias y pronósticos. ¿Qué quieres analizar?'
          : 'I’m your AI assistant. I can help with strategy and predictions. What do you want to analyze?',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 0);
  }, [open, messages.length]);

  async function send(text: string) {
    const t = token || localStorage.getItem('token');
    if (!t) {
      setErr(locale?.startsWith('es') ? 'No hay sesión activa.' : 'No active session.');
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    setErr(null);
    setLoading(true);

    const next: ChatMsg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');

    try {
      const res = await fetch(`${getApiBase()}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({
          locale,
          context: context ?? {},
          messages: next,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Error llamando a /ai/chat');
      }

      const data: unknown = await res.json();

      const reply =
        typeof data === 'object' && data !== null && 'reply' in data
          ? String((data as { reply?: unknown }).reply ?? '').trim()
          : '';

      setMessages((prev) => [...prev, { role: 'assistant', content: reply || '—' }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error de IA';
      setErr(msg);

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: locale?.startsWith('es')
            ? 'Tuve un problema respondiendo. Intenta de nuevo.'
            : 'I had a problem replying. Please try again.',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-emerald-600 hover:bg-emerald-500 px-4 py-3 font-semibold shadow-lg"
        title={locale?.startsWith('es') ? 'Asistente IA' : 'AI Assistant'}
      >
        🤖 IA
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[min(420px,calc(100vw-40px))] rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <div className="font-semibold">
              {locale?.startsWith('es') ? 'Asistente IA' : 'AI Assistant'}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1 text-[var(--foreground)] hover:bg-[color:var(--muted)]"
            >
              X
            </button>
          </div>

          <div ref={listRef} className="max-h-[55vh] overflow-auto px-4 py-3 space-y-3">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={
                  m.role === 'user'
                    ? 'ml-auto w-fit max-w-[85%] rounded-2xl bg-emerald-600 px-3 py-2 text-sm'
                    : 'mr-auto w-fit max-w-[85%] rounded-2xl border border-[var(--border)] bg-[color:var(--muted)] px-3 py-2 text-sm text-[var(--foreground)]'
                }
              >
                {m.content}
              </div>
            ))}

            {err && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-600">
                {err}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--border)] p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (loading) return;
                send(input);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={locale?.startsWith('es') ? 'Escribe tu pregunta…' : 'Type your question…'}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[color:var(--muted)]"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? '…' : locale?.startsWith('es') ? 'Enviar' : 'Send'}
              </button>
            </form>

            <div className="mt-2 text-xs text-[color:var(--muted)]">
              {locale?.startsWith('es')
                ? 'Tip: pregunta por estrategias, cómo elegir marcadores, o “qué partido es más impredecible”.'
                : 'Tip: ask about strategy, how to pick scores, or “which match is most unpredictable”.'}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ✅ Export default + named (para que no falle ningún tipo de import)
export default AiChatWidget;