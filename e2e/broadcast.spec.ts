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

/* ------------------------------------------------------------------ */
/* AI 자유 대화 (SCR-06) — /api 는 가짜 응답으로 대체 (실제 모델 호출 없음)  */
/* ------------------------------------------------------------------ */

const AUTO = { charMs: 0, auto: true, autoDelay: 300 };

const freetalkScript = (seconds = 30) =>
  fixture(
    [
      { cmd: 'freetalk', seconds },
      { cmd: 'say', who: 'host', text: '자유 대화 끝' },
      { cmd: 'end' },
      { cmd: 'label', name: 'greet' },
      { cmd: 'say', who: 'host', text: '스크립트 인사' },
      { cmd: 'return' },
    ],
    {
      triggers: [{ keyword: '안녕', call: 'greet' }],
      ai: { persona: '테스트 캐릭터', fallback: ['준비된 대사'], idle: [] },
    },
  );

type ReplyBody = { script: string; who: string; chat: { user: string; text: string }; history: unknown[]; context: string[] };

/** /api 가짜 응답. reply 는 받은 채팅을 그대로 되돌려준다. */
async function mockAi(page: Page, opts: { healthy?: boolean; fail?: boolean; delay?: number } = {}) {
  const bodies: ReplyBody[] = [];
  await page.route('**/api/health', (r) =>
    r.fulfill({
      status: opts.healthy === false ? 503 : 200,
      json: { ok: opts.healthy !== false, provider: 'mock', model: 'mock-model' },
    }),
  );
  await page.route('**/api/reply', async (r) => {
    const body = r.request().postDataJSON() as ReplyBody;
    bodies.push(body);
    if (opts.delay) await new Promise((res) => setTimeout(res, opts.delay));
    if (opts.fail) return r.fulfill({ status: 502, json: { error: 'LLM down' } });
    return r.fulfill({ json: { expr: 'surprised', text: `대답: ${body.chat.text}` } });
  });
  return bodies;
}

test('자유 대화: 내 채팅이 우선 선택되고, 채팅 표시 → AI 대답 → 표시 해제', async ({ page }) => {
  const bodies = await mockAi(page, { delay: 400 });
  await start(page, freetalkScript(), AUTO);
  await expect(page.locator('#chat-list')).toContainText('자유 대화 시작');

  await page.locator('#chat-input').fill('하루 안녕? 오늘 기분 어때');
  await page.locator('#chat-input').press('Enter');

  const quote = page.locator('#chat-quote');
  await expect(quote).toHaveClass(/\bon\b/);
  await expect(quote).toContainText('하루 안녕? 오늘 기분 어때', { timeout: 10_000 });
  await expect(text(page)).toHaveText('대답: 하루 안녕? 오늘 기분 어때', { timeout: 10_000 });

  const mine = bodies.find((b) => b.chat.text === '하루 안녕? 오늘 기분 어때')!;
  expect(mine.script).toBe('demo');
  expect(mine.who).toBe('host');
  expect(mine.chat.user).toBe('시청자(나)');
  // 자유 대화 중에는 '안녕' 키워드 스크립트 반응이 끼어들지 않는다
  await expect(page.locator('.dlg-text')).not.toHaveText('스크립트 인사');
});

test('자유 대화: AI 서버 오류 시 준비된 대사로 대신한다', async ({ page }) => {
  await mockAi(page, { fail: true });
  await start(page, freetalkScript(), AUTO);
  await page.locator('#chat-input').fill('질문 있어요?');
  await page.locator('#chat-input').press('Enter');
  await expect(text(page)).toHaveText('준비된 대사', { timeout: 10_000 });
});

test('자유 대화: AI 서버가 없으면 건너뛰고 스크립트를 계속한다', async ({ page }) => {
  await mockAi(page, { healthy: false });
  await start(page, freetalkScript(), AUTO);
  await expect(page.locator('#chat-list')).toContainText('AI 서버에 연결되지 않아 자유 대화를 건너뜁니다');
  await expect(text(page)).toHaveText('자유 대화 끝');
});

test('자유 대화: 시간이 끝나거나 운영 패널에서 끝내면 다음 스크립트로 넘어간다', async ({ page }) => {
  await mockAi(page);
  await start(page, freetalkScript(300), AUTO);
  await expect(page.locator('#chat-list')).toContainText('자유 대화 시작');
  await page.locator('#admin-btn').click();
  await expect(page.locator('#adm-ai-status')).toHaveText('연결됨 · mock · mock-model');
  await page.locator('#adm-ai-stop').click();
  await expect(text(page)).toHaveText('자유 대화 끝', { timeout: 10_000 });
});

test('자유 대화: 정해진 시간이 지나면 스스로 끝난다', async ({ page }) => {
  await mockAi(page);
  await start(page, freetalkScript(2), AUTO);
  await expect(page.locator('#chat-list')).toContainText('자유 대화 시작 (2초)');
  await expect(text(page)).toHaveText('자유 대화 끝', { timeout: 8_000 });
});

test('자유 대화: 운영 패널에서 시작할 수 있다', async ({ page }) => {
  await mockAi(page);
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '본편' }], { ai: { persona: 'x', fallback: ['f'] } }), AUTO);
  await page.locator('#admin-btn').click();
  await page.locator('#adm-ai-start').click();
  await page.locator('#admin-close').click();
  await expect(page.locator('#chat-list')).toContainText('자유 대화 시작 (60초)', { timeout: 10_000 });
  await page.locator('#chat-input').fill('운영 패널로 시작했어?');
  await page.locator('#chat-input').press('Enter');
  await expect(text(page)).toHaveText('대답: 운영 패널로 시작했어?', { timeout: 10_000 });
});

/* ------------------------------------------------------------------ */
/* 정리 묶음: AI 대기 화면, 채팅 설정(CHT-08), 채널 소개(INF-05), 방송 정보 편집(ADM-04) */
/* ------------------------------------------------------------------ */

test('자유 대화: 대답을 기다리는 동안 대사창에 생각 중 표시', async ({ page }) => {
  await mockAi(page, { delay: 2500 });
  await start(page, freetalkScript(), AUTO);
  await page.locator('#chat-input').fill('기다리는 중 확인?');
  await page.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-quote')).toContainText('기다리는 중 확인?', { timeout: 10_000 });
  await expect(page.locator('.dlg-text .thinking-dots')).toBeVisible();
  await expect(page.locator('.nameplate')).toHaveText('하루');
  await expect(text(page)).toHaveText('대답: 기다리는 중 확인?', { timeout: 10_000 });
  await expect(page.locator('.dlg-text .thinking-dots')).toHaveCount(0);
});

test('채팅 설정: 글자 크기와 시간 표시가 적용되고 새로고침 후에도 유지된다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '대기' }]));
  await page.locator('#chat-input').fill('시간 표시 테스트');
  await page.locator('#chat-input').press('Enter');
  const mine = page.locator('.msg', { has: page.locator('.badge-me') }).last();
  await expect(mine.locator('.msg-time')).toBeHidden();

  await page.locator('#chat-settings-btn').click();
  await page.locator('#chat-settings [data-font="lg"]').click();
  await page.locator('#chat-time').check();
  await expect(page.locator('#chat')).toHaveAttribute('data-font', 'lg');
  await expect(mine.locator('.msg-time')).toBeVisible();
  await expect(mine.locator('.msg-time')).toHaveText(/^\d{2}:\d{2}$/);
  await expect(page.locator('#chat-list')).toHaveCSS('font-size', '16.5px');

  await page.reload();
  await expect(page.locator('#chat')).toHaveAttribute('data-font', 'lg');
  await page.locator('#chat-settings-btn').click();
  await expect(page.locator('#chat-time')).toBeChecked();
  await expect(page.locator('#chat-settings [data-font="lg"]')).toHaveAttribute('aria-pressed', 'true');
});

test('채팅 새 창: 지난 채팅과 새 채팅이 보이고, 새 창에서 보낸 채팅이 방송에 반영된다', async ({ page, context }) => {
  await start(
    page,
    fixture(
      [
        { cmd: 'say', who: 'host', text: '본편' },
        { cmd: 'end' },
        { cmd: 'label', name: 'greet' },
        { cmd: 'say', who: 'host', text: '새 창에서도 안녕!' },
        { cmd: 'return' },
      ],
      { triggers: [{ keyword: '안녕', call: 'greet' }], meta: { title: 't', channel: 'c', notice: '공지 테스트' } },
    ),
  );
  await page.locator('#chat-input').fill('새 창 열기 전 채팅');
  await page.locator('#chat-input').press('Enter');

  await page.locator('#chat-settings-btn').click();
  const [popup] = await Promise.all([context.waitForEvent('page'), page.locator('#chat-popout').click()]);
  await popup.waitForLoadState();
  await expect(popup).toHaveTitle('채팅 | Live Talk');
  await expect(popup.locator('.gnb')).toBeHidden();
  // 지난 채팅과 공지
  await expect(popup.locator('#chat-list')).toContainText('새 창 열기 전 채팅');
  await expect(popup.locator('#chat-notice')).toContainText('공지 테스트');
  // 방송 창의 채팅은 접힌다
  await expect(page.locator('body')).toHaveClass(/chat-off/);

  // 새 창에서 보낸 채팅 → 방송 창에서 처리(키워드 반응) → 새 창에도 표시
  await popup.locator('#chat-input').fill('하루 안녕');
  await popup.locator('#chat-input').press('Enter');
  await expect(page.locator('#chat-list')).toContainText('하루 안녕');
  await expect(popup.locator('.msg', { has: popup.locator('.badge-me') }).last()).toContainText('하루 안녕');
  await typed(page);
  await stage(page).click();
  await expect(text(page)).toHaveText('새 창에서도 안녕!');

  // 새 창을 닫으면 방송 창 채팅이 다시 펼쳐진다
  await popup.close();
  await expect(page.locator('body')).not.toHaveClass(/chat-off/);
});

test('채널 소개: 접힌 상태에서 더보기로 일정과 링크를 펼친다', async ({ page }) => {
  await start(
    page,
    fixture([{ cmd: 'say', who: 'host', text: '대기' }], {
      meta: {
        title: 't',
        channel: 'c',
        about: {
          intro: '채널 소개 문구입니다.',
          schedule: ['월 9시'],
          links: [
            { label: '공식 링크', url: 'https://example.com/' },
            { label: '위험 링크', url: 'javascript:alert(1)' },
          ],
        },
      },
    }),
  );
  const about = page.locator('#about');
  await expect(about).toBeVisible();
  await expect(about.locator('.about-intro')).toHaveText('채널 소개 문구입니다.');
  await expect(about.locator('.about-schedule')).toBeHidden();
  await about.locator('.about-toggle').click();
  await expect(about.locator('.about-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(about.locator('.about-schedule')).toContainText('월 9시');
  await expect(about.locator('a')).toHaveCount(1);
  await expect(about.locator('a')).toHaveAttribute('href', 'https://example.com/');
  await expect(about.locator('a')).toHaveAttribute('rel', 'noopener noreferrer');
});

test('채널 소개가 없으면 영역이 숨겨진다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '대기' }]));
  await expect(page.locator('#about')).toBeHidden();
});

test('운영 패널: 방송 정보를 바꾸면 제목·카테고리·태그·배너에 반영된다', async ({ page }) => {
  await start(page, fixture([{ cmd: 'say', who: 'host', text: '대기' }]));
  await page.locator('#admin-btn').click();
  await expect(page.locator('#adm-meta-title')).toHaveValue('테스트 방송');
  await page.locator('#adm-meta-title').fill('바뀐 제목');
  await page.locator('#adm-meta-cat').fill('게임');
  await page.locator('#adm-meta-tags').fill('하나, 둘, 하나');
  await page.locator('#adm-meta button[type=submit]').click();

  await expect(page.locator('#stream-title')).toHaveText('바뀐 제목');
  await expect(page.locator('#ch-cat')).toHaveText('게임');
  await expect(page.locator('#ch-tags .tag')).toHaveText(['하나', '둘']);
  await expect(page).toHaveTitle('테스터 - 바뀐 제목 | Live Talk');
  await expect(page.locator('#chat-list')).toContainText('방송 제목이 변경되었습니다: 바뀐 제목');
  await page.locator('#adm-banner').click();
  await expect(page.locator('#banner .banner-title')).toHaveText('바뀐 제목');
});

/* ------------------------------------------------------------------ */
/* 채팅 접기/펼치기 버튼 위치                                              */
/* ------------------------------------------------------------------ */

/** 버튼 한가운데를 실제로 누를 수 있는지 (다른 요소에 가려지지 않았는지) */
const notCovered = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && (hit === el || el.contains(hit));
  }, selector);

for (const vp of [
  { name: '데스크톱', width: 1440, height: 860 },
  { name: '좁은 데스크톱', width: 1000, height: 700 },
]) {
  test(`채팅을 접어도 방송 정보 버튼이 가려지지 않고, 플레이어 컨트롤에서 다시 펼칠 수 있다 (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await start(page, fixture([{ cmd: 'say', who: 'host', text: '대기' }]));
    const openBtn = page.locator('#chat-open');
    await expect(openBtn).toBeHidden();

    await page.locator('#chat-close').click();
    await expect(page.locator('#chat')).toBeHidden();
    // 펼치기 버튼은 플레이어 컨트롤 바 안에 있다
    await expect(page.locator('#controls #chat-open')).toHaveCount(1);
    await stage(page).hover();
    await expect(openBtn).toBeVisible();

    for (const sel of ['#btn-follow', '#btn-sub']) {
      await page.locator(sel).scrollIntoViewIfNeeded();
      expect(await notCovered(page, sel), `${sel} 가 가려짐`).toBe(true);
    }

    await stage(page).hover();
    await openBtn.click();
    await expect(page.locator('#chat')).toBeVisible();
    await expect(openBtn).toBeHidden();
  });
}

/* ------------------------------------------------------------------ */
/* 캐릭터 음성 (SCR-07) + 음성 립싱크 (CHR-05) — /api/tts 는 생성한 wav 로 대체 */
/* ------------------------------------------------------------------ */

/** 테스트용 wav: 소리(사인파)와 무음이 번갈아 나오는 seconds 초짜리 16bit 모노 */
function makeWav(seconds: number, rate = 16000) {
  const n = Math.floor(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const on = Math.floor(t * 5) % 2 === 0; // 0.2초마다 소리/무음
    buf.writeInt16LE(on ? Math.round(Math.sin(2 * Math.PI * 220 * t) * 16000) : 0, 44 + i * 2);
  }
  return buf;
}

async function mockTts(page: Page, opts: { healthy?: boolean; seconds?: number } = {}) {
  const bodies: { script: string; who: string; text: string }[] = [];
  await page.route('**/api/tts/health', (r) =>
    r.fulfill({ status: opts.healthy === false ? 503 : 200, json: { ok: opts.healthy !== false, model: 'mock-tts' } }),
  );
  await page.route('**/api/tts', (r) => {
    bodies.push(r.request().postDataJSON());
    return r.fulfill({ status: 200, contentType: 'audio/wav', body: makeWav(opts.seconds ?? 1.6) });
  });
  return bodies;
}

const voiceScript = () =>
  fixture([
    { cmd: 'say', who: 'host', text: '어째서 {red}그걸{/red} {wait:500}알고 있는 거죠? 이 문장은 음성에 맞춰 출력됩니다' },
    { cmd: 'say', who: 'host', text: '두 번째 대사' },
    { cmd: 'say', text: '나레이션은 음성 없음' },
  ]);

test('캐릭터 음성: 대사를 읽고, 글자 출력이 음성 길이에 맞춰지며, 다음 대사는 미리 받아 둔다', async ({ page }) => {
  const bodies = await mockTts(page, { seconds: 1.6 });
  // 글자당 500ms 설정이면 음성 없이 약 20초 → 음성(1.6초)에 맞춰지면 2초 안팎
  await start(page, voiceScript(), { charMs: 500, auto: false });
  const t0 = Date.now();
  await typed(page);
  const elapsed = Date.now() - t0;
  expect(elapsed).toBeLessThan(5000);
  expect(elapsed).toBeGreaterThan(1200); // 음성이 끝날 때까지 기다린다

  // 서버로 보내는 문장: 대사 태그 제거, 화자 포함
  expect(bodies[0]).toEqual({ script: 'demo', who: 'host', text: '어째서 그걸 알고 있는 거죠? 이 문장은 음성에 맞춰 출력됩니다' });
  // 다음 대사를 미리 요청
  await expect.poll(() => bodies.map((b) => b.text)).toContain('두 번째 대사');

  await stage(page).click();
  await expect(text(page)).toHaveText('두 번째 대사');
  await typed(page);
  await stage(page).click();
  await expect(text(page)).toHaveText('나레이션은 음성 없음');
  // 음성이 없는 나레이션은 사용자 설정 속도(글자당 500ms)로 출력되므로 오래 걸린다
  await expect(nextMark(page)).toHaveClass(/\bon\b/, { timeout: 15_000 });
  // 화자가 없는 나레이션은 읽지 않는다
  expect(bodies.some((b) => b.text.includes('나레이션'))).toBe(false);
});

test('음성 립싱크: 소리가 나는 동안 입이 열렸다 닫힌다', async ({ page }) => {
  await mockTts(page, { seconds: 2.4 });
  await start(page, voiceScript(), { charMs: 500, auto: false });
  const mouth = page.locator('.char .mouth');
  // 소리 구간(0.2초)에는 열리고, 무음 구간에는 닫힌다
  await expect(mouth).toHaveClass(/\bopen\b/, { timeout: 5000 });
  await expect(mouth).not.toHaveClass(/\bopen\b/, { timeout: 2000 });
  await expect(mouth).toHaveClass(/\bopen\b/, { timeout: 2000 });
  await typed(page);
  await expect(mouth).not.toHaveClass(/\bopen\b/);
});

test('음성 재생 중 클릭하면 음성을 멈추고 다음으로 넘어갈 수 있다', async ({ page }) => {
  await mockTts(page, { seconds: 8 });
  await start(page, voiceScript(), { charMs: 0, auto: false });
  // 글자는 바로 다 나오지만 음성(8초)이 끝날 때까지 다음 표시가 없다
  await expect(page.locator('.dlg-text .ch:not(.on)')).toHaveCount(0);
  await expect(nextMark(page)).not.toHaveClass(/\bon\b/);
  await stage(page).click(); // 음성 멈춤
  await typed(page);
  await stage(page).click();
  await expect(text(page)).toHaveText('두 번째 대사');
});

test('캐릭터 음성을 끄거나 TTS 서버가 없으면 효과음 방식으로 진행한다', async ({ page }) => {
  const bodies = await mockTts(page);
  await start(page, voiceScript(), { charMs: 15, auto: false, voice: false });
  await typed(page);
  await expect(text(page)).toHaveText('어째서 그걸 알고 있는 거죠? 이 문장은 음성에 맞춰 출력됩니다');
  expect(bodies).toHaveLength(0);

  // 설정에서 다시 켜면 다음 대사부터 읽는다
  await page.locator('#btn-settings').click();
  await page.locator('#set-voice').check();
  await page.keyboard.press('Escape');
  await stage(page).click();
  await expect.poll(() => bodies.length).toBeGreaterThan(0);
});

test('TTS 서버가 없으면 요청하지 않고 효과음으로 진행한다', async ({ page }) => {
  const bodies = await mockTts(page, { healthy: false });
  await start(page, voiceScript(), { charMs: 15, auto: false });
  await typed(page);
  await stage(page).click();
  await expect(text(page)).toHaveText('두 번째 대사');
  expect(bodies).toHaveLength(0);
});
