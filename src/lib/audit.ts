/**
 * 감사로그 기록 (audit_logs). 누가·언제·어느 테이블의 어떤 행을·무슨 동작(create/update/delete/merge/import…)했는지
 * before/after JSON 과 한 줄 요약을 남긴다. 트랜잭션 안에서 호출할 수 있게 tx 를 받는다.
 */
import type { Tx } from "@/db";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

/**
 * 감사로그 1건 기록.
 * @param dbOrTx  db 또는 트랜잭션(tx) — 변경과 같은 트랜잭션 안에서 남기려면 tx 를 넘긴다
 * @param entry   userEmail(누가) · tableName/recordId(무엇을) · action(create/update/delete/merge/toggle/bulk-paid/lock/import…) · before/after(변경 전후) · summary(한 줄 요약)
 */
export async function logAudit(
  tx: Tx | typeof db,
  entry: {
    userEmail: string;
    tableName: string;
    recordId?: string | number | null;
    action: string;
    before?: unknown;
    after?: unknown;
    summary?: string;
  },
) {
  await tx.insert(auditLogs).values({
    userEmail: entry.userEmail,
    tableName: entry.tableName,
    recordId: entry.recordId == null ? null : String(entry.recordId),
    action: entry.action,
    before: entry.before ?? null,
    after: entry.after ?? null,
    summary: entry.summary ?? null,
  });
}
