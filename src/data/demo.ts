import {
  emptyPerson,
  emptyShop,
  emptyPhone,
  type Membership,
  type Draft,
} from "../domain/models";
import type { Repository } from "./repository";
import type { Vault } from "./vault";

/** Preserve an already-open memory demo when this update arrives via Fast Refresh. */
export async function persistDemoSession(
  repo: Repository,
  open: () => Promise<Vault>,
) {
  await repo.atomic(async () => {
    if (repo.vault.storage === "sqlite") return;
    const previous = repo.vault;
    const changes: { key: string; value: unknown }[] = [];
    for (const prefix of [
      "customer:",
      "record:",
      "draft:",
      "amendment:",
      "op:",
    ]) {
      for (const item of await previous.list<{ id: string }>(prefix))
        changes.push({ key: prefix + item.id, value: item });
    }
    changes.push({ key: "profile", value: repo.membership.profile });
    changes.push({ key: "demo-initialized", value: true });
    const next = await open();
    try {
      await next.batch(changes);
    } catch (error) {
      await next.close();
      throw error;
    }
    repo.vault = next;
    await previous.close();
  });
}

export function demoMembership(): Membership {
  return {
    shopId: "demo-shop",
    userId: "demo-user",
    role: "owner",
    version: 1,
    profile: {
      ...emptyShop(),
      shopName: "Kabul Mobile",
      name: "Ahmad",
      address: "Kabul, Afghanistan",
      licenceNumber: "DEMO-001",
      shopNumber: "24",
    },
  };
}

/** Seed once; re-entering demo must never replace saved customers or scans. */
export async function ensureDemoData(repo: Repository, uuid: () => string) {
  if (await repo.vault.get("demo-initialized")) return;
  // Also preserve existing databases created before the seed marker existed.
  if (!(await repo.customers()).length && !(await repo.records()).length) {
    for (const [i, direction] of (["sell", "buy", "buy"] as const).entries()) {
      const draft: Draft = {
        id: uuid(),
        direction,
        phone: {
          ...emptyPhone(),
          brand: ["Apple", "Samsung", "Apple"][i],
          model: ["iPhone 13", "Galaxy A54", "iPhone 12"][i],
          imei1: "490154203237518",
          storage: "128 GB",
          color: ["Midnight", "Graphite", "Blue"][i],
        },
        customer: {
          ...emptyPerson(),
          name: ["Farid Ahmad", "Zahra Karimi", "Omid Rahimi"][i],
          idNumber: "0000-0000-0000" + (i + 1),
          phone: "+9370000000" + i,
        },
        customerId: "",
        customerConfirmed: true,
        fingerprintSkip: {
          reason: "readerUnavailable",
          note: "Demo presentation",
        },
        price: ["32500", "18500", "24000"][i],
        createdAt: new Date().toISOString(),
        step: 0,
      };
      await repo.finalize(draft);
    }
  }
  await repo.vault.batch([{ key: "demo-initialized", value: true }]);
}
