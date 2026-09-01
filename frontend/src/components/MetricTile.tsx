export interface MetricTileProps {
  label: string;
  value: string | number;
}

export function MetricTile({ label, value }: MetricTileProps) {
  return (
    <div className="metric-tile">
      <span className="metric-tile__value">{value}</span>
      <span className="metric-tile__label">{label}</span>
    </div>
  );
}
