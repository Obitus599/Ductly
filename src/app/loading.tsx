export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className="w-8 h-8 rounded-full border-[3px] border-[rgb(244,244,244)] border-t-[rgb(147,216,216)] animate-spin"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
