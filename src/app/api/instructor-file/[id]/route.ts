/**
 * 강사 첨부 파일 다운로드 — DB의 base64 를 원본 파일로 되돌려 내려준다.
 * 로그인한 사용자만 접근 가능(조회 전용 포함).
 */
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { instructorFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("로그인이 필요합니다.", { status: 401 });
  const { id } = await params;
  const fileId = Number(id);
  if (!Number.isInteger(fileId))
    return new NextResponse("잘못된 요청", { status: 400 });
  const row = await db.query.instructorFiles.findFirst({
    where: eq(instructorFiles.id, fileId),
  });
  if (!row) return new NextResponse("파일이 없습니다.", { status: 404 });
  const buf = Buffer.from(row.data, "base64");
  return new NextResponse(buf, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
