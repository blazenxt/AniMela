export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full ${className}`}>
      <div className="skeleton aspect-[2/3] rounded-xl" />
      <div className="skeleton mt-2 h-4 w-3/4 rounded" />
      <div className="skeleton mt-1.5 h-3 w-1/3 rounded" />
    </div>
  );
}

export default function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="py-10">
      <p className="sr-only">{label}</p>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} className="w-40 shrink-0" />
        ))}
      </div>
    </div>
  );
}
