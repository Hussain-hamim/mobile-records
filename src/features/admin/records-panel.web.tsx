import { AdminRecordPhotos } from "./record-photos.web";
import { useEffect, useRef, useState } from "react";
import type { Language } from "../../domain/models";
import { translate, type TextKey } from "../../i18n/strings";
import { printRecord } from "../../services/printing.web";
import { adminRequest } from "./api";
import type {
  AdminRecordDetail,
  AdminRecordsResult,
  AdminRecordScope,
} from "./types";
import { recordVersions } from "./record-versions";

function date(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kabul",
  }).format(new Date(value));
}
function fieldLabel(key: string) {
  try {
    return translate("en", key as TextKey);
  } catch {
    return key;
  }
}
function Fields({ title, values }: { title: string; values: object }) {
  return (
    <section className="ap-record-fields">
      <h3>{title}</h3>
      <dl>
        {Object.entries(values)
          .filter(([, value]) => value)
          .map(([key, value]) => (
            <div key={key}>
              <dt>{fieldLabel(key)}</dt>
              <dd dir="auto">{String(value)}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

export function RecordsPanel({
  scope,
  onClose,
}: {
  scope: AdminRecordScope;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const detailRequest = useRef(0);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [list, setList] = useState<AdminRecordsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AdminRecordDetail | null>(null);
  const [versionId, setVersionId] = useState("original");
  const [language, setLanguage] = useState<Language>("ps");
  const [gregorian, setGregorian] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const { shopId, userId } = scope;
  useEffect(() => {
    const element = dialog.current;
    const requests = detailRequest;
    element?.showModal();
    return () => {
      requests.current++;
      element?.close();
    };
  }, []);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setList(null);
      setError("");
      void adminRequest<AdminRecordsResult>("list-records", {
        shopId,
        ...(userId ? { userId } : {}),
        page,
        ...(direction ? { direction } : {}),
      })
        .then((result) => {
          if (current) setList(result);
        })
        .catch((e: Error) => {
          if (current) setError(e.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 0);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [shopId, userId, page, direction, refresh]);
  async function openRecord(recordId: string) {
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setDetail(null);
    setError("");
    try {
      const result = await adminRequest<AdminRecordDetail>("record-detail", {
        shopId,
        ...(userId ? { userId } : {}),
        recordId,
      });
      if (request !== detailRequest.current) return;
      setDetail(result);
      setVersionId(recordVersions(result).at(-1)!.id);
    } catch (e) {
      if (request === detailRequest.current) setError((e as Error).message);
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }
  const versions = detail ? recordVersions(detail) : [];
  const selected = versions.find((v) => v.id === versionId);
  const voided = detail?.amendments.some((event) => event.kind === "void");
  const back = () => {
    detailRequest.current++;
    setDetail(null);
    setDetailLoading(false);
    setError("");
  };
  async function print() {
    if (!selected || printing) return;
    setPrinting(true);
    setError("");
    try {
      // The admin has a separate session. Do not load attachments via the mobile account.
      await printRecord(
        selected.snapshot,
        language,
        gregorian,
        false,
        selected.annotation,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPrinting(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="ap-dialog ap-record-dialog"
      aria-labelledby="admin-records-title"
      onCancel={onClose}
    >
      <div className="ap-modal-head">
        <div>
          <span className="ap-overline">RECORDS · {scope.shopName}</span>
          <h2 id="admin-records-title">
            {scope.accountLabel
              ? `${scope.accountLabel} — records`
              : "All shop records"}
          </h2>
          <p>
            {scope.userId
              ? "Created by this account only."
              : "Created by all accounts in this shop."}{" "}
            Dates shown in Kabul time.
          </p>
        </div>
        <button
          className="ap-icon-btn"
          aria-label="Close records"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {error && (
        <div className="ap-error" role="alert">
          {error}
        </div>
      )}
      {detail || detailLoading ? (
        <>
          <button className="ap-secondary" onClick={back}>
            ← Back to records
          </button>
          {detailLoading ? (
            <p role="status">Opening record…</p>
          ) : detail && selected ? (
            <>
              <div className="ap-record-heading">
                <div>
                  <h2>{detail.record.reference}</h2>
                  <p>
                    {date(detail.record.occurredAt)} · Account{" "}
                    {detail.record.createdBy}
                  </p>
                </div>
                <span className={"ap-badge " + (voided ? "muted" : "")}>
                  {voided
                    ? "Voided"
                    : versions.length > 1
                      ? "Corrected"
                      : "Original"}
                </span>
              </div>
              <div className="ap-record-tools">
                <label>
                  Record version
                  <select
                    value={versionId}
                    onChange={(e) => setVersionId(e.target.value)}
                  >
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Print language
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as Language)}
                  >
                    <option value="ps">پښتو · Pashto</option>
                    <option value="fa">دری · Dari</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label>
                  Date format
                  <select
                    value={gregorian ? "gregorian" : "solar"}
                    onChange={(e) =>
                      setGregorian(e.target.value === "gregorian")
                    }
                  >
                    <option value="solar">Solar Hijri</option>
                    <option value="gregorian">Gregorian</option>
                  </select>
                </label>
                <button
                  className="ap-primary"
                  disabled={printing}
                  onClick={() => void print()}
                >
                  {printing ? "Preparing…" : "Print / Save PDF"}
                </button>
              </div>
              <p className="ap-record-note">
                Prints the saved form snapshot. Choose “Save as PDF” in the
                print dialog. The form template is still marked as a draft.
                Photo attachments are not included in this admin printout.
              </p>
              {voided && (
                <div className="ap-error">
                  This record is voided. All printed versions carry a VOIDED
                  label.
                </div>
              )}
              {selected.annotation && (
                <p className="ap-record-note">{selected.annotation}</p>
              )}
              <div className="ap-record-amount">
                <strong>
                  {selected.snapshot.direction === "buy"
                    ? "Shop purchase"
                    : "Shop sale"}
                </strong>
                <span>{selected.snapshot.price} AFN</span>
              </div>
              <AdminRecordPhotos
                key={detail.record.id}
                shopId={shopId}
                userId={userId}
                recordId={detail.record.id}
              />
              <div className="ap-record-grid">
                <Fields title="Customer" values={selected.snapshot.customer} />
                <Fields title="Phone" values={selected.snapshot.phone} />
                <Fields
                  title="Shop at transaction time"
                  values={selected.snapshot.shop}
                />
              </div>
              <section className="ap-record-history">
                <h3>Change history</h3>
                {detail.amendments.length ? (
                  <ol>
                    {detail.amendments.map((event) => (
                      <li key={event.id}>
                        <strong>
                          {event.kind === "void"
                            ? "Voided"
                            : event.kind === "photo"
                              ? "Photo updated"
                              : "Correction"}
                        </strong>{" "}
                        · {date(event.createdAt)}
                        <p>{event.reason}</p>
                        <small>By {event.createdBy}</small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>No changes. The original record is unchanged.</p>
                )}
              </section>
            </>
          ) : null}
        </>
      ) : (
        <>
          <div className="ap-record-tools">
            <label>
              Transaction
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  setPage(0);
                  setList(null);
                  setLoading(true);
                }}
              >
                <option value="">All purchases and sales</option>
                <option value="buy">Shop purchases</option>
                <option value="sell">Shop sales</option>
              </select>
            </label>
            <button
              className="ap-secondary"
              disabled={loading}
              onClick={() => setRefresh((v) => v + 1)}
            >
              Refresh records
            </button>
          </div>
          <div className="ap-table-wrap" aria-busy={loading}>
            <table>
              <thead>
                <tr>
                  <th>RECORD / DATE</th>
                  <th>CUSTOMER</th>
                  <th>PHONE / IMEI</th>
                  <th>TRANSACTION</th>
                  <th>AMOUNT</th>
                  <th>
                    <span className="ap-sr-only">Open record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list?.records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>{record.reference}</strong>
                      <small>{date(record.occurredAt)}</small>
                    </td>
                    <td dir="auto">{record.customerName}</td>
                    <td>
                      <strong>
                        {record.brand} {record.model}
                      </strong>
                      <small dir="ltr">{record.imei}</small>
                    </td>
                    <td>{record.direction === "buy" ? "Purchase" : "Sale"}</td>
                    <td>{record.price} AFN</td>
                    <td>
                      <button
                        className="ap-secondary"
                        aria-label={`View and print ${record.reference}`}
                        onClick={() => void openRecord(record.id)}
                      >
                        View & print
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!list?.records.length && (
              <div className="ap-empty" role="status">
                {loading
                  ? "Loading records…"
                  : error
                    ? "Could not load records. Try Refresh records."
                    : "No records for this account or filter yet."}
              </div>
            )}
          </div>
          <footer className="ap-table-footer">
            <span>
              {list?.total
                ? `${page * 20 + 1}–${Math.min((page + 1) * 20, list.total)} of ${list.total} records`
                : "No records to show"}
            </span>
            <div>
              <button
                disabled={loading || !page}
                onClick={() => {
                  setPage((p) => p - 1);
                  setList(null);
                  setLoading(true);
                }}
              >
                Previous
              </button>
              <button
                disabled={loading || (page + 1) * 20 >= (list?.total ?? 0)}
                onClick={() => {
                  setPage((p) => p + 1);
                  setList(null);
                  setLoading(true);
                }}
              >
                Next
              </button>
            </div>
          </footer>
        </>
      )}
    </dialog>
  );
}
