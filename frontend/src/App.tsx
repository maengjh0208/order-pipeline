import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OrderListPage } from "./pages/OrderListPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { OrderDetailPage } from "./pages/OrderDetailPage";
import { OpsDashboardPage } from "./pages/OpsDashboardPage";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <nav>
          <Link to="/">주문 목록</Link>
          <Link to="/ops">운영 대시보드</Link>
        </nav>
        <Routes>
          <Route path="/" element={<OrderListPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/ops" element={<OpsDashboardPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
