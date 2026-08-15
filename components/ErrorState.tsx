export default function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-zinc-400">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p className="max-w-md text-zinc-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}
