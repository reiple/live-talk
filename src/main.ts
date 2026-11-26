import './styles/base.css';
import './styles/layout.css';
import './styles/stage.css';
import './styles/chat.css';

import { SoundManager } from './audio/SoundManager';
import { BotChat } from './chat/BotChat';
import { ChatPanel } from './chat/ChatPanel';
import { DialogueBox, type DialogueSettings } from './dialogue/DialogueBox';
import { ScriptRunner } from './script/ScriptRunner';
import type { ScriptFile, Trigger } from './script/types';
import { CharacterLayer, EXPRESSION_NAMES } from './stage/characters';
import { Stage } from './stage/Stage';
import { ME, parseVoteText, percent, VotePanel } from './vote/VotePanel';
import { $, Gate, fmtNum, fmtTime, h, nameColor, rand, randInt, reducedMotion, store } from './util';

const params = new URLSearchParams(location.search);
const SCRIPT_URL = `${import.meta.env.BASE_URL}scripts/${(params.get('script') ?? 'demo').replace(/[^\w-]/g, '')}.json`;

/* ---------------- 설정 ---------------- */
interface Settings extends DialogueSettings {
  volume: number;
  muted: boolean;
  subtitles: boolean;
  subSize: number;
  subAlpha: number;
}
const DEFAULTS: Settings = {
  charMs: 40,
  auto: true,
  autoDelay: 1400,
  volume: 0.6,
  muted: false,
  subtitles: true,
  subSize: 1,
  subAlpha: 0.92,
};
const settings: Settings = store.get('lt.settings', DEFAULTS);
const saveSettings = () => store.set('lt.settings', settings);

/* ---------------- 부트스트랩 ---------------- */
async function boot() {
  const file: ScriptFile = await fetch(SCRIPT_URL).then((r) => {
    if (!r.ok) throw new Error(`스크립트를 불러오지 못했습니다: ${SCRIPT_URL}`);
    return r.json();
  });

  const gate = new Gate();
  const sound = new SoundManager();
  sound.setVolume(settings.volume);
  sound.setMuted(settings.muted);

  const stage = new Stage($('#stage-wrap'));
  stage.setBackground('studio', 'cut');
  const chars = new CharacterLayer($('#char-layer'), file.characters);
  const dialogue = new DialogueBox($('#dialogue'), $('#dlg-live'), sound, gate, () => settings);
  const chat = new ChatPanel($('#chat'));
  const hostId = Object.keys(file.characters)[0];
  const host = file.characters[hostId];

  const stats = { viewers: randInt(1180, 1460), startedAt: 0 };

  /* ---- 이벤트 트리거 (채팅 키워드 / 팔로우·구독·후원) ---- */
  const cooldowns = new Map<Trigger, number>();
  const fire = (match: (t: Trigger) => boolean, vars: Record<string, string>) => {
    const now = Date.now();
    for (const t of file.triggers ?? []) {
      if (!match(t) || (cooldowns.get(t) ?? 0) > now) continue;
      if (runner.callLabel(t.call, vars)) cooldowns.set(t, now + (t.cooldownMs ?? 8000));
      return;
    }
  };

  /** 후원. 스크립트가 직접 넣은 후원은 이미 감사 대사가 있으므로 트리거하지 않는다. */
  const donate = (user: string, amount: number, text: string, react = true) => {
    chat.add({ user, text, donation: amount });
    stage.alert('donation', user, { amount, text });
    sound.sfx('chime');
    stats.viewers += randInt(3, 12);
    if (react) fire((t) => t.event === 'donation', { user, amount: fmtNum(amount) });
  };
  const follow = (user: string, kind: 'follow' | 'subscribe') => {
    stage.alert(kind, user);
    chat.add({ user: '', text: `${user} 님이 ${kind === 'follow' ? '팔로우' : '구독'}했습니다.`, system: true });
    sound.sfx(kind === 'follow' ? 'pop' : 'chime');
    stats.viewers += randInt(1, 4);
    fire((t) => t.event === kind, { user });
  };
  const bots = new BotChat((m) => chat.add(m), donate, follow);

  /* ---- 시청자 투표 (DLG-14) ---- */
  const vote: VotePanel = new VotePanel($('#stage'), gate, {
    onStart: (q, opts) => {
      sound.sfx('pop');
      chat.add({
        user: '',
        system: true,
        text: `[투표] ${q} — 채팅에 번호를 입력하세요 (${opts.map((o, i) => `${i + 1}. ${o.text}`).join(' / ')})`,
      });
      bots.startVoting(vote.weights, (u, i) => vote.cast(u, i), () => vote.active);
    },
    onEnd: (_q, opts, r) => {
      bots.stopVoting();
      sound.sfx('chime');
      const pct = percent(r.counts[r.index], r.total);
      chat.add({ user: '', system: true, text: `[투표 결과] ${opts[r.index].text} (${r.counts[r.index]}표, ${pct}%)` });
    },
  });

  const runner = new ScriptRunner(file, {
    stage,
    chars,
    dialogue,
    sound,
    gate,
    vote,
    chat: (user, text, donation) => (donation ? donate(user, donation, text, false) : chat.add({ user, text })),
    react: (lines) => bots.burst(lines),
    notice: (text) => chat.setNotice(text),
    onEnd: () => {
      bots.stop();
      dialogue.clear();
      stage.showScreen('방송이 종료되었습니다');
      chat.add({ user: '', text: '방송이 종료되었습니다.', system: true });
      document.body.classList.add('ended');
    },
  });

  chat.setNotice(file.meta.notice);
  chat.onSend((text) => {
    chat.add({ user: '시청자(나)', text, badges: ['me'] });
    // 투표 중 번호 채팅은 투표로 처리
    const v = vote.active ? parseVoteText(text, vote.optionCount) : null;
    if (v != null) {
      vote.cast(ME, v);
      return;
    }
    fire((t) => !!t.keyword && text.includes(t.keyword), { user: '시청자(나)' });
  });

  /* ---- 방송 정보 ---- */
  renderInfo(file, host?.palette?.hair ?? '#45d6b5', (kind) => {
    if (runner.state === 'running') follow('시청자(나)', kind);
  });
  renderSidebar();

  const elapsedEls = [$('#ctl-elapsed'), $('#ch-elapsed')];
  const viewerEls = [$('#hud-viewers'), $('#ch-viewers')];
  const updateStats = () => {
    if (stats.startedAt && runner.state === 'running') stats.viewers = Math.max(50, stats.viewers + randInt(-6, 8));
    const el = stats.startedAt ? fmtTime((Date.now() - stats.startedAt) / 1000) : '00:00:00';
    elapsedEls[0].textContent = el;
    elapsedEls[1].textContent = stats.startedAt ? `${el} 방송 중` : '방송 준비 중';
    viewerEls[0].textContent = fmtNum(stats.viewers);
    viewerEls[1].textContent = `${fmtNum(stats.viewers)}명 시청 중`;
  };
  updateStats();
  setInterval(updateStats, 1000);

  /* ---- 시작 ---- */
  const startBroadcast = () => {
    sound.unlock();
    document.body.classList.remove('ended');
    document.body.classList.add('started');
    stats.startedAt ||= Date.now();
    chat.add({ user: '', text: `${file.meta.channel} 님의 방송에 오신 것을 환영합니다!`, system: true });
    bots.start();
    runner.start();
  };

  stage.showScreen('방송 준비 중…');
  const overlay = $<HTMLButtonElement>('#start-overlay');
  overlay.addEventListener('click', () => {
    overlay.remove();
    startBroadcast();
  });

  setupPlayer({ gate, sound, dialogue, stage, chars, runner, vote, startBroadcast });
  setupAdmin({ runner, gate, dialogue, chars, stage, chat, vote, hostId, file, donate, follow, startBroadcast });
}

/* ================================================================== */
/* 플레이어 컨트롤                                                      */
/* ================================================================== */
function setupPlayer(x: {
  gate: Gate;
  sound: SoundManager;
  dialogue: DialogueBox;
  stage: Stage;
  chars: CharacterLayer;
  runner: ScriptRunner;
  vote: VotePanel;
  startBroadcast: () => void;
}) {
  const { gate, sound, dialogue, runner } = x;
  const player = $('#player');
  const wrap = $('#stage-wrap');
  const stageEl = $('#stage');

  // 자막 스타일
  const applySub = () => {
    stageEl.style.setProperty('--dlg-scale', String(settings.subSize));
    stageEl.style.setProperty('--dlg-alpha', String(settings.subAlpha));
    stageEl.classList.toggle('no-subs', !settings.subtitles);
    $('#btn-cc').setAttribute('aria-pressed', String(settings.subtitles));
  };
  applySub();

  // 재생/일시정지
  const playBtn = $('#btn-play');
  const syncPlay = (p: boolean) => {
    playBtn.querySelector('use')!.setAttribute('href', p ? '#i-play' : '#i-pause');
    playBtn.setAttribute('aria-label', p ? '재생' : '일시정지');
    $('#adm-play').textContent = p ? '재생' : '일시정지';
    player.classList.toggle('paused', p);
  };
  gate.onChange(syncPlay);
  playBtn.addEventListener('click', () => gate.toggle());
  $('#btn-next').addEventListener('click', () => dialogue.advance());

  // 볼륨
  const muteBtn = $('#btn-mute');
  const vol = $<HTMLInputElement>('#vol');
  vol.value = String(settings.volume);
  const syncVol = () => {
    muteBtn.querySelector('use')!.setAttribute('href', settings.muted || settings.volume === 0 ? '#i-mute' : '#i-vol');
    vol.style.setProperty('--p', `${(settings.muted ? 0 : settings.volume) * 100}%`);
  };
  syncVol();
  muteBtn.addEventListener('click', () => {
    settings.muted = !settings.muted;
    sound.setMuted(settings.muted);
    syncVol();
    saveSettings();
  });
  vol.addEventListener('input', () => {
    settings.volume = Number(vol.value);
    settings.muted = false;
    sound.setVolume(settings.volume);
    sound.setMuted(false);
    syncVol();
    saveSettings();
  });

  // 자막 토글
  $('#btn-cc').addEventListener('click', () => {
    settings.subtitles = !settings.subtitles;
    applySub();
    saveSettings();
  });

  // 설정 팝업
  const pop = $('#settings-pop');
  const setBtn = $('#btn-settings');
  const speed = $<HTMLSelectElement>('#set-speed');
  const auto = $<HTMLInputElement>('#set-auto');
  const delay = $<HTMLInputElement>('#set-delay');
  const delayOut = $('#set-delay-out');
  const size = $<HTMLSelectElement>('#set-size');
  const alpha = $<HTMLInputElement>('#set-alpha');
  speed.value = String(settings.charMs);
  auto.checked = settings.auto;
  delay.value = String(settings.autoDelay);
  size.value = String(settings.subSize);
  alpha.value = String(settings.subAlpha);
  const syncDelay = () => (delayOut.textContent = `${(settings.autoDelay / 1000).toFixed(1)}초`);
  syncDelay();
  speed.addEventListener('change', () => ((settings.charMs = Number(speed.value)), saveSettings()));
  auto.addEventListener('change', () => ((settings.auto = auto.checked), saveSettings()));
  delay.addEventListener('input', () => ((settings.autoDelay = Number(delay.value)), syncDelay(), saveSettings()));
  size.addEventListener('change', () => ((settings.subSize = Number(size.value)), applySub(), saveSettings()));
  alpha.addEventListener('input', () => ((settings.subAlpha = Number(alpha.value)), applySub(), saveSettings()));

  const backlog = $('#backlog');
  const closePops = () => {
    pop.hidden = true;
    backlog.hidden = true;
    setBtn.setAttribute('aria-expanded', 'false');
  };
  setBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = pop.hidden;
    closePops();
    pop.hidden = !open;
    setBtn.setAttribute('aria-expanded', String(open));
  });

  // 대사 로그
  const list = $('#backlog-list');
  const renderLog = () => {
    list.textContent = '';
    for (const e of dialogue.history) {
      const li = h('li');
      if (e.name) li.append(h('b', '', e.name));
      li.append(h('span', '', e.text));
      list.append(li);
    }
    list.scrollTop = list.scrollHeight;
  };
  dialogue.onLine = () => {
    if (!backlog.hidden) renderLog();
  };
  $('#btn-log').addEventListener('click', (e) => {
    e.stopPropagation();
    const open = backlog.hidden;
    closePops();
    backlog.hidden = !open;
    if (open) renderLog();
  });
  $('#backlog-close').addEventListener('click', closePops);
  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (!t.closest('.pop')) closePops();
  });

  // 넓은 화면 / 전체화면
  $('#btn-wide').addEventListener('click', () => document.body.classList.toggle('wide'));
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void player.requestFullscreen?.().catch(() => undefined);
  };
  $('#btn-full').addEventListener('click', toggleFull);
  document.addEventListener('fullscreenchange', () => {
    player.classList.toggle('is-full', !!document.fullscreenElement);
    x.stage.fit();
  });

  // 스테이지 클릭 → 대사 진행
  wrap.addEventListener('click', () => {
    if (runner.state === 'running') dialogue.advance();
  });

  // 컨트롤 자동 숨김 (3초)
  let idleT = 0;
  const wake = () => {
    player.classList.remove('idle');
    clearTimeout(idleT);
    idleT = window.setTimeout(() => {
      if (pop.hidden && backlog.hidden) player.classList.add('idle');
    }, 3000);
  };
  player.addEventListener('pointermove', wake);
  player.addEventListener('pointerleave', () => player.classList.add('idle'));
  wake();

  // 컨트롤 바가 보일 때 대사창을 그만큼 올려서 자막이 가려지지 않게 한다
  const controls = $('#controls');
  const updateLift = () => {
    const s = x.stage.scale || 1;
    // 컨트롤 바 위쪽의 투명 그라디언트 일부는 겹쳐도 되므로 20px 제외, 대사창 아래 여백(40) 제외
    const lift = Math.max(0, (controls.offsetHeight - 20) / s - 40);
    stageEl.style.setProperty('--ctl-lift', `${lift.toFixed(1)}px`);
  };
  x.stage.onFit = updateLift;
  updateLift();

  // 캐릭터 시선이 마우스를 따라온다 (CHR-07)
  let gazeRaf = 0;
  let gazeInside = false;
  wrap.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    gazeInside = true;
    const r = wrap.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    // 눈 높이(화면 위쪽 약 1/3)를 기준점으로
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1 + 0.3;
    cancelAnimationFrame(gazeRaf);
    gazeRaf = requestAnimationFrame(() => x.chars.lookAt(nx, ny));
  });
  wrap.addEventListener('pointerleave', () => {
    gazeInside = false;
    x.chars.lookAt(0, 0);
  });
  // 마우스가 없을 때는 가끔 두리번거린다
  setInterval(() => {
    if (gazeInside || document.hidden || reducedMotion()) return;
    if (Math.random() < 0.5) x.chars.lookAt(0, 0);
    else x.chars.lookAt(rand(-0.6, 0.6), rand(-0.4, 0.3));
  }, 3000);

  // 키보드 단축키
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter') {
      if (t.closest('button')) return;
      e.preventDefault();
      const ov = document.getElementById('start-overlay');
      if (ov) ov.click();
      else dialogue.advance();
    } else if (k === 'm') muteBtn.click();
    else if (k === 'f') toggleFull();
    else if (k === 'c') $('#btn-cc').click();
    else if (k === 'p' || k === 'k') gate.toggle();
    else if (k === '`') toggleAdmin();
    else if (k === 'escape') closePops();
    else if (/^[1-4]$/.test(k) && x.vote.active) x.vote.cast(ME, Number(k) - 1);
  });

  // 레이아웃 토글
  $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  $('#chat-close').addEventListener('click', () => setChat(false));
  $('#chat-open').addEventListener('click', () => setChat(true));
  const setChat = (on: boolean) => {
    document.body.classList.toggle('chat-off', !on);
    $('#chat-open').hidden = on;
  };
}

/* ================================================================== */
/* 운영 패널                                                            */
/* ================================================================== */
let toggleAdmin = () => {};

function setupAdmin(x: {
  runner: ScriptRunner;
  gate: Gate;
  dialogue: DialogueBox;
  chars: CharacterLayer;
  stage: Stage;
  chat: ChatPanel;
  vote: VotePanel;
  hostId: string;
  file: ScriptFile;
  donate: (u: string, a: number, t: string) => void;
  follow: (u: string, kind: 'follow' | 'subscribe') => void;
  startBroadcast: () => void;
}) {
  const panel = $('#admin');
  toggleAdmin = () => (panel.hidden = !panel.hidden);
  $('#admin-btn').addEventListener('click', toggleAdmin);
  $('#admin-close').addEventListener('click', () => (panel.hidden = true));
  if (params.has('admin')) panel.hidden = false;

  const ensureStarted = () => {
    const ov = document.getElementById('start-overlay');
    if (ov) ov.click();
  };

  $('#adm-play').addEventListener('click', () => x.gate.toggle());
  $('#adm-next').addEventListener('click', () => x.dialogue.advance());
  $('#adm-restart').addEventListener('click', () => {
    ensureStarted();
    if (x.runner.state === 'ended') x.startBroadcast();
    else x.runner.start();
  });

  const exprBox = $('#adm-exprs');
  const exprSel = $<HTMLSelectElement>('#adm-expr');
  exprSel.append(new Option('(표정 유지)', ''));
  for (const e of EXPRESSION_NAMES) {
    const b = h('button', 'btn ghost', e);
    b.addEventListener('click', () => {
      if (!x.chars.has(x.hostId)) x.chars.show(x.hostId, 'center');
      x.chars.setExpr(x.hostId, e);
    });
    exprBox.append(b);
    exprSel.append(new Option(e, e));
  }

  panel.querySelectorAll<HTMLButtonElement>('[data-fx]').forEach((b) =>
    b.addEventListener('click', () => x.stage.effect(b.dataset.fx as 'shake' | 'flash' | 'cutin', '잠깐!')),
  );
  $('#adm-donate').addEventListener('click', () => x.donate('테스트후원자', 3000, '운영 패널 후원 테스트!'));
  $('#adm-follow').addEventListener('click', () => x.follow('테스트팔로워', 'follow'));
  $('#adm-sub').addEventListener('click', () => x.follow('테스트구독자', 'subscribe'));
  $('#adm-vote-close').addEventListener('click', () => x.vote.close());
  $('#adm-banner').addEventListener('click', () => x.stage.banner(x.file.meta.title, x.file.meta.channel));

  // 채팅 고정 공지 (CHT-07)
  const noticeInput = $<HTMLInputElement>('#adm-notice-text');
  noticeInput.value = x.file.meta.notice ?? '';
  $<HTMLFormElement>('#adm-notice').addEventListener('submit', (e) => {
    e.preventDefault();
    x.chat.setNotice(noticeInput.value);
  });
  $('#adm-notice-clear').addEventListener('click', () => x.chat.setNotice());

  $<HTMLFormElement>('#adm-say').addEventListener('submit', (e) => {
    e.preventDefault();
    const ta = $<HTMLTextAreaElement>('#adm-text');
    const text = ta.value.trim();
    if (!text) return;
    ensureStarted();
    // 방송 종료 후에도 즉석 대사는 출력할 수 있도록 종료 화면을 걷는다
    if (x.runner.state !== 'running') x.stage.showScreen(null);
    x.runner.inject({ cmd: 'say', who: x.hostId, text, ...(exprSel.value ? { expr: exprSel.value } : {}) });
    ta.value = '';
  });
}

/* ================================================================== */
/* 방송 정보 / 사이드바 (더미 데이터)                                    */
/* ================================================================== */
function renderInfo(file: ScriptFile, color: string, onAction: (kind: 'follow' | 'subscribe') => void) {
  const m = file.meta;
  document.title = `${m.channel} - ${m.title} | Live Talk`;
  $('#stream-title').textContent = m.title;
  $('#ch-name').textContent = m.channel;
  const av = $('#ch-avatar');
  av.textContent = m.channel.slice(0, 1);
  av.style.background = color;
  $('#ch-cat').textContent = m.category ?? '';
  const tags = $('#ch-tags');
  for (const t of m.tags ?? []) tags.append(h('span', 'tag', t));

  // 팔로우 / 구독 (데모: 결제 없이 상태만 저장). 켜는 순간 방송 화면에 알림이 뜬다.
  const toggleBtn = (id: string, key: string, kind: 'follow' | 'subscribe', labels: [off: string, on: string]) => {
    const btn = $(id);
    let on = store.getRaw(key, false);
    const sync = () => {
      btn.textContent = labels[on ? 1 : 0];
      btn.setAttribute('aria-pressed', String(on));
      btn.classList.toggle('on', on);
    };
    sync();
    btn.addEventListener('click', () => {
      on = !on;
      store.set(key, on);
      sync();
      if (on) onAction(kind);
    });
  };
  toggleBtn('#btn-follow', 'lt.follow', 'follow', ['＋ 팔로우', '✓ 팔로잉']);
  toggleBtn('#btn-sub', 'lt.sub', 'subscribe', ['구독', '♛ 구독 중']);
}

function renderSidebar() {
  const follow = [
    ['하루', '저스트 채팅', 1342, true],
    ['밤하늘라디오', '음악', 512, true],
    ['픽셀공방', '게임', 0, false],
    ['요리하는곰', '요리', 0, false],
  ] as const;
  const rec = [
    ['코딩하는고양이', '과학/기술', 873],
    ['탐정사무소', '추리 토크', 2210],
    ['새벽의정원', 'ASMR', 640],
    ['리듬마스터', '게임', 3105],
    ['그림그리는날', '아트', 288],
  ] as const;
  const item = (name: string, cat: string, viewers: number, live: boolean) => {
    const li = h('li', live ? 'live' : 'off');
    const av = h('span', 'avatar', name.slice(0, 1));
    av.style.background = nameColor(name);
    const meta = h('div', 'sb-meta');
    meta.append(h('b', '', name), h('small', '', live ? cat : '오프라인'));
    li.append(av, meta);
    if (live) li.append(h('span', 'sb-v', fmtNum(viewers)));
    return li;
  };
  follow.forEach(([n, c, v, l]) => $('#follow-list').append(item(n, c, v, l)));
  rec.forEach(([n, c, v]) => $('#rec-list').append(item(n, c, v, true)));
}

boot().catch((e) => {
  console.error(e);
  document.body.append(h('div', 'fatal', String(e instanceof Error ? e.message : e)));
});

