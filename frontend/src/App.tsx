import { useState } from "react";
import { createOrder } from "./lib/api";
import { useOrderStream } from "./hooks/useOrderStream";
import type { Order } from "./types/order";

function App() {
  const [order, setOrder] = useState<Order | null>(null);
  const { status } = useOrderStream(order?.order_id ?? "", order?.current_status ?? null);

  async function handleCreateOrder() {
    const created = await createOrder({
      items: [{ product_id: "p1", quantity: 1 }],
      card_number: "4111111111111111",
    });
    setOrder(created);
  }

  return (
    <div>
      <h1>주문 파이프라인 (wave 1)</h1>
      <button type="button" onClick={handleCreateOrder}>
        주문 생성
      </button>
      {order && (
        <p>
          주문 <code>{order.order_id}</code> 상태: <strong>{status}</strong>
        </p>
      )}
    </div>
  );
}

export default App;
