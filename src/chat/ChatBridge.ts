import type { ChatMessage } from './ChatPanel';

/**
 * 방송 창 ↔ 새 창 채팅 사이의 메시지 (같은 출처의 BroadcastChannel).
 * 채팅의 원본은 방송 창 하나에만 있고, 새 창은 보여 주기와 입력 전달만 한다.
 */
export type BridgeMessage =
  | { type: 'hello' } // 새 창 → 방송 창: 열렸음, 지금까지의 채팅을 보내 달라
  | { type: 'snapshot'; log: ChatMessage[]; notice?: string }
  | { type: 'msg'; m: ChatMessage }
  | { type: 'notice'; text?: string }
  | { type: 'send'; text: string } // 새 창에서 입력한 채팅
  | { type: 'bye' } // 새 창이 닫힘
  | { type: 'main-bye' }; // 방송 창이 닫힘

export const CHANNEL_NAME = 'live-talk-chat';

export function openBridge(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
  } catch {
    return null;
  }
}

/** 받은 데이터가 예상한 모양인지 확인 (같은 출처라도 형식이 깨진 메시지는 무시) */
export function isBridgeMessage(d: unknown): d is BridgeMessage {
  if (!d || typeof d !== 'object') return false;
  const m = d as Record<string, unknown>;
  switch (m.type) {
    case 'hello':
    case 'bye':
    case 'main-bye':
      return true;
    case 'send':
      return typeof m.text === 'string';
    case 'notice':
      return m.text === undefined || typeof m.text === 'string';
    case 'msg':
      return isChatMessage(m.m);
    case 'snapshot':
      return Array.isArray(m.log) && m.log.every(isChatMessage);
  }
  return false;
}

function isChatMessage(v: unknown): v is ChatMessage {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return typeof m.user === 'string' && typeof m.text === 'string';
}
