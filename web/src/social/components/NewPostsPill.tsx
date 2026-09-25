"use client";

export function NewPostsPill({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <div className="pill-wrap">
      <button className="pill" onClick={onClick} data-testid="new-posts-pill">
        {count} new {count === 1 ? "post" : "posts"}
      </button>
    </div>
  );
}
