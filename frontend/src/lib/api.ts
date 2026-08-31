import type { Order, OpsSummary } from "../types/order";

export interface Product {
  product_id: string;
  product_name: string;
  stock: number;
  demo_note: string | null;
}

export interface CreateOrderInput {
  items: { product_id: string; quantity: number }[];
  card_number: string;
}

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

export function fetchProducts(): Promise<Product[]> {
  return getJson<Product[]>("/products");
}

export function fetchOrders(): Promise<Order[]> {
  return getJson<Order[]>("/orders");
}

export function fetchOrder(orderId: string): Promise<Order> {
  return getJson<Order>(`/orders/${orderId}`);
}

export function fetchOpsSummary(): Promise<OpsSummary> {
  return getJson<OpsSummary>("/ops/summary");
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const res = await fetch(`${BASE_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`POST /orders failed: ${res.status}`);
  return res.json();
}
