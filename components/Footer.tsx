import Link from "next/link";

const LINKS = [
  { href: "/movies", label: "Movies" },
  { href: "/series", label: "Series" },
  { href: "/anime", label: "Anime" },
  { href: "/genres", label: "Genres" },
  { href: "/mylist", label: "My List" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-ink-900/60">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-fuchsia-500 to-violet-600 text-xs font-black text-white">
              A
            </span>
            <span className="text-white">
              Ani
              <span className="bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
                Mela
              </span>
            </span>
          </div>

          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm text-zinc-400 transition hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-8 border-t border-white/5 pt-6 text-center text-xs text-zinc-600">
          <p>Stream anime, movies &amp; series. Content &amp; metadata are provided by third-party services.</p>
          <p className="mt-1">This site does not host any files.</p>
        </div>
      </div>
    </footer>
  );
}
