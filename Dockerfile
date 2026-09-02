# TutorPay (강사 급여정산) — 단일 이미지 (빌드 + 실행)
FROM node:22-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 TZ=Asia/Seoul
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY . .
# 빌드 시점에는 DB가 없어도 되도록 더미 URL 사용 (실제 값은 실행 시 주입)
RUN DATABASE_URL=postgres://build:build@localhost:5432/build AUTH_SECRET=build npm run build
EXPOSE 3000
# 컨테이너 시작 시 마이그레이션 적용 후 서버 기동
CMD ["npm", "run", "start:prod"]
