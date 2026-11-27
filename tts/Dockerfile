# 로컬 한국어 TTS: MeloTTS (MIT) + OpenAI 호환 음성 API (/v1/audio/speech)
# CPU 로 동작한다 (GPU 는 LLM 이 쓰도록 비워 둠)
FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends build-essential git libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# 빌드 중 임시 파일은 이미지 안의 일반 디렉터리에 (WSL 의 Docker 빌드에서 /tmp 에 큰 파일을 쓰면
# Read-only file system 오류가 나는 경우가 있음: unidic_lite 사전 패키지 약 50MB)
ENV TMPDIR=/var/tmp/build
RUN mkdir -p /var/tmp/build

# 기본 이미지의 오래된 pip 는 패키지 이름 대소문자(Jinja2/jinja2)를 처리하지 못해 먼저 올린다
RUN pip install --no-cache-dir --upgrade pip

# CPU 전용 PyTorch (CUDA 패키지 수 GB 를 받지 않음).
# MeloTTS 가 고정한 transformers==4.27.4 와 맞는 버전으로 고정
RUN pip install --no-cache-dir torch==2.5.1 torchaudio==2.5.1 --index-url https://download.pytorch.org/whl/cpu

# MeloTTS 고정 커밋
ARG MELO_REF=209145371cff8fc3bd60d7be902ea69cbdb7965a
RUN git clone https://github.com/myshell-ai/MeloTTS.git /opt/MeloTTS \
    && cd /opt/MeloTTS && git checkout ${MELO_REF} \
    && pip install --no-cache-dir -e . "numpy<2" \
    && python -m unidic download \
    && rm -rf /var/tmp/build/*

# 한국어 모델과 BERT 를 빌드할 때 미리 받아 이미지에 넣는다 (첫 실행 대기 없음)
RUN python -c "from melo.api import TTS; m = TTS(language='KR', device='cpu'); m.tts_to_file('안녕하세요', m.hps.data.spk2id['KR'], '/tmp/warm.wav', quiet=True)"

RUN pip install --no-cache-dir "fastapi==0.115.*" "uvicorn==0.32.*"
WORKDIR /app
COPY server.py .
EXPOSE 8880
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8880"]
