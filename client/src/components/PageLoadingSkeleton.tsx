import { Skeleton } from "@/components/ui/skeleton";

export default function PageLoadingSkeleton() {
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 px-3 py-4 sm:px-6 lg:px-8" aria-busy="true" aria-label="جارٍ تحميل الصفحة">
      <div className="mx-auto w-full max-w-7xl space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>

        <div className="space-y-3">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 max-w-full rounded-lg" />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-10 w-28 rounded-xl" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 border-b border-slate-100 pb-3 last:border-0">
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5 max-w-64" />
                  <Skeleton className="h-3 w-2/5 max-w-40" />
                </div>
                <Skeleton className="h-8 w-16 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
