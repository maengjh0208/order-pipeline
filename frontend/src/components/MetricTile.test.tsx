import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricTile } from "./MetricTile";

describe("MetricTile", () => {
  it("renders the label and value", () => {
    render(<MetricTile label="총 주문" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("총 주문")).toBeInTheDocument();
  });
});
