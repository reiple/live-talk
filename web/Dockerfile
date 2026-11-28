# 웹 화면만 담은 이미지: 정적 빌드(dist/) 를 nginx 로 서빙하고 /api 는 API_URL 로 프록시한다.
#
#   docker build -f web/Dockerfile -t live-talk-web .        (빌드 컨텍스트는 리포지토리 루트)
#   docker run -d -p 8080:80 -e API_URL=http://<api서버>:8787 live-talk-web
#
# api 서버에는 CORS 가 없으므로 브라우저는 항상 이 컨테이너의 /api 를 거쳐 같은 주소로 호출한다.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
# api 서버 주소 (끝에 / 없이). 연결할 수 없으면 화면은 뜨고 AI 자유 대화/음성만 꺼진다.
ENV API_URL=http://api:8787 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /app/dist /usr/share/nginx/html
COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 80
