import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchOrder } from "../lib/api";
import { useOrderStream } from "../hooks/useOrderStream";
import { OrderTimeline } from "../components/OrderTimeline";

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => fetchOrder(orderId!),
    enabled: Boolean(orderId),
  });
  const { status } = useOrderStream(orderId!, data?.current_status ?? null);

  if (isLoading || !status) return <p>불러오는 중...</p>;

  return (
    <div>
      <h1>주문 {orderId}</h1>
      <OrderTimeline currentStatus={status} />
    </div>
  );
}
