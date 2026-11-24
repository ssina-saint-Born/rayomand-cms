"use client";
import React from "react";
export default function Stars({ rating, count, size = 14 }: {
    rating: number;
    count?: number;
    size?: number;
}) {
    return (<span className="inline-flex items-center gap-1">
      <span className="inline-flex" style={{ color: "#a58c64" }}>
        {[1, 2, 3, 4, 5].map((i) => (<svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={i <= Math.round(rating) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>))}
      </span>
      {count !== undefined && <span className="text-xs text-shop-muted">({count})</span>}
    </span>);
}
