import { useState } from "react";

const PAGE = 25;

export function usePage<T>(items: readonly T[], resetKey: string) {
  const [limit, setLimit] = useState(PAGE);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setLimit(PAGE);
  }
  return {
    items: items.slice(0, limit),
    hasMore: limit < items.length,
    loadMore() {
      setLimit((n) => n + PAGE);
    },
  };
}
