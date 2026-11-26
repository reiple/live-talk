export type Position = 'left' | 'center' | 'right';

export interface CharacterDef {
  name: string;
  nameColor?: string;
  /** 타이핑 효과음 음색: blip_high | blip_mid | blip_low | blip_soft */
  voice?: string;
  /** 표정 → [입 닫힘, 입 열림] 이미지 경로. 없으면 내장 플레이스홀더 캐릭터 사용 */
  sprites?: Record<string, [string, string]>;
  /** 플레이스홀더 캐릭터 색상 */
  palette?: { hair?: string; eyes?: string; outfit?: string; accent?: string };
}

export type Command =
  | { cmd: 'say'; who?: string; expr?: string; text: string; speed?: number; reactions?: string[] }
  | { cmd: 'expr'; who: string; expr: string }
  | { cmd: 'show'; who: string; pos?: Position; expr?: string }
  | { cmd: 'hide'; who: string }
  | { cmd: 'bg'; src: string; transition?: 'cut' | 'fade' }
  | { cmd: 'effect'; type: 'shake' | 'flash' | 'cutin'; text?: string }
  | { cmd: 'sfx'; src: string }
  | { cmd: 'bgm'; src?: string; volume?: number }
  | { cmd: 'chat'; user: string; text: string; donation?: number }
  /** 방송 제목 배너 (기본값: meta.title / meta.channel) */
  | { cmd: 'banner'; text?: string; sub?: string; ms?: number }
  /** 채팅 고정 공지. text 가 없으면 공지를 내린다 */
  | { cmd: 'notice'; text?: string }
  | { cmd: 'wait'; ms: number }
  | { cmd: 'label'; name: string }
  | { cmd: 'jump'; to: string }
  | { cmd: 'call'; to: string }
  | { cmd: 'return' }
  | { cmd: 'end' };

export type StreamEvent = 'follow' | 'subscribe' | 'donation';

/** keyword 또는 event 중 하나로 발동한다. label 블록에서 $user, $amount 를 쓸 수 있다. */
export interface Trigger {
  /** 시청자 채팅에 포함되면 발동 */
  keyword?: string;
  /** 팔로우/구독/후원 이벤트 발생 시 발동 */
  event?: StreamEvent;
  /** 실행할 label 이름 (블록은 return 으로 끝나야 함) */
  call: string;
  cooldownMs?: number;
}

export interface StreamMeta {
  title: string;
  channel: string;
  category?: string;
  tags?: string[];
  loop?: boolean;
  /** 채팅 고정 공지 초기값 (대사 태그 사용 가능) */
  notice?: string;
}

export interface ScriptFile {
  meta: StreamMeta;
  characters: Record<string, CharacterDef>;
  triggers?: Trigger[];
  script: Command[];
}
