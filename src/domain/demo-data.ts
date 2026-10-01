import type { Draft, Person, Phone } from "./models";

// Fictional presentation data. Only the isolated demo flow exposes this helper.
const phone: Phone = {
  brand: "Samsung",
  model: "Galaxy A54",
  color: "Graphite",
  simCount: "2",
  imei1: "490154203237518",
  imei2: "356938035643809",
  storage: "128 GB",
  ram: "8 GB",
  condition: "Used — good condition",
  notes: "DEMO ONLY — fictional phone details for presentations.",
};

const customer: Person = {
  name: "Ahmad — DEMO",
  fatherName: "Mohammad — DEMO",
  grandfatherName: "Ali — DEMO",
  idNumber: "DEMO-ENID-001",
  originalAddress: "Kabul, Afghanistan — sample address",
  currentAddress: "Demo Street, House 12, Kabul — sample address",
  // Reserved fictional North American numbers, not real customer contacts.
  phone: "+12025550101",
  relativePhone: "+12025550102",
  occupation: "Shopkeeper — DEMO",
  workplace: "Sample Mobile Shop, Kabul",
  idVolume: "12",
  idPage: "34",
};

export function fillDemoStep(draft: Draft): Draft {
  return {
    ...draft,
    ...(draft.step === 0 || draft.step === 2
      ? {
          phone: { ...phone },
          price: draft.direction === "sell" ? "21000" : "18500",
        }
      : {}),
    ...(draft.step === 1 || draft.step === 2
      ? { customer: { ...customer }, customerId: "", customerConfirmed: true }
      : {}),
  };
}
