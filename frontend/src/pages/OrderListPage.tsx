import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchOrders } from "../lib/api";

export function OrderListPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["orders"], queryFn: fetchOrders });

  if (isLoading) return <p>불러오는 중...</p>;
  if (error) return <p>주문 목록을 불러오지 못했습니다.</p>;

  return (
    <div>
      <h1>내 주문</h1>
      <Link to="/orders/new">새 주문</Link>
      <ul>
        {data!.map((order) => (
          <li key={order.order_id}>
            <Link to={`/orders/${order.order_id}`}>
              {order.order_id} — {order.current_status}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
