interface StarRatingProps {
  rating: number;
  reviewCount?: number;
}

function Star({ fill }: { fill: number }) {
  // fill: 0..1 portion of the star to paint amber.
  const pct = Math.round(fill * 100);
  const gradId = `star-${pct}`;
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden>
      <defs>
        <linearGradient id={gradId}>
          <stop offset={`${pct}%`} stopColor="#F59E0B" />
          <stop offset={`${pct}%`} stopColor="#E5E7EB" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M10 1.5l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.6l-4.95 2.6.94-5.5-4-3.9 5.53-.8z"
      />
    </svg>
  );
}

export function StarRating({ rating, reviewCount }: StarRatingProps) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-0.5"
        aria-label={`Rated ${rating} out of 5`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} fill={Math.max(0, Math.min(1, rating - i))} />
        ))}
      </div>
      <span className="text-sm text-gray-500">
        {rating.toFixed(1)}
        {reviewCount != null && (
          <span className="text-gray-400"> · {reviewCount} reviews</span>
        )}
      </span>
    </div>
  );
}
