import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createOrder, fetchProducts } from "../lib/api";

export function NewOrderPage() {
  const navigate = useNavigate();
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: fetchProducts });
  const [productId, setProductId] = useState("");
  const [cardNumber, setCardNumber] = useState("");

  const mutation = useMutation({
    mutationFn: createOrder,
    onSuccess: (order) => navigate(`/orders/${order.order_id}`),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate({ items: [{ product_id: productId, quantity: 1 }], card_number: cardNumber });
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>새 주문</h1>

      <label htmlFor="product-select">상품</label>
      <select id="product-select" aria-label="상품" value={productId} onChange={(e) => setProductId(e.target.value)} required>
        <option value="">상품 선택</option>
        {products?.map((p) => (
          <option key={p.product_id} value={p.product_id}>
            {p.product_name} {p.demo_note ? `(${p.demo_note})` : ""}
          </option>
        ))}
      </select>

      <label htmlFor="card-input">카드번호</label>
      <input
        id="card-input"
        aria-label="카드번호"
        placeholder="4000000000000002 = 결제 실패 시연용"
        value={cardNumber}
        onChange={(e) => setCardNumber(e.target.value)}
        required
      />

      <button type="submit" disabled={mutation.isPending}>
        주문하기
      </button>
    </form>
  );
}
