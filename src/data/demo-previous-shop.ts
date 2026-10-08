import {
  previousShopImeis,
  type PreviousShopResult,
} from "../domain/previous-shop";

export type DemoPreviousShopScenario = "history" | "different" | "empty";

/** Fictional, screen-only fixtures. Never query or update shared shop history. */
export function demoPreviousShopResult(
  values: string[],
  scenario: DemoPreviousShopScenario,
): PreviousShopResult {
  const imeis = previousShopImeis(values).filter((imei) =>
    ["490154203237518", "356938035643809"].includes(imei),
  );
  if (scenario === "empty" || !imeis.length)
    return { enabled: true, matches: [] };
  const first = {
    imeis,
    shopName: "Pamir Phones — DEMO",
    shopNumber: "42",
    phone: "+12025550103", // Reserved fictional number; calling is disabled in demo.
    address: "Demo Market, Kabul",
    occurredAt: "2026-10-01T09:30:00Z",
    direction: "sell" as const,
  };
  return {
    enabled: true,
    matches:
      scenario === "different" && imeis.length > 1
        ? [
            { ...first, imeis: [imeis[0]] },
            {
              imeis: [imeis[1]],
              shopName: "Herat Phones — DEMO",
              shopNumber: "8",
              phone: "",
              address: "Demo Plaza, Herat",
              occurredAt: "2026-09-25T11:00:00Z",
              direction: "buy",
            },
          ]
        : [first],
  };
}
