import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Draft } from "../domain/models";
import {
  applyPurchasedPhone,
  assertPurchaseSource,
  confirmSaleHistory,
  phoneImeis,
  wouldReplacePhone,
  type PurchasedPhone,
} from "../domain/purchased-phones";
import { useApp } from "./app-context";
import { useShopQuery } from "./use-shop-query";
import { errorText } from "../components/ui";

type Confirmation = {
  kind: "replace" | "sold";
  reference?: string;
  answer: (yes: boolean) => void;
};
export function useSalePurchase(
  draft: Draft,
  setDraft: Dispatch<SetStateAction<Draft>>,
  preset?: string,
) {
  const app = useApp();
  const [picking, setPicking] = useState(false);
  const [candidate, setCandidate] = useState<PurchasedPhone | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retryId, setRetryId] = useState<string>();
  const active = useRef(0);
  const pending = useRef<((yes: boolean) => void) | null>(null);
  const current = useRef(draft);
  useEffect(() => {
    current.current = draft;
  }, [draft]);
  const cancel = useCallback(() => {
    active.current++;
    pending.current?.(false);
    pending.current = null;
    setConfirmation(null);
    setBusy(false);
  }, []);
  const invalidate = useCallback(() => {
    cancel();
    setCandidate(null);
    setError("");
    setRetryId(undefined);
  }, [cancel]);
  useEffect(
    () => () => {
      active.current++;
      pending.current?.(false);
    },
    [app.membership?.shopId, app.membership?.userId],
  );
  function ask(kind: Confirmation["kind"], reference?: string) {
    return new Promise<boolean>((resolve) => {
      pending.current?.(false);
      const answer = (yes: boolean) => {
        pending.current = null;
        setConfirmation(null);
        resolve(yes);
      };
      pending.current = answer;
      setConfirmation({ kind, reference, answer });
    });
  }
  async function choose(id: string) {
    const request = ++active.current;
    const baseline = JSON.stringify(current.current.phone);
    const valid = () =>
      request === active.current &&
      current.current.direction === "sell" &&
      JSON.stringify(current.current.phone) === baseline;
    setBusy(true);
    setError("");
    setRetryId(id);
    try {
      const item = (
        await app.queries!.purchasedPhones({
          purchaseId: id,
          includeSold: true,
        })
      ).items[0];
      if (!valid()) return;
      if (!item?.purchase) throw new Error("purchaseUnavailable");
      if (
        wouldReplacePhone(current.current.phone, item.purchase.phone) &&
        !(await ask("replace"))
      )
        return;
      if (!valid()) return;
      if (
        item.latest.direction === "sell" &&
        !(await ask("sold", item.latest.reference))
      )
        return;
      if (!valid()) return;
      setDraft((d) => applyPurchasedPhone(d, item));
      setCandidate(null);
      setPicking(false);
      setRetryId(undefined);
    } catch (e) {
      if (valid()) setError(errorText(e, app.t));
    } finally {
      if (request === active.current) setBusy(false);
    }
  }
  const start = useRef(choose);
  useEffect(() => {
    start.current = choose;
  });
  const presetUsed = useRef("");
  useEffect(() => {
    if (preset && app.queries && !presetUsed.current) {
      presetUsed.current = preset;
      void start.current(preset);
    }
  }, [preset, app.queries]);
  const source = useShopQuery(
    () => app.queries!.record(draft.sourcePurchaseId!),
    `${app.membership?.shopId}:${app.dataVersion}:${draft.sourcePurchaseId}`,
    !!app.queries && !!draft.sourcePurchaseId && draft.direction === "sell",
  );
  /** A new check for every save attempt. Confirmation does not survive edits/reloads. */
  async function beforeSave(ready: Draft): Promise<boolean> {
    if (ready.direction !== "sell") return true;
    const request = ++active.current;
    const baseline = JSON.stringify(ready.phone);
    const valid = () =>
      request === active.current &&
      current.current.direction === "sell" &&
      JSON.stringify(current.current.phone) === baseline;
    const check = async () => {
      const result = await app.queries!.purchasedPhones({
        imeis: phoneImeis(ready.phone),
        includeSold: true,
      });
      if (ready.sourcePurchaseId) {
        const source = await app.queries!.record(ready.sourcePurchaseId);
        assertPurchaseSource(
          ready,
          source?.record ?? null,
          source?.amendments ?? [],
          app.membership!.shopId,
        );
      }
      return result.items;
    };
    return confirmSaleHistory(
      check,
      (references) => ask("sold", references),
      valid,
    );
  }

  return {
    picking,
    setPicking,
    candidate,
    setCandidate,
    confirmation,
    busy,
    error,
    retryId,
    choose,
    cancel,
    invalidate,
    beforeSave,
    source,
  };
}
