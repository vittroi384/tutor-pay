/**
 * Auth.js(next-auth) 가 사용하는 로그인/콜백 엔드포인트. 실제 설정은 src/auth.ts 에 있다.
 */
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
