"""
로컬 TTS 서버: MeloTTS 를 OpenAI 호환 음성 API 로 감싼다.

  GET  /health            모델 준비 상태
  POST /v1/audio/speech   {"input": "...", "voice": "KR", "speed": 1.0, "response_format": "wav"} -> audio/wav

OpenAI 호환 형식이라 api 서버(server/)는 엔진을 몰라도 된다. 다른 TTS 엔진으로 바꿀 때도
같은 엔드포인트를 제공하는 컨테이너로 교체하면 된다.
"""

import io
import threading
import time
from collections import OrderedDict

import soundfile
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from melo.api import TTS
from pydantic import BaseModel, Field

MAX_INPUT = 300
CACHE_SIZE = 128

app = FastAPI(title="live-talk tts")
_model: TTS | None = None
_lock = threading.Lock()  # MeloTTS 는 동시에 여러 요청을 처리하지 않는다
_cache: "OrderedDict[tuple, bytes]" = OrderedDict()


class SpeechRequest(BaseModel):
    model: str = "melotts-kr"
    input: str = Field(..., min_length=1, max_length=MAX_INPUT)
    voice: str = "KR"
    speed: float = Field(1.0, ge=0.5, le=2.0)
    response_format: str = "wav"


@app.on_event("startup")
def load() -> None:
    global _model
    t0 = time.time()
    _model = TTS(language="KR", device="cpu")
    # 첫 합성은 느리므로 미리 한 번 돌려 둔다
    _model.tts_to_file("준비 완료", _model.hps.data.spk2id["KR"], quiet=True)
    print(f"[tts] MeloTTS KR ready ({time.time() - t0:.1f}s)", flush=True)


@app.get("/health")
def health() -> dict:
    # spk2id 는 MeloTTS 의 HParams (dict 가 아님): list()/get() 대신 keys()/in 을 쓴다
    return {"ok": _model is not None, "engine": "melotts", "voices": list(_model.hps.data.spk2id.keys()) if _model else []}


@app.get("/v1/models")
def models() -> dict:
    """OpenAI 호환: 사용할 수 있는 모델 목록 (api 서버의 연결 확인용)"""
    if _model is None:
        raise HTTPException(503, "모델을 불러오는 중")
    return {"object": "list", "data": [{"id": "melotts-kr", "object": "model"}]}


@app.post("/v1/audio/speech")
def speech(req: SpeechRequest) -> Response:
    if _model is None:
        raise HTTPException(503, "모델을 불러오는 중")
    if req.response_format != "wav":
        raise HTTPException(400, "response_format 은 wav 만 지원합니다")
    spk2id = _model.hps.data.spk2id
    if req.voice not in spk2id:
        raise HTTPException(400, f"알 수 없는 voice: {req.voice}")
    spk = spk2id[req.voice]
    text = " ".join(req.input.split())
    key = (text, req.voice, round(req.speed, 2))
    if key in _cache:
        _cache.move_to_end(key)
        return Response(_cache[key], media_type="audio/wav", headers={"x-tts-cache": "hit"})

    t0 = time.time()
    with _lock:
        audio = _model.tts_to_file(text, spk, speed=req.speed, quiet=True)
    buf = io.BytesIO()
    soundfile.write(buf, audio, _model.hps.data.sampling_rate, format="WAV", subtype="PCM_16")
    data = buf.getvalue()
    _cache[key] = data
    if len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    ms = int((time.time() - t0) * 1000)
    dur = len(audio) / _model.hps.data.sampling_rate
    return Response(data, media_type="audio/wav", headers={"x-tts-ms": str(ms), "x-tts-duration": f"{dur:.2f}"})
