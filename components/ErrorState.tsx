export default function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="max-w-md text-zinc-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold transition hover:bg-white/15"
        >
          Try again
        </button>
      )}
    </div>
  );
}
