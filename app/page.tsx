import Link from "next/link"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="border-b px-6 h-14 flex items-center justify-between">
        <span className="font-bold text-lg tracking-tight">HRMS</span>
        <div className="flex gap-3">
          <Link href="/login">
            <button className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50 transition-colors">
              Sign in
            </button>
          </Link>
          <Link href="/signup">
            <button className="px-4 py-2 text-sm rounded-lg bg-black text-white hover:bg-gray-800 transition-colors">
              Start free trial
            </button>
          </Link>
        </div>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm mb-8 text-gray-600">
            ✦ Agentic HRMS — just describe what you need
          </div>
          <h1 className="text-6xl font-bold tracking-tight mb-6 leading-tight">
            Your entire HR workflow,<br />
            <span className="text-indigo-600">handled by AI agents</span>
          </h1>
          <p className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto">
            From recruitment to offboarding — just describe what you need
            and agents take care of it. No clicks, no forms, just natural language.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/signup">
              <button className="px-6 py-3 rounded-xl bg-black text-white font-medium hover:bg-gray-800 transition-colors">
                Start 14-day free trial →
              </button>
            </Link>
            <Link href="/login">
              <button className="px-6 py-3 rounded-xl border font-medium hover:bg-gray-50 transition-colors">
                Sign in to your workspace
              </button>
            </Link>
          </div>
          <p className="text-sm text-gray-400 mt-4">No credit card required · Setup in 5 minutes</p>
        </div>
      </main>

      <footer className="border-t px-6 py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} HRMS · Built with Claude
      </footer>
    </div>
  )
}