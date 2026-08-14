export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#0b0b12]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <p className="text-center text-sm text-zinc-500">
          <span className="font-bold">
            <span className="bg-gradient-to-r from-fuchsia-400 to-indigo-400 bg-clip-text text-transparent">
              AniMela
            </span>
          </span>{" "}
          — stream anime, movies &amp; series for free.
        </p>
        <p className="mt-2 text-center text-xs text-zinc-600">
          Content &amp; metadata are provided by third-party services. This site does not host any
          files.
        </p>
      </div>
    </footer>
  );
}
