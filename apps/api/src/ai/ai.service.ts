import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { AiChatDto } from './dto/ai-chat.dto';

type Provider = 'mock' | 'openai' | 'hf';

@Injectable()
export class AiService {
  private openai: OpenAI | null = null;

  private getProvider(): Provider {
    // Prioridad: AI_PROVIDER (nuevo) -> AI_MODE (viejo) -> openai
    const raw = (process.env.AI_PROVIDER || process.env.AI_MODE || 'openai')
      .toLowerCase()
      .trim();

    if (raw === 'mock') return 'mock';
    if (raw === 'hf' || raw === 'huggingface') return 'hf';
    return 'openai';
  }

  constructor() {
    const provider = this.getProvider();

    // MOCK y HF no necesitan inicializar OpenAI
    if (provider !== 'openai') return;

    const key = process.env.OPENAI_API_KEY;
    if (!key || key === 'TU_API_KEY_AQUI') {
      // No rompemos el arranque; al pedir chat devolvemos 503 con mensaje claro
      this.openai = null;
      return;
    }

    this.openai = new OpenAI({ apiKey: key });
  }

  async chat(user: any, dto: AiChatDto): Promise<{ reply: string }> {
    const provider = this.getProvider();

    if (provider === 'mock') {
      return { reply: this.mockReply(dto) };
    }

    if (provider === 'hf') {
      return { reply: await this.hfReply(dto) };
    }

    // OPENAI
    if (!this.openai) {
      throw new ServiceUnavailableException(
        'IA no configurada en el servidor (falta OPENAI_API_KEY).',
      );
    }

    return { reply: await this.openaiReply(dto) };
  }

  // -----------------------
  // MOCK (no gasta)
  // -----------------------
  private mockReply(dto: AiChatDto) {
    const locale = dto?.locale || 'es';
    const ctx = dto?.context || {};
    const selected = (ctx as any)?.selectedMatch;

    if (selected?.homeTeamName && selected?.awayTeamName) {
      return locale.startsWith('es')
        ? `🧪 (MOCK) Partido: ${selected.homeTeamName} vs ${selected.awayTeamName}\n\nSugerencias de marcador (sin datos externos):\n- 1-0\n- 1-1\n- 2-1\n\nIdea: cubre un cerrado + empate.\n\nPronósticos no garantizan resultados.`
        : `🧪 (MOCK) Match: ${selected.homeTeamName} vs ${selected.awayTeamName}\n\nSuggested scorelines (no external data):\n- 1-0\n- 1-1\n- 2-1\n\nIdea: cover a tight win + draw.\n\nPredictions do not guarantee results.`;
    }

    return locale.startsWith('es')
      ? `🧪 (MOCK) Puedo ayudarte con estrategia general.\n\n3 tips sin datos externos:\n1) Cubre 1-1 / 1-0 / 2-1 para partidos parejos.\n2) Si cierran pronto, evita marcadores raros.\n3) Diversifica: no pongas todos “favorito 3-0”.\n\nPronósticos no garantizan resultados.`
      : `🧪 (MOCK) I can help with general strategy.\n\n3 tips (no external data):\n1) Cover 1-1 / 1-0 / 2-1 for balanced matches.\n2) If it closes soon, avoid wild scores.\n3) Diversify picks—don’t spam “favorite 3-0”.\n\nPredictions do not guarantee results.`;
  }

  // -----------------------
  // HF (HuggingFace Inference API)
  // -----------------------
  private async hfReply(dto: AiChatDto): Promise<string> {
    const token = process.env.HF_TOKEN;
    const model = process.env.HF_MODEL || 'meta-llama/Meta-Llama-3.1-8B-Instruct';

    if (!token) {
      throw new ServiceUnavailableException(
        'IA (HF) no configurada: falta HF_TOKEN.',
      );
    }

    const locale = dto?.locale || 'es';
    const contextJson = dto?.context ? JSON.stringify(dto.context) : '{}';

    const systemPrompt = [
      'Eres el asistente de IA de "Quiniela Mundial 2026".',
      'Objetivo: ayudar al usuario a hacer pronósticos (entretenimiento) y entender estrategias/reglas.',
      'Responde en el idioma del usuario (usa dto.locale).',
      'NO inventes datos externos (lesiones, cuotas, noticias). Si faltan datos, dilo y da heurísticas.',
      'Usa el contexto JSON para personalizar (liga activa, partido, fase, grupo, cierre).',
      'Da recomendaciones accionables: 2-3 marcadores sugeridos + breve razón.',
      'Incluye: "Pronósticos no garantizan resultados".',
    ].join('\n');

    const safeMsgs =
      (dto.messages || [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n') || 'USER: Hola';

    // Prompt tipo instruct (simple y estable)
    const prompt = `${systemPrompt}\n\nContexto JSON:\n${contextJson}\n\nConversación:\n${safeMsgs}\n\nASSISTANT:`;

    const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            max_new_tokens: 220,
            temperature: 0.7,
            return_full_text: false,
          },
          options: { wait_for_model: true },
        }),
      });

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = data?.error || data?.message || `HF error ${res.status}`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }

      // HF suele devolver [{generated_text: "..."}]
      const generated =
        Array.isArray(data) ? data?.[0]?.generated_text : data?.generated_text;

      const reply = (generated || '').toString().trim();
      return reply || '…';
    } catch (e: any) {
      throw new InternalServerErrorException(
        e?.message ?? 'Error llamando a HuggingFace Inference API.',
      );
    }
  }

  // -----------------------
  // OpenAI
  // -----------------------
  private async openaiReply(dto: AiChatDto): Promise<string> {
    const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
    const contextJson = dto.context ? JSON.stringify(dto.context) : '{}';

    const systemPrompt = [
      'Eres el asistente de IA de "Quiniela Mundial 2026".',
      'Objetivo: ayudar al usuario a hacer pronósticos (entretenimiento) y entender estrategias/reglas.',
      'Responde en el idioma del usuario; usa dto.locale como guía.',
      'NO inventes datos externos (lesiones, cuotas, noticias). Si faltan datos, dilo y da heurísticas.',
      'Usa el contexto JSON para personalizar (liga activa, partido, fase, grupo, cierre).',
      'Da recomendaciones accionables: 2-3 marcadores sugeridos + breve razón.',
      'Incluye una nota breve: "Pronósticos no garantizan resultados".',
    ].join('\n');

    const safeMsgs =
      (dto.messages || [])
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
        .map((m) => ({ role: m.role, content: m.content })) || [];

    try {
      const completion = await this.openai!.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `${systemPrompt}\n\nContexto JSON:\n${contextJson}`,
          },
          ...safeMsgs,
        ],
        temperature: 0.7,
      });

      return completion.choices?.[0]?.message?.content?.trim() || '…';
    } catch (err: any) {
      throw new InternalServerErrorException(
        err?.message ?? 'Error llamando al proveedor de IA.',
      );
    }
  }
}
