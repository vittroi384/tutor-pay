import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 강사 첨부 파일 업로드(최대 5MB, base64 전송)를 위해 서버 액션 본문 한도 확대
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["postgres", "exceljs"],
};

export default nextConfig;
