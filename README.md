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

## 웹 화면 Docker 이미지 (다른 서버에 배포)

웹 화면만 nginx 이미지로 만들어 어느 서버에든 띄울 수 있습니다. `/api` 요청은 컨테이너가 `API_URL` 로 넘깁니다.
api 서버에는 CORS 가 없으므로 브라우저는 항상 웹 컨테이너의 `/api` 를 거칩니다 (api 를 다른 도메인으로 직접 부르지 않음).

```bash
docker build -f web/Dockerfile -t live-talk-web .                     # 빌드 (리포지토리 루트에서)
docker run -d -p 8080:80 -e API_URL=http://<api서버>:8787 live-talk-web # 배포 서버에서 실행
docker compose up -d --build web                                      # 이 PC 에서 api 와 함께 (http://localhost:8080)
```

- `API_URL` 끝에 `/` 를 붙이지 않습니다. api 서버에 연결할 수 없으면 화면은 정상으로 뜨고 AI 자유 대화와 음성만 꺼집니다.
- api 서버는 요청 제한(IP 당 분당 30회)에 쓸 접속자 IP 를 `TRUST_PROXY` 단수만큼 `X-Forwarded-For` 에서 읽습니다. docker compose 의 api 는 기본 `1` (웹 컨테이너 뒤). api 포트(8787)를 외부에 직접 열면 헤더 위조로 제한을 피할 수 있으므로 `TRUST_PROXY=0` 으로 두거나 포트를 닫습니다.
- 캐릭터 설정은 api 서버가 자기 쪽 `SCRIPTS_DIR` 에서 읽으므로, 웹 이미지와 api 서버의 `public/scripts` 를 같은 버전으로 맞춥니다.

## AI 자유 대화 (로컬 LLM)

스크립트의 `freetalk` 명령이나 운영 패널의 **자유 대화 시작** 버튼을 누르면, 정해진 시간 동안 캐릭터가 시청자 채팅에 AI로 대답합니다.
AI 서버가 꺼져 있으면 자유 대화만 건너뛰고 방송은 정상 진행됩니다.

```
브라우저 ──/api──▶ Vite 프록시 ──▶ api 서버 (server/, :8787) ──OpenAI 호환 API──▶ Ollama (:11434) 또는 vLLM (:8000)
```

### 실행

필요: Docker + NVIDIA Container Toolkit (GPU 사용)

```bash
npm run ai:up      # Ollama + api 서버 시작. 처음 한 번 모델(qwen3:8b, 약 5GB)을 내려받음
npm run dev        # 웹페이지 (http://localhost:5173), /api 는 api 서버로 프록시
npm run ai:logs    # api 서버 로그
npm run ai:down    # 모두 종료
```

연결 확인: `curl localhost:8787/api/health` 또는 운영 패널의 **AI 자유 대화** 상태 표시.

api 서버는 시작하면서 **모델을 GPU 에 미리 올립니다** (첫 요청이 모델 로딩 때문에 수십 초 걸리는 것을 방지). 올리는 동안 `/api/health` 는 `"warm": "loading"` 과 함께 503 을 돌려주고, 자유 대화는 건너뜁니다. 진행 상황은 `npm run ai:logs` 의 `[warmup]` 줄에서 볼 수 있습니다.

### vLLM 으로 전환

api 서버는 OpenAI 호환 API(`/v1/chat/completions`)만 쓰므로, `LLM_PROVIDER` 하나로 전환됩니다.
두 LLM은 같은 GPU를 쓰므로 먼저 내리고 전환하세요.

```bash
npm run ai:down
LLM_PROVIDER=vllm npm run ai:up     # vLLM + api 서버 (Ollama 는 뜨지 않음)
```

| 설정 (`.env` 또는 환경 변수) | Ollama 기본값 | vLLM 기본값 |
|---|---|---|
| `LLM_PROVIDER` | `ollama` | `vllm` |
| 모델 | `OLLAMA_MODEL=qwen3:8b` | `VLLM_MODEL=Qwen/Qwen3-4B-AWQ` |
| 생각 모드 끄기 (자동) | `{"reasoning_effort":"none"}` | `{"chat_template_kwargs":{"enable_thinking":false}}` |
| 개별 지정 (우선) | `LLM_BASE_URL`, `LLM_MODEL`, `LLM_EXTRA_BODY`, `LLM_TIMEOUT_MS` | 〃 |

예시는 [.env.example](.env.example). 8GB GPU에서 vLLM은 4B 압축(AWQ) 모델부터 권장합니다 (vLLM 은 GPU 메모리를 미리 확보하므로 `VLLM_GPU_MEM`, `VLLM_MAX_MODEL_LEN` 으로 조절).

Docker 없이 api 서버만 실행할 수도 있습니다 (Node 24 이상, 의존성 없음): `npm run server`

### 스크립트 설정

```json
"ai": {
  "persona": "너는 라이브 방송 중인 버튜버 \"하루\"다. …",
  "examples": [{ "chat": "하루야 안녕!", "expr": "smile", "reply": "안녕~ 와 줘서 고마워!" }],
  "fallback": ["앗, 채팅을 놓쳤다! 다시 한번만 말해 줄래?"],
  "idle": ["채팅이 조용하네~ 다들 오늘 저녁 뭐 먹었어?"]
}
```
```json
{ "cmd": "freetalk", "seconds": 60 }
```

- 캐릭터 설정(`persona`, `examples`)은 브라우저가 보내지 않고 **서버가 스크립트 파일에서 직접 읽습니다.**
- 모든 채팅에 답하지 않고 하나씩 고릅니다. 우선순위: 내 채팅 > 후원 > 팔로우/구독 > 이름 부르기·질문 > 일반. `ㅋㅋㅋ`, 투표 번호, 이모티콘만 있는 채팅, 20초 지난 채팅은 건너뜁니다.
- 대답을 기다리는 동안 캐릭터는 고민하는 표정이고, 대사창 위에 지금 답하는 채팅이 표시됩니다.
- AI 응답 실패 시 `fallback`, 12초 동안 채팅이 없으면 `idle` 대사를 씁니다.
- 자유 대화 중에는 키워드 반응(`triggers`)이 끼어들지 않습니다.
- 안전장치: 채팅은 데이터 블록으로만 전달(채팅 속 지시 무시 규칙), JSON 스키마로 출력 강제, 이모지·대사 태그 제거, 금칙어 마스킹, 길이 제한, IP 당 분당 요청 제한.

## 캐릭터 음성 (로컬 TTS)

화자(`who`)가 있는 대사를 캐릭터 목소리로 읽습니다 (SCR-07). 음성 볼륨에 맞춰 입이 움직입니다 (CHR-05).
TTS 서버가 없거나 설정에서 **캐릭터 음성**을 끄면 예전처럼 타이핑 효과음으로 진행합니다.
구조, 동작 규칙, 검증 결과, 알려진 제약은 [docs/tts.md](docs/tts.md) 에 정리되어 있습니다.

```
브라우저 ──/api/tts──▶ api 서버 (:8787) ──OpenAI 호환 /v1/audio/speech──▶ tts 컨테이너 (MeloTTS 한국어, CPU, :8880)
```

```bash
npm run ai:up                  # tts 도 함께 뜸 (첫 빌드는 PyTorch·모델을 받느라 몇 분 걸림)
docker compose up -d tts api   # LLM 없이 음성만 쓸 때
docker compose stop tts        # 음성 끄기 (브라우저는 효과음으로 진행)
```

연결 확인: `curl localhost:8787/api/tts/health` 또는 운영 패널의 **캐릭터 음성 (TTS)** 상태 표시. 브라우저는 15초마다 다시 확인하므로 TTS 서버가 늦게 떠도 이어서 씁니다.

- 글자 출력 속도를 음성 길이에 맞춥니다. 음성이 있는 대사에서는 `{wait}`, `{speed}` 태그와 문장부호 멈춤을 무시하고, 출력이 끝나도 음성이 끝날 때까지 기다립니다. 클릭하면 음성을 멈추고 넘어갑니다.
- 출력 속도가 **즉시**이거나 움직임 줄이기가 켜져 있으면 글자는 바로 다 보여 주고, 음성은 그대로 재생합니다.
- 다음 대사는 미리 받아 둡니다 (분기·투표·자유 대화 앞까지만). 음성이 2.5초 안에 준비되지 않으면 그 대사는 목소리 없이 진행합니다.
- 나레이션(화자 없음)은 읽지 않습니다. 일시정지하면 음성도 그 자리에서 멈춥니다.
- 캐릭터별 목소리는 스크립트에서 지정합니다 (`voice`: TTS 목소리 이름, `speed`: 0.5~2).

```json
"characters": { "host": { "name": "하루", "tts": { "voice": "KR", "speed": 1.1 } } }
```

| 설정 | 기본값 |
|---|---|
| `TTS_BASE_URL` (비우면 음성 끔) | compose: `http://tts:8880/v1`, `npm run server`: `http://localhost:8880/v1` |
| `TTS_MODEL` / `TTS_VOICE` | `melotts-kr` / `KR` |
| `TTS_TIMEOUT_MS` | `15000` |

다른 TTS 엔진으로 바꿀 때는 같은 OpenAI 호환 엔드포인트(`/v1/models`, `/v1/audio/speech`, wav 응답)를 제공하는 컨테이너로 교체하면 됩니다.

## URL 옵션

| 옵션 | 설명 |
|---|---|
| `?admin` | 운영 패널을 연 상태로 시작 |
| `?script=이름` | `public/scripts/이름.json` 스크립트 로드 (기본 `demo`) |
| `?view=chat` | 채팅만 보이는 창 (채팅 설정의 **채팅창 새 창으로 열기**가 여는 창). 방송 창과 같은 채팅을 보여 주고, 여기서 보낸 채팅은 방송 창에서 처리 |

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

- 명령: `say`, `expr`, `show`, `hide`, `bg`, `effect`(shake/flash/cutin), `sfx`(hit/flash/chime/pop/whoosh), `bgm`, `chat`, `banner`(방송 제목 배너), `notice`(채팅 고정 공지, text 생략 시 내림), `vote`(시청자 투표), `wait`, `label`, `jump`, `call`, `return`, `end`
- 대사 태그: `{red}..{/red}` `{blue}` `{green}` `{yellow}` `{color:#hex}` `{b}` `{shake}` `{wait:ms}` `{speed:배율}`, 리터럴 `{`는 `{{`
- 표정: `normal`, `smile`, `angry`, `surprised`, `thinking`, `point`, `sad`
- 배경 프리셋: `studio`, `night`, `cafe` (또는 이미지 경로)
- `triggers`: 해당 `label` 블록을 호출하는 조건
  - `keyword`: 시청자 채팅에 키워드가 있을 때 (`$user` = 채팅 작성자)
  - `event`: `follow` / `subscribe` / `donation` 이벤트가 생겼을 때 (`$user`, 후원은 `$amount`)
- `meta.notice`: 채팅 고정 공지 초기값 (대사 태그로 색상 강조 가능)
- `say.reactions`: 대사에 맞춰 가상 시청자들이 칠 채팅 목록
- 대사가 대사창 3줄을 넘으면 자동으로 페이지가 나뉩니다. 클릭하거나 자동 진행 시 다음 페이지로 넘어갑니다.

### 시청자 투표

```json
{ "cmd": "vote", "question": "케이크를 먹은 범인은?", "seconds": 15, "options": [
  { "text": "매니저", "jump": "v_manager", "weight": 3 },
  { "text": "고양이", "jump": "v_cat" }
] }
```

- 선택지 2~4개. 시청자는 채팅에 번호(`1`, `!1`, `1번`)를 치거나, 선택지를 클릭하거나, 숫자 키를 눌러 투표합니다 (1인 1표).
- 시간이 끝나거나 운영 패널에서 **투표 마감**을 누르면 최다 득표 선택지의 `jump` label 로 이동합니다 (동점이면 앞 번호).
- 이후 대사에서 `$winner`(이긴 선택지), `$winnerPct`(득표율)를 쓸 수 있습니다.
- `weight`: 가상 시청자가 그 선택지를 고를 상대적 확률 (기본 1, 0이면 봇이 고르지 않음).

### 채널 소개 / 채팅 설정 / 방송 정보 편집

- `meta.about`: 방송 정보 아래 **채널 소개** (접기/펼치기). `intro`, `schedule`(목록), `links`(`{label, url}`, http(s)만 허용)
- 채팅 헤더의 톱니바퀴: **글자 크기**(작게/보통/크게), **채팅 시간 표시**, **채팅창 새 창으로 열기**. 설정은 브라우저에 저장되고 새 창과 공유됩니다.
- 운영 패널 **방송 정보**: 제목·카테고리·태그(쉼표로 구분, 최대 5개)를 바꾸면 화면, 탭 제목, 제목 배너에 바로 반영됩니다.

### 채팅 이모티콘

채팅에 `:이름:` 으로 입력하거나 입력창 왼쪽 버튼으로 고릅니다.
`하루웃음` `하루놀람` `하루눈물` `하루화남` `하트` `케이크` `ㅋㅋ` `박수` — 모두 `src/chat/emotes.ts` 에 코드로 그린 오리지널 SVG입니다.

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
