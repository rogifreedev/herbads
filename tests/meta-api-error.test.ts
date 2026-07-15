import { describe, expect, it } from "vitest";
import {
  formatMetaApiFailure,
  isRetryableMetaApiFailure,
  metaRequestLabel,
  type MetaApiFailure
} from "@/lib/meta/api-error";

function failure(overrides: Partial<MetaApiFailure> = {}): MetaApiFailure {
  return {
    endpoint: "/v20.0/act_123/insights",
    message: "Invalid parameter",
    status: 400,
    code: 100,
    subcode: null,
    traceId: null,
    isTransient: false,
    ...overrides
  };
}

describe("Meta API error handling", () => {
  it("retries transient and server-side failures", () => {
    expect(isRetryableMetaApiFailure(failure({ message: "An unexpected error has occurred", code: 1 }))).toBe(true);
    expect(isRetryableMetaApiFailure(failure({ status: 503 }))).toBe(true);
    expect(isRetryableMetaApiFailure(failure())).toBe(false);
  });

  it("keeps access tokens out of request labels", () => {
    expect(metaRequestLabel("https://graph.facebook.com/v20.0/act_123/insights?access_token=secret&breakdowns=age"))
      .toBe("/v20.0/act_123/insights?breakdowns=age");
  });

  it("preserves Meta diagnostics in the stored error message", () => {
    expect(formatMetaApiFailure(failure({ status: 500, code: 2, subcode: 99, traceId: "trace-123" })))
      .toContain("HTTP 500, Code 2, Subcode 99, Trace trace-123");
  });
});
