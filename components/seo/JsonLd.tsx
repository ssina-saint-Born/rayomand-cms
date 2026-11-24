import React from "react";

// Renders one or more schema.org objects as JSON-LD script tags. Kept as a
// server component so the payload is emitted in the initial HTML for crawlers.
export default function JsonLd({ data }: { data: Record<string, any> | Record<string, any>[] | null | undefined }) {
  if (!data) return null;
  const items = Array.isArray(data) ? data : [data];
  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          // JSON.stringify escapes the structure; guard against </script> breakout.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, "\\u003c") }}
        />
      ))}
    </>
  );
}
