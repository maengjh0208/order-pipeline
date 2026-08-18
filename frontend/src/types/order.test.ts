import { describe, it, expect } from "vitest";
import { isTerminalStatus, isFailureStatus } from "./order";

describe("isTerminalStatus", () => {
  it("returns true for COMPLETED", () => {
    expect(isTerminalStatus("COMPLETED")).toBe(true);
  });

  it("returns true for CANCELLED", () => {
    expect(isTerminalStatus("CANCELLED")).toBe(true);
  });

  it("returns false for PAYMENT_PROCESSING", () => {
    expect(isTerminalStatus("PAYMENT_PROCESSING")).toBe(false);
  });
});

describe("isFailureStatus", () => {
  it("returns true for CANCELLED", () => {
    expect(isFailureStatus("CANCELLED")).toBe(true);
  });

  it("returns true for PAYMENT_FAILED_DLQ", () => {
    expect(isFailureStatus("PAYMENT_FAILED_DLQ")).toBe(true);
  });

  it("returns false for COMPLETED", () => {
    expect(isFailureStatus("COMPLETED")).toBe(false);
  });
});
