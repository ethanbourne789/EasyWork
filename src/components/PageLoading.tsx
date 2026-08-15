export function PageLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">启动中...</p>
      </div>
    </div>
  );
}
