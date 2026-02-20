export type AiChatRole = 'user' | 'assistant';

export class AiChatDto {
  locale!: string;

  // Contexto libre (liga, match, filtros, etc.)
  context?: any;

  // Historial mínimo del chat
  messages!: { role: AiChatRole; content: string }[];
}
