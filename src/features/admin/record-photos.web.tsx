import { useEffect, useState } from "react";
import { adminRequest } from "./api";

interface AdminPhoto {
  id: string;
  slot: "person" | "idFront";
  uploadedAt: string | null;
  url: string;
}
export function AdminRecordPhotos({
  shopId,
  userId,
  recordId,
}: {
  shopId: string;
  userId?: string;
  recordId: string;
}) {
  const [photos, setPhotos] = useState<AdminPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      setPhotos([]);
      setFailed([]);
      setExpanded(null);
      void adminRequest<{ photos: AdminPhoto[] }>("record-photos", {
        shopId,
        recordId,
        ...(userId ? { userId } : {}),
      })
        .then((result) => {
          if (active) setPhotos(result.photos);
        })
        .catch((e: Error) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [shopId, userId, recordId, revision]);
  function refresh() {
    setPhotos([]);
    setLoading(true);
    setRevision((v) => v + 1);
  }
  return (
    <section className="ap-record-photos" aria-labelledby="admin-photos-title">
      <div className="ap-record-heading">
        <div>
          <h3 id="admin-photos-title">Record photos</h3>
          <p>Current uploaded photos. Click an image to enlarge it.</p>
        </div>
        <button className="ap-secondary" disabled={loading} onClick={refresh}>
          Refresh photos
        </button>
      </div>
      {loading ? (
        <p role="status">Loading photos…</p>
      ) : error ? (
        <div className="ap-error" role="alert">
          {error}
        </div>
      ) : (
        <>
          {!photos.length && (
            <p className="ap-record-note">
              No photos have been uploaded for this record. Photos saved only on
              a phone are not available here. Enable online storage for the
              shop, then upload them from the app.
            </p>
          )}
          <div className="ap-admin-photo-grid">
            {(["person", "idFront"] as const).map((slot) => {
              const photo = photos.find((p) => p.slot === slot);
              const label =
                slot === "person" ? "Customer photo" : "Tazkira — front";
              const large = expanded === slot;
              return (
                <figure
                  key={slot}
                  className={
                    large ? "ap-admin-photo expanded" : "ap-admin-photo"
                  }
                >
                  <figcaption>{label}</figcaption>
                  {photo ? (
                    failed.includes(photo.id) ? (
                      <div className="ap-photo-empty" role="status">
                        The photo could not load or its link expired. Use
                        Refresh photos to try again.
                      </div>
                    ) : (
                      <button
                        className="ap-photo-preview"
                        aria-label={`${large ? "Reduce" : "Enlarge"} ${label}`}
                        aria-expanded={large}
                        onClick={() => setExpanded(large ? null : slot)}
                      >
                        <img
                          src={photo.url}
                          alt={label}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailed((ids) =>
                              ids.includes(photo.id) ? ids : [...ids, photo.id],
                            )
                          }
                        />
                        <span>{large ? "Show smaller" : "Enlarge photo"}</span>
                      </button>
                    )
                  ) : (
                    <div className="ap-photo-empty">No uploaded photo</div>
                  )}
                </figure>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
