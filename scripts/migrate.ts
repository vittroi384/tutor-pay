/** DB 마이그레이션 적용 스크립트 — 앱 컨테이너 시작 시 자동 실행되어 drizzle/ 폴더의 미적용 SQL을 순서대로 반영한다 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** drizzle/ 폴더의 SQL 마이그레이션을 순서대로 적용 (컨테이너 시작 시 자동 실행) */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL 이 설정되지 않았습니다.");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);
  for (let attempt = 1; attempt <= 15; attempt++) {
    try {
      await sql`select 1`;
      break;
    } catch (e) {
      if (attempt === 15) throw e;
      console.log(`DB 대기 중… (${attempt}/15)`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("마이그레이션 완료");
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
