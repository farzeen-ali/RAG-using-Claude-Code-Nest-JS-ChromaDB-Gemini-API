// Fixed by spec at 10 MB. Kept as a plain constant (not an env var) because
// Nest evaluates FileInterceptor's decorator options at class-definition
// time, before ConfigModule has parsed the .env file.
export const MAX_UPLOAD_SIZE_MB = 10;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
