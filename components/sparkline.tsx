type Point = { x: number; y: number };

export function Sparkline({
  data,
  height = 80,
  width = 320,
  stroke = "var(--color-depth-hi)",
  fill = "color-mix(in srgb, var(--color-depth) 18%, transparent)",
  zero = true,
}: {
  data: number[];
  height?: number;
  width?: number;
  stroke?: string;
  fill?: string;
  zero?: boolean;
}) {
  if (data.length === 0) return null;

  const min = Math.min(0, ...data);
  const max = Math.max(0, ...data);
  const span = max - min || 1;

  const points: Point[] = data.map((v, i) => ({
    x: data.length === 1 ? width / 2 : (i / (data.length - 1)) * width,
    y: height - ((v - min) / span) * height,
  }));

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" ");

  const area =
    points.length > 1
      ? `${path} L${width},${height} L0,${height} Z`
      : `M0,${height} L${width},${height} Z`;

  const zeroY = height - ((0 - min) / span) * height;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block"
      role="img"
      aria-label="sparkline"
    >
      {zero && min < 0 && max > 0 && (
        <line
          x1="0"
          y1={zeroY}
          x2={width}
          y2={zeroY}
          stroke="var(--color-line)"
          strokeDasharray="2 4"
          strokeWidth="1"
        />
      )}
      <path d={area} fill={fill} stroke="none" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
