export default function LoadingOverlay({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded border border-black/10 bg-white px-4 py-3 text-sm">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
        {label}
      </div>
    </div>
  )
}
