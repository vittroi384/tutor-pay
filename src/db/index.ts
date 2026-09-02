/**
 * DB 연결 (postgres-js + Drizzle). DATABASE_URL 환경변수 사용.
 * 개발 서버 핫리로드 때 연결이 계속 늘어나지 않도록 전역(globalThis)에 클라이언트를 보관한다.
 * Tx 타입은 db.transaction 콜백이 받는 트랜잭션 객체 타입 — 액션에서 tx 를 넘겨 쓸 때 사용.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url =
  process.env.DATABASE_URL ??
  "postgres://tutorpay:tutorpay@localhost:5432/tutorpay";

// Next.js 개발 모드의 핫리로드에서 커넥션이 계속 늘어나지 않도록 전역에 보관
const globalForDb = globalThis as unknown as {
  __acoPg?: ReturnType<typeof postgres>;
};
export const sql =
  globalForDb.__acoPg ??
  postgres(url, { max: 10, idle_timeout: 30, connect_timeout: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__acoPg = sql;

export const db = drizzle(sql, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
