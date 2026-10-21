import { describe, it, expect } from "vitest";
import { crossMatch } from "./ituran";

const stops = [{ plate: "615-41-002", address: "החרש 5 רמת גן", arrive: "08:00", depart: "08:30" }];

describe("ituran cross-match", () => {
  it("crane stay of 30 minutes with signature inside window is verified", () => {
    expect(
      crossMatch({ site: "רח׳ החרש 5, רמת גן", signedAt: "08:20" }, "crane", "615-41-002", stops)
        .status,
    ).toBe("ok");
  });
  it("crane stay of 30 minutes is too long for nothing but too short? flatbed max 25 → warn", () => {
    expect(
      crossMatch({ site: "רח׳ החרש 5, רמת גן", signedAt: "08:20" }, "flatbed", "615-41-002", [
        { ...stops[0]!, depart: "08:50" },
      ]).status,
    ).toBe("warn");
  });
  it("truck never at address fails", () => {
    expect(
      crossMatch({ site: "הים 8, בת ים", signedAt: "09:00" }, "crane", "615-41-002", stops).status,
    ).toBe("fail");
  });
});
