export default function AdminLoading() {
  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8" aria-busy="true" aria-label="Loading">
      <div className="animate-pulse space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-64 rounded bg-gray-200" />
          <div className="h-4 w-96 max-w-full rounded bg-gray-100" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-xl bg-white p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-gray-200" />
              <div className="h-3 w-24 rounded bg-gray-100" />
              <div className="h-6 w-32 rounded bg-gray-200" />
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-12 bg-gray-50 border-b border-gray-200" />
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-14 border-b border-gray-100 flex items-center gap-4 px-4">
              <div className="h-3 rounded bg-gray-100 flex-1" />
              <div className="h-3 rounded bg-gray-100 flex-1" />
              <div className="h-3 rounded bg-gray-100 flex-1 hidden sm:block" />
              <div className="h-3 rounded bg-gray-100 w-20 hidden lg:block" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
