import { useQuery } from "@tanstack/react-query";
import { fetchOpsSummary } from "../lib/api";
import { useOpsStream } from "../hooks/useOpsStream";
import { MetricTile } from "../components/MetricTile";
import { EventLogTable } from "../components/EventLogTable";

const EMPTY_SUMMARY = { total_orders: 0, retrying_count: 0, dlq_count: 0, success_rate: 0 };

export function OpsDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["ops-summary"], queryFn: fetchOpsSummary });
  const { events, summary } = useOpsStream(data ?? EMPTY_SUMMARY);

  if (isLoading) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1>운영 대시보드</h1>
      <div className="metric-grid">
        <MetricTile label="총 주문" value={summary.total_orders} />
        <MetricTile label="재시도 중" value={summary.retrying_count} />
        <MetricTile label="DLQ" value={summary.dlq_count} />
        <MetricTile label="성공률" value={`${Math.round(summary.success_rate * 100)}%`} />
      </div>
      <EventLogTable events={events} />
    </div>
  );
}
