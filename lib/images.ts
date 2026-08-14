const IMG = "https://image.tmdb.org/t/p/";

export const PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="342" height="513" viewBox="0 0 342 513">
       <rect width="100%" height="100%" fill="#14142a"/>
       <rect x="60" y="150" width="222" height="180" rx="12" fill="#1e1e38"/>
       <circle cx="171" cy="240" r="40" fill="none" stroke="#3a3a5e" stroke-width="9"/>
       <path d="M161 222l28 18-28 18z" fill="#3a3a5e"/>
       <text x="171" y="382" text-anchor="middle" fill="#4b4b74" font-family="sans-serif" font-size="18">No poster</text>
     </svg>`
  );

export function poster(path?: string | null, size = "w342"): string {
  return path ? IMG + size + path : PLACEHOLDER;
}

export function backdrop(path?: string | null, size = "w1280"): string {
  return path ? IMG + size + path : PLACEHOLDER;
}
