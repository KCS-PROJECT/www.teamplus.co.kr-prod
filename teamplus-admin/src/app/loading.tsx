export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-700" />
        <p className="text-sm text-slate-500">데이터를 불러오는 중입니다...</p>
      </div>
    </div>
  );
}
