import type {
  Amendment,
  Customer,
  Draft,
  Membership,
  Operation,
  ShopProfile,
  Transaction,
  FingerprintEntry,
  Person,
} from "../domain/models";
import type { Vault } from "./vault";
import { isShopProfileComplete } from "../domain/shop-profile";
import {
  digits,
  normalizeImei,
  validateDraft,
  validTazkiraNumber,
} from "../domain/validation";
import {
  draftFingerprints,
  fingerprintsOf,
  fingerprintChanges,
  validFingerprintSkip,
} from "../domain/fingerprints";
import {
  profileChanges,
  latestAmendment,
  isVoided,
  sameData,
} from "../domain/edit-policy";
type Change = { key: string; value: unknown | null };
export class Repository {
  private writes: Promise<unknown> = Promise.resolve();
  atomic<T>(work: () => Promise<T>): Promise<T> {
    const next = this.writes.catch(() => {}).then(work);
    this.writes = next;
    return next;
  }
  constructor(
    public vault: Vault,
    public membership: Membership,
    private uuid: () => string,
  ) {}
  records() {
    return this.vault.list<Transaction>("record:");
  }
  customers() {
    return this.vault.list<Customer>("customer:");
  }
  drafts() {
    return this.vault.list<Draft>("draft:");
  }
  operations() {
    return this.vault.list<Operation>("op:");
  }
  amendments() {
    return this.vault.list<Amendment>("amendment:");
  }
  saveDraft(draft: Draft) {
    return this.vault.batch([{ key: "draft:" + draft.id, value: draft }]);
  }
  discardDraft(id: string) {
    return this.atomic(async () => {
      if (await this.vault.get<Transaction>("record:" + id))
        throw new Error("noAccess");
      await this.vault.batch([{ key: "draft:" + id, value: null }]);
    });
  }
  async mutableOperation(
    kind: "customer" | "shop",
    payload: { id: string } & Record<string, unknown>,
    version: number,
  ): Promise<Change> {
    const existing = (await this.operations()).find(
      (o) => o.kind === kind && (o.payload as { id: string }).id === payload.id,
    );
    const op: Operation = {
      id: existing?.id ?? this.uuid(),
      kind,
      payload:
        kind === "customer"
          ? {
              ...payload,
              profileReason:
                payload.profileReason ??
                (existing?.payload as Record<string, unknown> | undefined)
                  ?.profileReason ??
                "",
              fingerprintReason:
                payload.fingerprintReason ??
                (existing?.payload as Record<string, unknown> | undefined)
                  ?.fingerprintReason ??
                "",
            }
          : payload,
      baseVersion: existing?.baseVersion ?? version,
      state: "pending",
    };
    return { key: "op:" + op.id, value: op };
  }
  saveProfile(profile: ShopProfile) {
    return this.atomic(() => this.writeProfile(profile));
  }
  private async writeProfile(profile: ShopProfile) {
    const op = await this.mutableOperation(
      "shop",
      { id: this.membership.shopId, profile },
      this.membership.version,
    );
    await this.vault.batch([{ key: "profile", value: profile }, op]);
    this.membership.profile = profile;
  }
  saveCustomer(
    customerId: string,
    person: Person,
    reason: string,
    expectedVersion: number,
    expectedPerson: Person,
  ) {
    return this.atomic(async () => {
      const current = await this.vault.get<Customer>("customer:" + customerId);
      if (
        !current ||
        current.version !== expectedVersion ||
        !sameData(current.person, expectedPerson)
      )
        throw new Error("conflict");
      if (!person.name.trim() || !person.idNumber.trim())
        throw new Error("requiredFields");
      if (
        (person.idNumber !== current.person.idNumber ||
          person.idType !== current.person.idType) &&
        !validTazkiraNumber(person.idNumber, person.idType ?? "enid")
      )
        throw new Error(
          person.idType === "pnid" ? "invalidPnid" : "invalidEnid",
        );
      const event = profileChanges(
        current.person,
        person,
        this.membership,
        reason,
        new Date().toISOString(),
      );
      if (!event) return;
      const customer = {
        ...current,
        person,
        profileAudit: [...(current.profileAudit ?? []), event],
      };
      await this.vault.batch([
        { key: "customer:" + customerId, value: customer },
        await this.mutableOperation(
          "customer",
          {
            id: customerId,
            person,
            fingerprints: fingerprintsOf(current),
            profileReason: reason,
          },
          current.version,
        ),
      ]);
    });
  }
  saveFingerprints(
    customerId: string,
    entries: FingerprintEntry[],
    reason: string,
    expectedVersion: number,
  ) {
    return this.atomic(async () => {
      const current = await this.vault.get<Customer>("customer:" + customerId);
      if (!current || current.version !== expectedVersion)
        throw new Error("conflict");
      const audit = fingerprintChanges(
        fingerprintsOf(current),
        entries,
        this.membership,
        reason,
        new Date().toISOString(),
      );
      const customer: Customer = {
        ...current,
        fingerprintTemplate: undefined,
        fingerprints: entries,
        fingerprintAudit: [...(current.fingerprintAudit ?? []), ...audit],
      };
      await this.vault.batch([
        { key: "customer:" + customerId, value: customer },
        await this.mutableOperation(
          "customer",
          {
            id: customerId,
            person: customer.person,
            fingerprints: entries,
            fingerprintReason: reason,
          },
          customer.version,
        ),
      ]);
      return customer;
    });
  }
  finalize(draft: Draft) {
    return this.atomic(() => this.writeFinalized(draft));
  }
  private async writeFinalized(draft: Draft) {
    const errors = validateDraft(draft);
    if (errors.length) throw new Error(errors[0]);
    if (!isShopProfileComplete(this.membership.profile))
      throw new Error("shopRequired");
    // Draft ID is the record ID: repeat taps/recovery cannot create a second record.
    const prior = await this.vault.get<Transaction>("record:" + draft.id);
    if (prior) return prior;
    const id = draft.id;
    const customerId = draft.customerId || this.uuid();
    const previous = await this.vault.get<Customer>("customer:" + customerId);
    const now = new Date().toISOString();
    const before = fingerprintsOf(previous);
    const fingerprints = draftFingerprints(draft, previous).map((f) =>
      before.some((old) => old.id === f.id)
        ? f
        : {
            ...f,
            enrolledBy: this.membership.userId,
            enrolledAt: f.enrolledAt ?? now,
          },
    );
    const audit = fingerprintChanges(
      before,
      fingerprints,
      this.membership,
      "",
      now,
    );
    if (previous)
      profileChanges(
        previous.person,
        draft.customer,
        this.membership,
        "Transaction details",
        now,
      );
    const customer: Customer = {
      ...previous,
      id: customerId,
      person: { ...(previous?.person ?? draft.customer) },
      fingerprints,
      fingerprintAudit: [...(previous?.fingerprintAudit ?? []), ...audit],
      version: previous?.version ?? 0,
    };
    const record: Transaction = {
      id,
      reference: "MR-" + id.replace(/-/g, "").slice(0, 12).toUpperCase(),
      shopId: this.membership.shopId,
      createdBy: this.membership.userId,
      direction: draft.direction,
      phone: {
        ...draft.phone,
        imei1: normalizeImei(draft.phone.imei1),
        imei2: normalizeImei(draft.phone.imei2),
      },
      customer: { ...draft.customer },
      customerId,
      shop: { ...this.membership.profile },
      price: digits(draft.price),
      currency: "AFN",
      occurredAt: now,
      ...(!fingerprints.length && validFingerprintSkip(draft.fingerprintSkip)
        ? {
            fingerprintSkip: {
              ...draft.fingerprintSkip!,
              at: now,
              by: this.membership.userId,
            },
          }
        : {}),
      templateVersion: "draft-v1",
      syncState: "pending",
    };
    const operation: Operation = {
      id: this.uuid(),
      kind: "record",
      payload: record,
      baseVersion: 0,
      state: "pending",
    };
    await this.vault.batch([
      { key: "record:" + id, value: record },
      { key: "customer:" + customerId, value: customer },
      await this.mutableOperation(
        "customer",
        {
          id: customerId,
          person: customer.person,
          fingerprints,
        },
        customer.version,
      ),
      { key: "op:" + operation.id, value: operation },
      { key: "draft:" + draft.id, value: null },
    ]);
    return this.vault.storage === "cloud"
      ? { ...record, syncState: "synced" as const }
      : record;
  }
  amend(
    record: Transaction,
    reason: string,
    previousAmendmentId?: string | null,
    kind: Amendment["kind"] = "correction",
    photoChange?: Amendment["photoChange"],
  ) {
    return this.atomic(() =>
      this.writeAmendment(
        record,
        reason,
        previousAmendmentId,
        kind,
        photoChange,
      ),
    );
  }
  private async writeAmendment(
    record: Transaction,
    reason: string,
    previousAmendmentId: string | null | undefined,
    kind: Amendment["kind"],
    photoChange?: Amendment["photoChange"],
  ) {
    if (
      this.membership.role !== "owner" ||
      !reason.trim() ||
      reason.length > 500
    )
      throw new Error("requiredFields");
    const original = await this.vault.get<Transaction>("record:" + record.id);
    if (!original) throw new Error("noAccess");
    const history = await this.amendments();
    const latest = latestAmendment(history, record.id);
    if ((previousAmendmentId ?? null) !== (latest?.id ?? null))
      throw new Error("conflict");
    if (isVoided(history, record.id)) throw new Error("recordVoided");
    for (const key of [
      "id",
      "reference",
      "shopId",
      "createdBy",
      "customerId",
      "occurredAt",
      "currency",
      "templateVersion",
    ] as const) {
      if (record[key] !== original[key]) throw new Error("noAccess");
    }
    if (
      kind !== "correction" &&
      !sameData(
        { ...record, syncState: undefined },
        { ...original, syncState: undefined },
      )
    )
      throw new Error("noAccess");
    const errors = validateDraft({
      id: record.id,
      direction: record.direction,
      phone: record.phone,
      customer: record.customer,
      customerId: record.customerId,
      customerConfirmed: true,
      price: record.price,
      step: 2,
      createdAt: record.occurredAt,
    });
    if (errors.length) throw new Error(errors[0]);
    const amendment: Amendment = {
      kind,
      previousAmendmentId: previousAmendmentId ?? null,
      ...(photoChange ? { photoChange } : {}),
      id: this.uuid(),
      recordId: record.id,
      reason,
      snapshot: record,
      createdAt: new Date().toISOString(),
      createdBy: this.membership.userId,
      syncState: "pending",
    };
    const op: Operation = {
      id: this.uuid(),
      kind: "amendment",
      payload: amendment,
      baseVersion: 0,
      state: "pending",
    };
    await this.vault.batch([
      { key: "amendment:" + amendment.id, value: amendment },
      { key: "op:" + op.id, value: op },
    ]);
  }
}
export interface SyncTransport {
  checkAccess(): Promise<void>;
  push(op: Operation): Promise<{ version: number }>;
  pull(): Promise<{
    records: Transaction[];
    customers: Customer[];
    amendments: Amendment[];
    profile: ShopProfile;
    version: number;
  }>;
}
export async function synchronize(repo: Repository, transport: SyncTransport) {
  await transport.checkAccess();
  for (const operation of await repo.operations()) {
    if (operation.state === "conflict") continue;
    try {
      const result = await transport.push(operation);
      await repo.atomic(async () => {
        const current = await repo.vault.get<Operation>("op:" + operation.id);
        const changed =
          current &&
          JSON.stringify(current.payload) !== JSON.stringify(operation.payload);
        const updates: Change[] = [
          {
            key: "op:" + operation.id,
            value: changed
              ? {
                  ...current,
                  id: current.id,
                  baseVersion: result.version,
                  state: "pending",
                }
              : null,
          },
        ];
        // A changed payload needs a new idempotency key after acknowledging its predecessor.
        if (changed) {
          const nextId = operation.id + "-next";
          updates[0].value = null;
          updates.push({
            key: "op:" + nextId,
            value: {
              ...current,
              id: nextId,
              baseVersion: result.version,
              state: "pending",
            },
          });
        }
        const p = operation.payload as { id: string };
        if (operation.kind === "record" || operation.kind === "amendment") {
          const key = operation.kind + ":" + p.id;
          const local = await repo.vault.get<Record<string, unknown>>(key);
          if (local)
            updates.push({ key, value: { ...local, syncState: "synced" } });
        }
        if (operation.kind === "customer") {
          const local = await repo.vault.get<Customer>("customer:" + p.id);
          if (local)
            updates.push({
              key: "customer:" + p.id,
              value: { ...local, version: result.version },
            });
        }
        await repo.vault.batch(updates);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("noAccess")) throw error;
      const state = message.includes("conflict") ? "conflict" : "failed";
      await repo.atomic(async () => {
        const latest = await repo.vault.get<Operation>("op:" + operation.id);
        await repo.vault.batch([
          {
            key: "op:" + operation.id,
            value: { ...(latest ?? operation), state, error: message },
          },
        ]);
      });
    }
  }
  const remote = await transport.pull();
  await repo.atomic(async () => {
    const pending = await repo.operations();
    const dirtyCustomers = new Set(
      pending
        .filter((o) => o.kind === "customer")
        .map((o) => (o.payload as Customer).id),
    );
    const changes: Change[] = [
      ...remote.records.map((record) => ({
        key: "record:" + record.id,
        value: { ...record, syncState: "synced" },
      })),
      ...remote.customers
        .filter((c) => !dirtyCustomers.has(c.id))
        .map((c) => ({ key: "customer:" + c.id, value: c })),
      ...remote.amendments.map((a) => ({
        key: "amendment:" + a.id,
        value: { ...a, syncState: "synced" },
      })),
    ];
    if (!pending.some((o) => o.kind === "shop")) {
      changes.push({ key: "profile", value: remote.profile });
      repo.membership.profile = remote.profile;
      repo.membership.version = remote.version;
    }
    await repo.vault.batch(changes);
  });
}
