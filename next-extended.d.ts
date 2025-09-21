// next-extended.d.ts
import 'next';

declare module 'next' {
  interface NextConfig {
    /**
     * Các origin được phép truy cập khi dev server bởi tính năng allowedDevOrigins
     */
    allowedDevOrigins?: string[];
  }
}
