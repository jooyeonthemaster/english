export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-24 bg-muted rounded" />
        <div className="h-4 w-56 bg-muted rounded mt-2" />
      </div>
      {/* Chat layout */}
      <div className="border rounded-lg overflow-hidden" style={{ height: "calc(100vh - 200px)" }}>
        <div className="flex h-full">
          {/* Left panel - conversation list */}
          <div className="w-[340px] border-r flex flex-col">
            <div className="p-3 border-b">
              <div className="h-9 bg-muted rounded-lg" />
            </div>
            <div className="p-3 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="size-10 bg-muted rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-full bg-muted rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Right panel - empty state */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="size-16 bg-muted rounded-full mx-auto" />
              <div className="h-5 w-36 bg-muted rounded mx-auto" />
              <div className="h-4 w-56 bg-muted rounded mx-auto" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
