import type { Order, OpsSummary } from "../types/order";

export interface Product {
  product_id: string;
  product_name: string;
  stock: number;
}

export interface CreateOrderInput {
  items: { product_id: string; quantity: number }[];
  card_number: string;
}

// 오케스트레이터(주문/SSE)와 inventory-service(상품 조회)는 서로 다른 서비스라 base URL이 다르다.
// 브라우저에서 도는 코드라 도커 서비스명이 아니라 호스트에 매핑된 포트(localhost:8000/8001)를 쓴다.
// mock 서버로 개발할 땐 둘 다 http://localhost:4000 으로 덮어쓰면 된다.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const INVENTORY_BASE_URL = import.meta.env.VITE_INVENTORY_BASE_URL ?? "http://localhost:8001";

async function getJson<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export function fetchProducts(): Promise<Product[]> {
  return getJson<Product[]>(INVENTORY_BASE_URL, "/products");
}

export function fetchOrders(): Promise<Order[]> {
  return getJson<Order[]>(API_BASE_URL, "/orders");
}

export function fetchOrder(orderId: string): Promise<Order> {
  return getJson<Order>(API_BASE_URL, `/orders/${orderId}`);
}

export function fetchOpsSummary(): Promise<OpsSummary> {
  return getJson<OpsSummary>(API_BASE_URL, "/ops/summary");
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const res = await fetch(`${API_BASE_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`POST /orders failed: ${res.status}`);
  return res.json();
}
