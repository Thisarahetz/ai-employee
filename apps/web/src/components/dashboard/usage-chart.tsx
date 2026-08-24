"use client";

import { useId, useState } from "react";

import type { AiUsageDailyPoint } from "@/lib/hooks/use-ai-usage-stats";
import { formatCurrencyUsd, formatDate } from "@/lib/utils";

// Single-series bar chart (token usage) drawn as plain inline SVG, following
// the platform's data-viz mark spec: ≤24px thick bars, 4px rounded data-end
// at the top, square baseline, hairline recessive gridlines, a hover
// tooltip, and no legend box (a single series needs none — the chart title
// already names it).
const CHART_HEIGHT = 160;
const BAR_MAX_WIDTH = 24;
const GAP = 8;
const AXIS_COLOR = "#c3c2b7"; // baseline / axis token
const GRID_COLOR = "#e1e0d9"; // hairline gridline token
const BAR_COLOR = "#2a78d6"; // brand-500 / categorical slot 1 (blue)
const MUTED_TEXT = "#898781";

export function UsageChart({ data, isLoading }: { data: AiUsageDailyPoint[]; isLoading?: boolean }) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (isLoading) {
    return <div className="h-40 w-full animate-pulse rounded-md bg-surface-page" />;
  }

  if (!data.length) {
    return <p className="py-10 text-center text-sm text-ink-muted">No usage data yet.</p>;
  }

  const totalTokens = data.map((d) => d.inputTokens + d.outputTokens);
  const maxTokens = Math.max(...totalTokens, 1);
  const width = data.length * (BAR_MAX_WIDTH + GAP) + GAP;
  const plotHeight = CHART_HEIGHT - 24; // leave room for x-axis labels

  return (
    <div className="w-full overflow-x-auto">
      <svg
        role="img"
        aria-label="Daily AI token usage, most recent days"
        width={Math.max(width, 320)}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${Math.max(width, 320)} ${CHART_HEIGHT}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BAR_COLOR} />
            <stop offset="100%" stopColor={BAR_COLOR} />
          </linearGradient>
        </defs>

        {/* Gridlines (hairline, recessive) at 0/50/100% */}
        {[0, 0.5, 1].map((fraction) => {
          const y = plotHeight - fraction * plotHeight;
          return (
            <line key={fraction} x1={0} x2={width} y1={y} y2={y} stroke={GRID_COLOR} strokeWidth={1} />
          );
        })}

        {/* Baseline */}
        <line x1={0} x2={width} y1={plotHeight} y2={plotHeight} stroke={AXIS_COLOR} strokeWidth={1} />

        {data.map((point, index) => {
          const total = totalTokens[index];
          const barHeight = Math.max((total / maxTokens) * plotHeight, 2);
          const x = GAP + index * (BAR_MAX_WIDTH + GAP);
          const y = plotHeight - barHeight;
          const isHovered = hoverIndex === index;

          return (
            <g key={point.date}>
              <rect
                x={x}
                y={y}
                width={BAR_MAX_WIDTH}
                height={barHeight}
                rx={4}
                ry={4}
                fill={`url(#${gradientId})`}
                opacity={isHovered ? 1 : 0.9}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <title>{`${formatDate(point.date)}: ${total.toLocaleString()} tokens · ${formatCurrencyUsd(point.costUsd)}`}</title>
              </rect>
              {/* Sparse x-axis labels: first, last, and hovered only, to avoid clutter */}
              {(index === 0 || index === data.length - 1 || isHovered) && (
                <text
                  x={x + BAR_MAX_WIDTH / 2}
                  y={CHART_HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={10}
                  fill={MUTED_TEXT}
                >
                  {formatDate(point.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hoverIndex !== null && (
        <p className="mt-1 text-xs text-ink-secondary">
          {formatDate(data[hoverIndex].date)}: {(data[hoverIndex].inputTokens + data[hoverIndex].outputTokens).toLocaleString()} tokens
          {" · "}
          {formatCurrencyUsd(data[hoverIndex].costUsd)}
        </p>
      )}
    </div>
  );
}
