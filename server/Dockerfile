# 외부 의존성이 없는 서버: Node 24 의 TypeScript 타입 제거 기능으로 .ts 를 바로 실행
FROM node:24-alpine
WORKDIR /app
COPY src ./src
ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
CMD ["node", "src/index.ts"]
