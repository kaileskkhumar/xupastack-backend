import { describe, it, expect } from "vitest";
import { isAllowedPath } from "@xupastack/shared";

const ALL_SERVICES = ["rest", "auth", "storage", "functions", "graphql", "realtime"];

describe("isAllowedPath", () => {
  it("allows /rest/v1/ paths", () => {
    expect(isAllowedPath("/rest/v1/users", ALL_SERVICES)).toBe(true);
    expect(isAllowedPath("/rest/v1/", ALL_SERVICES)).toBe(true);
  });

  it("allows /auth/v1/ paths", () => {
    expect(isAllowedPath("/auth/v1/token", ALL_SERVICES)).toBe(true);
  });

  it("allows /storage/v1/ paths", () => {
    expect(isAllowedPath("/storage/v1/object/bucket/file", ALL_SERVICES)).toBe(true);
  });

  it("allows /functions/v1/ paths", () => {
    expect(isAllowedPath("/functions/v1/my-function", ALL_SERVICES)).toBe(true);
  });

  it("allows /graphql/v1/ paths", () => {
    expect(isAllowedPath("/graphql/v1/", ALL_SERVICES)).toBe(true);
  });

  it("allows /realtime/v1/websocket", () => {
    expect(isAllowedPath("/realtime/v1/websocket", ALL_SERVICES)).toBe(true);
    expect(isAllowedPath("/realtime/v1/websocket?apikey=abc", ALL_SERVICES)).toBe(false); // pathname only
  });

  it("rejects /admin/ paths", () => {
    expect(isAllowedPath("/admin/users", ALL_SERVICES)).toBe(false);
  });

  it("rejects paths not in enabled services", () => {
    expect(isAllowedPath("/storage/v1/object", ["rest", "auth"])).toBe(false);
  });

  it("rejects root path", () => {
    expect(isAllowedPath("/", ALL_SERVICES)).toBe(false);
  });

  it("rejects /v1/ (no service prefix)", () => {
    expect(isAllowedPath("/v1/something", ALL_SERVICES)).toBe(false);
  });
});
