export default function BasicPage({ title }: { title: string }) {
  return (
    <section className="px-4 pt-6 sm:px-8">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <div className="mt-4 rounded border border-black/10 bg-white p-4 text-sm text-[var(--ink-muted)]">
        Módulo desativado temporariamente.
      </div>
    </section>
  )
}
