import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: "standalone" فقط برای self-hosting (Docker/Windows) لازمه.
  // روی Vercel غیرفعال می‌شه چون Vercel خودش سرورلس بیلد می‌کنه.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
  // خطاهای TypeScript در Build مجاز نیستند — همه‌جا tsc پاس می‌شود
  typescript: {
    ignoreBuildErrors: false,
  },
  // در Next 16 ESLint از Build جدا شده — با `npm run lint` اجرا کنید
  reactStrictMode: false,
};

export default nextConfig;