/**
 * 루트(/) 접속 시 대시보드로 보내는 리다이렉트 전용 페이지.
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
