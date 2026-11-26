# Live Talk

라이브 스트리밍 방송 화면처럼 꾸민 웹페이지입니다. 메인 플레이어에서 캐릭터가 버튜버처럼 방송하고, 대사는 비주얼 노벨식 대사창(자막)으로 출력됩니다.
요구사항은 [REQUIREMENT.KO.md](REQUIREMENT.KO.md)를 참고하세요.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 단위 테스트 (대사 태그 파서, 페이지 분할, 채팅 필터)
npm run test:e2e   # E2E 테스트 (Playwright, 브라우저에서 실제 방송 흐름 검증)
npm run build      # dist/ 정적 빌드
```

E2E 테스트를 처음 실행할 때는 브라우저와 시스템 라이브러리가 필요합니다.

```bash
npx playwright install chromium
sudo npx playwright install-deps chromium   # Linux/WSL: libasound2 등 시스템 라이브러리
```

## URL 옵션

| 옵션 | 설명 |
|---|---|
| `?admin` | 운영 패널을 연 상태로 시작 |
| `?script=이름` | `public/scripts/이름.json` 스크립트 로드 (기본 `demo`) |

## 조작

| 키 | 동작 |
|---|---|
| 클릭 / Space / Enter | 출력 중이면 전체 표시, 끝났으면 다음 대사 |
| P 또는 K | 일시정지 / 재생 |
| M | 음소거 |
| C | 자막 켜기/끄기 |
| F | 전체화면 |
| ` (백틱) | 운영 패널 열기/닫기 |

## 스크립트 작성

`public/scripts/*.json` — 예시는 [demo.json](public/scripts/demo.json).

- 명령: `say`, `expr`, `show`, `hide`, `bg`, `effect`(shake/flash/cutin), `sfx`(hit/flash/chime/pop/whoosh), `bgm`, `chat`, `wait`, `label`, `jump`, `call`, `return`, `end`
- 대사 태그: `{red}..{/red}` `{blue}` `{green}` `{yellow}` `{color:#hex}` `{b}` `{shake}` `{wait:ms}` `{speed:배율}`, 리터럴 `{`는 `{{`
- 표정: `normal`, `smile`, `angry`, `surprised`, `thinking`, `point`, `sad`
- 배경 프리셋: `studio`, `night`, `cafe` (또는 이미지 경로)
- `triggers`: 시청자 채팅에 키워드가 있으면 해당 `label` 블록을 호출 (`$user` = 채팅 작성자)
- `say.reactions`: 대사에 맞춰 가상 시청자들이 칠 채팅 목록
- 대사가 대사창 3줄을 넘으면 자동으로 페이지가 나뉩니다. 클릭하거나 자동 진행 시 다음 페이지로 넘어갑니다.

### 캐릭터 이미지 교체

현재는 코드로 그린 임시 캐릭터를 씁니다. 표정별 이미지를 넣으려면 캐릭터 정의에 `sprites`를 추가하세요 (입 닫힘, 입 열림 순서).

```json
"host": {
  "name": "하루",
  "sprites": {
    "normal": ["/chars/haru_normal_0.png", "/chars/haru_normal_1.png"],
    "smile":  ["/chars/haru_smile_0.png",  "/chars/haru_smile_1.png"]
  }
}
```
