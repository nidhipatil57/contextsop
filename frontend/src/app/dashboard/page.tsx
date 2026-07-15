import Link from "next/link";

export default function DashboardPlaceholder() {
  return <main className="grid min-h-screen place-items-center bg-[#07111f] p-6 text-[#edf6ff]"><section className="max-w-lg rounded-2xl border border-[#203249] bg-[#0b1728] p-8"><p className="text-sm font-semibold tracking-[.15em] text-[#38e8a0]">WORKSPACE FOUNDATION</p><h1 className="text-3xl">Your incident workspace is ready.</h1><p className="leading-7 text-[#93a6bd]">Authentication, Supabase persistence, and the interactive DSL renderer connect here next. The API health check is available at <code>/api/v1/health</code>.</p><Link className="text-[#38e8a0]" href="/">← Back home</Link></section></main>;
}
