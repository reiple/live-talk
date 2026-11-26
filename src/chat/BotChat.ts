import { pick, rand, randInt } from '../util';
import type { ChatMessage } from './ChatPanel';

const NICKS = [
  '새벽감자', '민트초코단', '고양이집사', '퇴근하고싶다', '말랑젤리', '구름위산책',
  '라면은신라', '야근요정', '귤까먹는중', '방구석탐정', '치킨은반반', '별빛수집가',
  '오늘도출석', '소금빵러버', '키보드워리어', '눈팅전문', '하루바라기', '우유맛사탕',
];

const LINES = [
  'ㅋㅋㅋㅋㅋ', 'ㅎㅇㅎㅇ', '오늘도 귀엽다', '출석!', '방송 켜서 기다렸어요', 'ㄹㅇㅋㅋ',
  '목소리 좋다', '하루 화이팅!', '이 방송 맛집이네', '처음 왔어요!', '헉', 'ㄷㄷ',
  '오 진짜?', '다음 방송 언제 해요?', '퇴근길에 보는 중', '배경 예쁘다', '와 ㅋㅋㅋ',
  '공감ㅋㅋ', '하루야 사랑해', '오늘 컨텐츠 뭐예요?', '팔로우 박고 갑니다', '👀', '👏👏👏',
  ':하루웃음:', ':하트: :하트:', ':ㅋㅋ:', ':박수: :박수:', '오늘도 :하트:', ':하루놀람:', '귀여워 :하루웃음:',
];

const DONATION_LINES = ['맛있는 거 드세요!', '방송 잘 보고 있어요', '응원합니다!!', '오늘도 힐링하고 가요'];

/** 가상 시청자 채팅 생성기 */
export class BotChat {
  private timer = 0;
  private running = false;
  private lastDonation = Date.now();
  private pending: number[] = [];

  private lastEvent = Date.now();

  constructor(
    private emit: (m: ChatMessage) => void,
    private onDonation: (user: string, amount: number, text: string) => void,
    private onFollow?: (user: string, kind: 'follow' | 'subscribe') => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.pending.forEach(clearTimeout);
    this.pending = [];
  }

  private tick = () => {
    if (!this.running) return;
    const now = Date.now();
    if (now - this.lastDonation > 50000 && Math.random() < 0.08) {
      this.lastDonation = now;
      this.onDonation(pick(NICKS), pick([1000, 1000, 2000, 3000, 5000, 10000]), pick(DONATION_LINES));
    } else if (this.onFollow && now - this.lastEvent > 35000 && Math.random() < 0.1) {
      this.lastEvent = now;
      this.onFollow(pick(NICKS), Math.random() < 0.75 ? 'follow' : 'subscribe');
    } else {
      this.emit(this.randomMsg(pick(LINES)));
    }
    this.timer = window.setTimeout(this.tick, rand(700, 2800));
  };

  /** 대사에 맞춘 반응 채팅 (여러 명이 살짝 시간차를 두고) */
  burst(lines: string[]) {
    if (!this.running) return;
    const n = Math.min(lines.length + randInt(0, 2), 6);
    for (let i = 0; i < n; i++) {
      const id = window.setTimeout(() => this.emit(this.randomMsg(pick(lines))), rand(500, 3500));
      this.pending.push(id);
    }
    if (this.pending.length > 50) this.pending.splice(0, this.pending.length - 50);
  }

  private randomMsg(text: string): ChatMessage {
    const r = Math.random();
    return {
      user: pick(NICKS),
      text,
      badges: r < 0.05 ? ['manager'] : r < 0.35 ? ['sub'] : [],
    };
  }
}
