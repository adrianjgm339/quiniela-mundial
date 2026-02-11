'use client';

import { useEffect, useRef, useState } from 'react';

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function getApiBase() {
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

export function AiChatWidget(props: { locale: string; token?: string | null; context?: any }) {
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
          context,
          messages: next,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Error llamando a /ai/chat');
      }

      const data = await res.json();
      const reply = String(data?.reply ?? '').trim();
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || '—' }]);
    } catch (e: any) {
      setErr(e?.message ?? 'Error de IA');
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
        <div className="fixed bottom-20 right-5 z-40 w-[min(420px,calc(100vw-40px))] rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="font-semibold">
              {locale?.startsWith('es') ? 'Asistente IA' : 'AI Assistant'}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-zinc-800 px-3 py-1 hover:bg-zinc-700"
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
                    : 'mr-auto w-fit max-w-[85%] rounded-2xl bg-zinc-900 px-3 py-2 text-sm text-zinc-100'
                }
              >
                {m.content}
              </div>
            ))}

            {err && (
              <div className="rounded-lg border border-red-900 bg-red-950/50 p-2 text-sm text-red-200">
                {err}
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800 p-3">
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
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
              >
                {loading ? '…' : locale?.startsWith('es') ? 'Enviar' : 'Send'}
              </button>
            </form>

            <div className="mt-2 text-xs text-zinc-500">
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
