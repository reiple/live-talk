import { expect, test, type Page } from '@playwright/test';

/* ------------------------------------------------------------------ */
/* 헬퍼                                                                */
/* ------------------------------------------------------------------ */

type Cmd = Record<string, unknown>;

/** 테스트용 방송 스크립트. demo.json 요청을 가로채 대신 응답한다. */
const fixture = (script: Cmd[], extra: Record<string, unknown> = {}) => ({
  meta: { title: '테스트 방송', channel: '테스터' },
  characters: { host: { name: '하루', voice: 'blip_mid' } },
  script,
  ...extra,
});

/** 자동 진행을 꺼서 클릭으로만 진행되게 한다 (결정적인 테스트). */
const MANUAL = { charMs: 15, auto: false };

async function open(page: Page, script?: object, settings: object = MANUAL) {
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('e2e-init')) {
      localStorage.setItem('lt.settings', JSON.stringify(s));
      sessionStorage.setItem('e2e-init', '1');
    }
  }, settings);
  if (script) await page.route('**/scripts/demo.json', (r) => r.fulfill({ json: script }));
  await page.goto('/');
}

async function start(page: Page, script?: object, settings?: object) {
  await open(page, script, settings);
  await page.locator('#start-overlay').click();
}

const text = (page: Page) => page.locator('.dlg-text');
const nextMark = (page: Page) => page.locator('.dlg-next');
/** 현재 페이지 출력이 끝날 때까지 대기 */
const typed = (page: Page) => expect(nextMark(page)).toHaveClass(/\bon\b/);
const stage = (page: Page) => page.locator('#stage-wrap');

/* ------------------------------------------------------------------ */
/* 방송 시작 / 대사 진행                                                 */
/* ------------------------------------------------------------------ */

test('시작 전 대기 화면 → 클릭 시 방송 시작, 이름표와 첫 대사 출력', async ({ page }) => {
  await open(page, fixture([{ cmd: 'say', who: 'host', text: '첫 번째 대사' }]));
  await expect(page.locator('#screen-msg')).toHaveText('방송 준비 중…');
  await expect(page.locator('#start-overlay')).toBeVisible();

  await page.locator('#start-overlay').click();

  await expect(page.locator('#start-overlay')).toHaveCount(0);
  await expect(page.locator('.live-badge')).toBeVisible();
  await expect(page.locator('.nameplate')).toHaveText('하루');
  await typed(page);
  await expect(text(page)).toHaveText('첫 번째 대사');
  await expect(page.locator('.char')).toHaveCount(1);
});

test('출력 중 클릭 → 전체 표시, 다시 클릭 → 다음 대사', async ({ page }) => {
  await start(
    page,
    fixture([
      { cmd: 'say', who: 'host', text: '이 문장은 아주 천천히 한 글자씩 출력되기 때문에 중간에 클릭하면 바로 끝까지 보여야 합니다.' },
      { cmd: 'say', who: 'host', text: '두 번째 대사' },
    ]),
    { charMs: 150, auto: false },
  );
  await expect(page.locator('.dlg-text .ch.on').first()).toBeAttached();
  await expect(nextMark(page)).not.toHaveClass(/\bon\b/);

  await stage(page).click();
  await expect(page.locator('.dlg-text .ch:not(.on)')).toHaveCount(0);
  await typed(page);

  await stage(page).click();
  await expect(text(page)).toHaveText('두 번째 대사');
});

test('Space 키로도 대사를 진행할 수 있다', async ({ page }) => {
  await start(
    page,
    fixture([
      { cmd: 'say', who: 'host', text: '하나' },
      { cmd: 'say', who: 'host', text: '둘' },
    ]),
  );
  await typed(page);
  await page.keyboard.press('Space');
  await expect(text(page)).toHaveText('둘');
});

test('자동 진행 모드에서는 입력 없이 다음 대사로 넘어간다', async ({ page }) => {
  await start(
    page,
    fixture([
      { cmd: 'say', who: 'host', text: '자동 하나' },
      { cmd: 'say', who: 'host', text: '자동 둘' },
    ]),
    { charMs: 10, auto: true, autoDelay: 400 },
  );
  await expect(text(page)).toHaveText('자동 둘', { timeout: 5000 });
});

test('인라인 태그: 색상이 적용되고 태그 문자는 출력되지 않는다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '어째서 {red}그걸{/red} 알고 있죠?' }]));
  await typed(page);
  await expect(text(page)).toHaveText('어째서 그걸 알고 있죠?');
  const red = page.locator('.dlg-text .ch', { hasText: '그' }).first();
  await expect(red).toHaveCSS('color', 'rgb(255, 93, 93)');
});

/* ------------------------------------------------------------------ */
/* DLG-03 긴 대사 페이지 분할                                            */
/* ------------------------------------------------------------------ */

test('3줄을 넘는 대사는 페이지로 나뉘고, 각 페이지는 3줄 이하로 표시된다', async ({ page }) => {
  const long =
    '오늘은 정말 긴 이야기를 해 볼게. 어제 아침에 일어나서 창문을 열었더니 바깥에 눈이 엄청나게 쌓여 있었어. ' +
    '그래서 부랴부랴 옷을 챙겨 입고 나갔는데, 골목 끝에서 누군가 커다란 눈사람을 만들고 있더라고. ' +
    '가까이 가 보니까 우리 매니저였어! 매니저는 눈사람 머리 위에 내 딸기 케이크 상자를 올려놓고 있었지. ' +
    '그 순간 모든 퍼즐이 맞춰지는 느낌이었어. 사라진 케이크의 행방이 드디어 밝혀진 거야.';
  await start(
    page,
    fixture([
      { cmd: 'say', who: 'host', text: long },
      { cmd: 'say', who: 'host', text: '끝' },
    ]),
    { charMs: 0, auto: false },
  );

  const dlg = page.locator('#dialogue');
  await typed(page);
  const first = await dlg.getAttribute('data-page');
  expect(first).toMatch(/^1\/\d+$/);
  const total = Number(first!.split('/')[1]);
  expect(total).toBeGreaterThanOrEqual(2);

  /** 현재 보이는 글자들의 줄 수 */
  const visibleLines = () =>
    page.evaluate(() => {
      const tops = new Set<number>();
      document.querySelectorAll<HTMLElement>('.dlg-text .ch:not(.off-page)').forEach((c) => tops.add(c.offsetTop));
      return tops.size;
    });

  const shown: string[] = [];
  for (let p = 1; p <= total; p++) {
    await expect(dlg).toHaveAttribute('data-page', `${p}/${total}`);
    expect(await visibleLines()).toBeLessThanOrEqual(3);
    shown.push(
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('.dlg-text .ch:not(.off-page)'))
          .map((c) => c.textContent)
          .join(''),
      ),
    );
    await stage(page).click();
  }
  // 모든 페이지를 이어 붙이면 원문과 같다 (글자 유실 없음)
  expect(shown.join('')).toBe(long);
  await expect(text(page)).toHaveText('끝');
});

test('자막 크기를 키우면 페이지 수가 늘어날 수 있지만 3줄 제한은 유지된다', async ({ page }) => {
  const long = '가나다라마바사 '.repeat(40).trim();
  await start(page, fixture([{ cmd: 'say', who: 'host', text: long }]), {
    charMs: 0,
    auto: false,
    subSize: 1.15,
  });
  await typed(page);
  const lines = await page.evaluate(() => {
    const tops = new Set<number>();
    document.querySelectorAll<HTMLElement>('.dlg-text .ch:not(.off-page)').forEach((c) => tops.add(c.offsetTop));
    return tops.size;
  });
  expect(lines).toBeLessThanOrEqual(3);
  // 보이는 글자가 대사창 안에 들어간다
  const box = await page.locator('#dialogue').boundingBox();
  const last = await page.locator('.dlg-text .ch:not(.off-page)').last().boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(box!.y + box!.height);
});

/* ------------------------------------------------------------------ */
/* 채팅                                                                */
/* ------------------------------------------------------------------ */

test('채팅 키워드 트리거가 label 블록을 호출한다', async ({ page }) => {
  await start(
    page,
    fixture(
      [
        { cmd: 'say', who: 'host', text: '본편 대사' },
        { cmd: 'say', who: 'host', text: '본편 다음 대사' },
        { cmd: 'end' },
        { cmd: 'label', name: 'greet' },
        { cmd: 'say', who: 'host', text: '$user님 안녕!' },
        { cmd: 'return' },
      ],
      { triggers: [{ keyword: '안녕', call: 'greet' }] },
    ),
  );
  await typed(page);
  await page.locator('#chat-input').fill('하루 안녕하세요');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-list')).toContainText('하루 안녕하세요');

  await stage(page).click();
  await expect(text(page)).toHaveText('시청자(나)님 안녕!');
  await typed(page);
  await stage(page).click();
  // 서브루틴이 끝나면 본편으로 복귀
  await expect(text(page)).toHaveText('본편 다음 대사');
});

test('채팅 입력은 HTML로 해석되지 않는다 (XSS 방지)', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '대기' }]));
  const payload = '<img src=x onerror="window.__xss=1">';
  await page.locator('#chat-input').fill(payload);
  await page.locator('#chat-input').press('Enter');
  const mine = page.locator('.msg', { has: page.locator('.badge-me') }).last();
  await expect(mine).toContainText(payload);
  await expect(mine.locator('img')).toHaveCount(0);
  // 봇 채팅의 이모티콘(img.emote) 외에는 어떤 이미지도 생기지 않는다
  await expect(page.locator('#chat-list img:not(.emote)')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
});

test('스크립트 chat 명령의 후원은 채팅과 화면 알림에 모두 표시된다', async ({ page }) => {
  await start(
    page,
    fixture([
      { cmd: 'chat', user: '후원자', text: '응원해요', donation: 5000 },
      { cmd: 'say', who: 'host', text: '고마워!' },
    ]),
  );
  await expect(page.locator('.msg.donation')).toContainText('5,000코인');
  await expect(page.locator('.alert-card')).toContainText('후원자');
});

/* ------------------------------------------------------------------ */
/* 종료 / 운영 패널 / 설정                                               */
/* ------------------------------------------------------------------ */

test('스크립트가 끝나면 방송 종료 화면이 표시된다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '오늘은 여기까지' }, { cmd: 'end' }]));
  await typed(page);
  await stage(page).click();
  await expect(page.locator('#screen-msg')).toHaveText('방송이 종료되었습니다');
  await expect(page.locator('#screen-msg')).toHaveClass(/\bon\b/);
  await expect(page.locator('#chat-list')).toContainText('방송이 종료되었습니다.');
});

test('운영 패널 즉석 대사가 다음 대사 앞에 끼워진다', async ({ page }) => {
  await start(
    page,
    fixture([
      { cmd: 'say', who: 'host', text: '본편 하나' },
      { cmd: 'say', who: 'host', text: '본편 둘' },
    ]),
  );
  await typed(page);
  await page.locator('#admin-btn').click();
  await page.locator('#adm-text').fill('즉석 대사입니다');
  await page.locator('#adm-say button[type=submit]').click();
  await page.locator('#admin-close').click();

  await stage(page).click();
  await expect(text(page)).toHaveText('즉석 대사입니다');
  await typed(page);
  await stage(page).click();
  await expect(text(page)).toHaveText('본편 둘');
});

test('일시정지 중에는 자동 진행이 멈춘다', async ({ page }) => {
  await start(
    page,
    fixture([
      { cmd: 'say', who: 'host', text: '멈춤 테스트' },
      { cmd: 'say', who: 'host', text: '넘어감' },
    ]),
    { charMs: 10, auto: true, autoDelay: 400 },
  );
  await typed(page);
  await page.keyboard.press('p');
  await page.waitForTimeout(1500);
  await expect(text(page)).toHaveText('멈춤 테스트');
  await page.keyboard.press('p');
  await expect(text(page)).toHaveText('넘어감', { timeout: 5000 });
});

test('설정은 새로고침 후에도 유지된다', async ({ page }) => {
  await open(page, fixture([{ cmd: 'say', who: 'host', text: '설정' }]));
  await page.locator('#start-overlay').click();
  await page.locator('#btn-settings').click();
  await page.locator('#set-speed').selectOption('20');
  await page.reload();
  await page.locator('#start-overlay').click();
  await page.locator('#btn-settings').click();
  await expect(page.locator('#set-speed')).toHaveValue('20');
});

test('자막 끄기(C)를 누르면 대사창이 숨겨진다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '자막' }]));
  await typed(page);
  await page.keyboard.press('c');
  await expect(page.locator('#dialogue')).toBeHidden();
  await page.keyboard.press('c');
  await expect(page.locator('#dialogue')).toBeVisible();
});

/* ------------------------------------------------------------------ */
/* 접근성 / 반응형                                                       */
/* ------------------------------------------------------------------ */

test('움직임 줄이기 설정에서는 대사가 즉시 출력되고 흔들림이 없다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(
    page,
    fixture([
      { cmd: 'effect', type: 'shake' },
      { cmd: 'say', who: 'host', text: '이 문장은 느린 속도여도 바로 다 보여야 합니다.' },
    ]),
    { charMs: 500, auto: false },
  );
  await expect(page.locator('.dlg-text .ch:not(.on)')).toHaveCount(0, { timeout: 1500 });
  await expect(page.locator('#stage')).not.toHaveClass(/shake/);
});

test('스크린리더용 aria-live 영역에 문장 전체가 들어간다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '{red}접근성{/red} 테스트' }]));
  await expect(page.locator('#dlg-live')).toHaveText('하루: 접근성 테스트');
});

test.describe('모바일', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('플레이어와 채팅 입력창이 한 화면에 보이고 가로 스크롤이 없다', async ({ page }) => {
    await start(page, fixture([{ cmd: 'say', who: 'host', text: '모바일' }]));
    const player = await page.locator('#stage-wrap').boundingBox();
    const input = await page.locator('#chat-input').boundingBox();
    expect(player!.y).toBeLessThan(100);
    expect(input!.y + input!.height).toBeLessThanOrEqual(844);
    await expect(page.locator('#sidebar')).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 방송 연출 보강: 컨트롤 바, 배너/알림, 공지, 이모티콘, 시선              */
/* ------------------------------------------------------------------ */

test('컨트롤 바가 보일 때 대사창이 올라가서 자막이 가려지지 않는다', async ({ page }) => {
  const long = '컨트롤 바에 가려지면 안 되는 세 줄짜리 긴 대사입니다. '.repeat(4);
  await start(page, fixture([{ cmd: 'say', who: 'host', text: long }]), { charMs: 0, auto: false });
  await typed(page);
  const r = (await stage(page).boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 3);
  await expect(page.locator('#player')).not.toHaveClass(/\bidle\b/);
  await page.waitForTimeout(400); // 올라가는 애니메이션
  const lastChar = (await page.locator('.dlg-text .ch:not(.off-page)').last().boundingBox())!;
  const ctlButton = (await page.locator('#btn-play').boundingBox())!;
  expect(lastChar.y + lastChar.height).toBeLessThanOrEqual(ctlButton.y);
});

test('팔로우 버튼 → 화면 알림 + 이벤트 트리거로 감사 대사', async ({ page }) => {
  await start(
    page,
    fixture(
      [
        { cmd: 'say', who: 'host', text: '본편' },
        { cmd: 'say', who: 'host', text: '본편 끝' },
        { cmd: 'end' },
        { cmd: 'label', name: 'thanks' },
        { cmd: 'say', who: 'host', text: '$user님 팔로우 고마워!' },
        { cmd: 'return' },
      ],
      { triggers: [{ event: 'follow', call: 'thanks' }] },
    ),
  );
  await typed(page);
  await page.locator('#btn-follow').click();
  await expect(page.locator('#btn-follow')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.alert-follow')).toContainText('팔로우했어요');
  await expect(page.locator('#chat-list')).toContainText('시청자(나) 님이 팔로우했습니다.');
  await stage(page).click();
  await expect(text(page)).toHaveText('시청자(나)님 팔로우 고마워!');
});

test('구독 버튼 → 구독 알림, 상태가 유지된다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '대기' }]));
  await page.locator('#btn-sub').click();
  await expect(page.locator('.alert-subscribe')).toBeVisible();
  await expect(page.locator('#btn-sub')).toHaveText('♛ 구독 중');
  await page.reload();
  await expect(page.locator('#btn-sub')).toHaveText('♛ 구독 중');
});

test('banner 명령으로 방송 제목 배너가 나온다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'banner' }, { cmd: 'say', who: 'host', text: '대기' }]));
  const banner = page.locator('#banner');
  await expect(banner).toHaveClass(/\bon\b/);
  await expect(banner.locator('.banner-title')).toHaveText('테스트 방송');
  await expect(banner.locator('.banner-sub')).toHaveText('테스터');
});

test('고정 공지: 초기값 표시, 닫기, 운영 패널에서 변경/내리기, notice 명령', async ({ page }) => {
  await start(
    page,
    fixture(
      [
        { cmd: 'say', who: 'host', text: '하나' },
        { cmd: 'notice', text: '스크립트 공지' },
        { cmd: 'say', who: 'host', text: '둘' },
      ],
      { meta: { title: '테스트 방송', channel: '테스터', notice: '{green}안녕{/green}을 쳐 보세요' } },
    ),
  );
  const notice = page.locator('#chat-notice');
  await expect(notice).toBeVisible();
  await expect(notice.locator('.notice-text')).toHaveText('안녕을 쳐 보세요');
  await expect(notice.locator('.notice-text span').first()).toHaveCSS('color', 'rgb(95, 227, 154)');

  await notice.locator('.notice-close').click();
  await expect(notice).toBeHidden();

  await page.locator('#admin-btn').click();
  await page.locator('#adm-notice-text').fill('운영자 공지 <b>태그</b>');
  await page.locator('#adm-notice button[type=submit]').click();
  await expect(notice).toBeVisible();
  await expect(notice.locator('.notice-text')).toHaveText('운영자 공지 <b>태그</b>');
  await expect(notice.locator('b')).toHaveCount(0);
  await page.locator('#adm-notice-clear').click();
  await expect(notice).toBeHidden();
  await page.locator('#admin-close').click();

  await typed(page);
  await stage(page).click();
  await expect(notice.locator('.notice-text')).toHaveText('스크립트 공지');
});

test('이모티콘: 선택창에서 넣으면 코드가 입력되고, 채팅에 이미지로 표시된다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '대기' }]));
  await page.locator('#emote-btn').click();
  await expect(page.locator('#emote-picker')).toBeVisible();
  await page.locator('#emote-picker button[title="하트"]').click();
  await expect(page.locator('#chat-input')).toHaveValue(':하트: ');
  await page.locator('#chat-input').press('Enter');

  const mine = page.locator('.msg', { has: page.locator('.badge-me') }).last();
  await expect(mine.locator('img.emote')).toHaveAttribute('alt', ':하트:');
  await expect(mine.locator('img.emote')).toHaveClass(/big/); // 이모티콘만 있으면 크게

  await page.locator('#chat-input').fill('없는 :코드: 는 글자로');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('.msg').last()).toContainText('없는 :코드: 는 글자로');
});

test('캐릭터 시선이 마우스를 따라간다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '어디 보고 있어?' }]));
  await expect(page.locator('.char')).toHaveCount(1);
  const iris = page.locator('.char .iris').first();
  const r = (await stage(page).boundingBox())!;
  await page.mouse.move(r.x + 5, r.y + r.height / 3);
  await expect.poll(() => iris.evaluate((e) => (e as SVGElement).style.transform)).toMatch(/translate\(-/);
  await page.mouse.move(r.x + r.width - 5, r.y + r.height / 3);
  await expect.poll(() => iris.evaluate((e) => (e as SVGElement).style.transform)).toMatch(/translate\(\d/);
});

/* ------------------------------------------------------------------ */
/* 시청자 투표 (DLG-14)                                                 */
/* ------------------------------------------------------------------ */

/**
 * 봇은 weight 비율로 투표한다. 테스트에서는 weight 로 승자를 고정한다.
 *  A(weight 0) / B(weight 1) → 봇은 전부 B 에 투표
 */
const voteScript = (seconds = 30, weights: [number, number] = [0, 1]) =>
  fixture([
    { cmd: 'say', who: 'host', text: '투표 시작!' },
    {
      cmd: 'vote',
      question: '어느 쪽?',
      seconds,
      options: [
        { text: 'A안', jump: 'a', weight: weights[0] },
        { text: 'B안', jump: 'b', weight: weights[1] },
      ],
    },
    { cmd: 'label', name: 'a' },
    { cmd: 'say', who: 'host', text: 'A 승리 $winnerPct%' },
    { cmd: 'end' },
    { cmd: 'label', name: 'b' },
    { cmd: 'say', who: 'host', text: '$winner 승리' },
    { cmd: 'end' },
  ]);

async function openVote(page: Page, seconds?: number, weights?: [number, number]) {
  await start(page, voteScript(seconds, weights));
  await typed(page);
  await stage(page).click();
  await expect(page.locator('#vote')).toHaveClass(/\bon\b/);
}

const optRow = (page: Page, n: number) => page.locator(`#vote .vote-opt:nth-child(${n})`);

test('투표: 선택지 클릭 → 내 선택 표시, 마감 → 승자 강조 후 해당 label 로 분기', async ({ page }) => {
  await openVote(page);
  await expect(page.locator('#vote .vote-q')).toHaveText('어느 쪽?');
  await expect(page.locator('#chat-list')).toContainText('[투표] 어느 쪽?');

  await optRow(page, 1).locator('.vote-btn').click();
  await expect(optRow(page, 1)).toHaveClass(/\bmine\b/);
  // 클릭이 대사 진행으로 새지 않는다
  await expect(text(page)).toHaveText('투표 시작!');
  // 봇은 B 에만 투표
  await expect.poll(async () => Number((await optRow(page, 2).locator('.vote-cnt').textContent())!.replace('표', ''))).toBeGreaterThan(1);

  await page.locator('#admin-btn').click();
  await page.locator('#adm-vote-close').click();
  await page.locator('#admin-close').click();
  await expect(page.locator('#vote')).toHaveClass(/\bdone\b/);
  await expect(optRow(page, 2)).toHaveClass(/\bwin\b/);
  await expect(page.locator('#chat-list')).toContainText('[투표 결과] B안');

  await expect(text(page)).toHaveText('B안 승리', { timeout: 6000 });
  await expect(page.locator('#vote')).toBeHidden();
});

test('투표: 채팅 번호로 한 번만 투표되고, 번호 채팅은 키워드 트리거를 일으키지 않는다', async ({ page }) => {
  await openVote(page, 30, [0, 0]); // 봇 투표 없음
  await page.locator('#chat-input').fill('!1');
  await page.locator('#chat-input').press('Enter');
  await expect(optRow(page, 1).locator('.vote-cnt')).toHaveText('1표');
  await expect(optRow(page, 1)).toHaveClass(/\bmine\b/);

  await page.locator('#chat-input').fill('2');
  await page.locator('#chat-input').press('Enter');
  await expect(optRow(page, 2).locator('.vote-cnt')).toHaveText('0표');
  await expect(optRow(page, 1).locator('.vote-pct')).toHaveText('100%');

  // 범위를 벗어난 번호는 일반 채팅
  await page.locator('#chat-input').fill('3');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('.msg').last()).toContainText('3');
  await expect(optRow(page, 1).locator('.vote-cnt')).toHaveText('1표');
});

test('투표: 숫자 키로 투표할 수 있다', async ({ page }) => {
  await openVote(page, 30, [0, 0]);
  await page.keyboard.press('2');
  await expect(optRow(page, 2)).toHaveClass(/\bmine\b/);
  await expect(optRow(page, 2).locator('.vote-cnt')).toHaveText('1표');
});

test('투표: 시간이 끝나면 자동 마감되고, 일시정지 중에는 타이머가 멈춘다', async ({ page }) => {
  await openVote(page, 2, [1, 0]); // 봇은 A 에 투표
  await page.keyboard.press('p');
  await page.waitForTimeout(2600);
  await expect(page.locator('#vote')).not.toHaveClass(/\bdone\b/);
  await page.keyboard.press('p');
  await expect(page.locator('#vote')).toHaveClass(/\bdone\b/, { timeout: 4000 });
  await expect(text(page)).toHaveText(/^A 승리 \d+%$/, { timeout: 6000 });
});

test('투표 중 처음부터 다시 시작하면 투표가 취소된다', async ({ page }) => {
  await openVote(page);
  await page.locator('#admin-btn').click();
  await page.locator('#adm-restart').click();
  await expect(page.locator('#vote')).toBeHidden();
  await expect(text(page)).toHaveText('투표 시작!');
  await expect(page.locator('#chat-list')).not.toContainText('[투표 결과]');
});
