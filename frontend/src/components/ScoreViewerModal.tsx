import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { readMusicXmlFile } from "../score/musicxml";
import { scoreNotesToMusicXmlPreview } from "../score/musicxmlExport";
import type { UploadedSong } from "../score/uploadedSongs";

type ScoreViewerModalProps = {
  song: UploadedSong;
  onClose: () => void;
  onRename: (song: UploadedSong, title: string) => Promise<void>;
};

type ViewerMode = "rendered" | "original" | "metadata";

type MusicXmlMetadata = {
  title?: string;
  workTitle?: string;
  movementTitle?: string;
  credits: string[];
  parts: Array<{
    id: string;
    name?: string;
    abbreviation?: string;
    instruments: string[];
    midiNames: string[];
  }>;
  omrHints?: UploadedSong["omrHints"];
};

const scan_extensions = /\.(pdf|png|jpe?g|webp)$/i;

export function ScoreViewerModal({ song, onClose, onRename }: ScoreViewerModalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("rendered");
  const [message, setMessage] = useState("");
  const [metadata, setMetadata] = useState<MusicXmlMetadata | null>(null);
  const [metadataMessage, setMetadataMessage] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(song.title);
  const originalUrl = useObjectUrl(song.originalBlob);
  const isScanUpload = isOriginalScan(song);
  const hasOriginalScan = Boolean(song.originalBlob && isScanUpload);

  useEffect(() => {
    setDraftTitle(song.title);
    setViewerMode("rendered");
    setMetadata(null);
    setMetadataMessage("");
  }, [song]);

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    osmdRef.current = null;
    if (viewerMode !== "rendered") {
      setMessage("");
      return;
    }

    if (!song.sourceBlob && song.notes.length === 0) {
      setMessage("Rendered notation is not available for this saved upload.");
      return;
    }

    setMessage("Rendering score...");
    const sourceBlob = song.sourceBlob ?? scoreNotesToMusicXmlPreview(song.title, song.notes).blob;
    renderViewerScore(container, sourceBlob)
      .then((osmd) => {
        if (!disposed) {
          osmdRef.current = osmd;
          setMessage("");
        }
      })
      .catch((error) => {
        console.error("Score viewer failed to render extracted MusicXML.", error);
        if (disposed || song.notes.length === 0) {
          if (!disposed) {
            setMessage(`The rendered score could not be displayed: ${errorMessage(error)}`);
          }
          return;
        }

        const fallbackPreview = scoreNotesToMusicXmlPreview(song.title, song.notes);
        container.innerHTML = "";
        renderViewerScore(container, fallbackPreview.blob)
          .then((osmd) => {
            if (!disposed) {
              osmdRef.current = osmd;
              setMessage("Showing a simplified rendered score because the extracted notation could not render.");
            }
          })
          .catch((fallbackError) => {
            console.error("Score viewer fallback failed to render.", fallbackError);
            if (!disposed) {
              setMessage(`The rendered score could not be displayed: ${errorMessage(error)}`);
            }
          });
      });

    return () => {
      disposed = true;
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [song, viewerMode]);

  useEffect(() => {
    let disposed = false;
    if (viewerMode !== "metadata") {
      return;
    }

    const metadataBlob = song.extractionBlob ?? song.sourceBlob;
    if (!metadataBlob) {
      setMetadata(null);
      setMetadataMessage("MusicXML metadata is not available for this saved score.");
      return;
    }

    setMetadataMessage("Reading MusicXML metadata...");
    readMusicXmlFile(metadataBlob)
      .then(({ xmlText }) => {
        if (disposed) {
          return;
        }

        setMetadata(readMusicXmlMetadata(xmlText, song));
        setMetadataMessage("");
      })
      .catch(() => {
        if (!disposed) {
          setMetadata(null);
          setMetadataMessage("The extracted MusicXML metadata could not be read.");
        }
      });

    return () => {
      disposed = true;
    };
  }, [song, viewerMode]);

  async function saveTitle() {
    const nextTitle = draftTitle.trim();
    if (!nextTitle || nextTitle === song.title) {
      setDraftTitle(song.title);
      setIsRenaming(false);
      return;
    }

    try {
      await onRename(song, nextTitle);
      setIsRenaming(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not rename this saved score.");
    }
  }

  return (
    <div className="viewer-backdrop" role="dialog" aria-modal="true" aria-label={`View ${song.title}`}>
      <section className="panel score-viewer">
        <div className="viewer-header">
          <div className="viewer-title-block">
            {isRenaming ? (
              <input
                className="title-input"
                value={draftTitle}
                autoFocus
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={() => void saveTitle()}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void saveTitle();
                  }
                  if (event.key === "Escape") {
                    setDraftTitle(song.title);
                    setIsRenaming(false);
                  }
                }}
              />
            ) : (
              <button type="button" className="viewer-title" onClick={() => setIsRenaming(true)}>
                {song.title}
              </button>
            )}
            <span>{song.originalFileName}</span>
          </div>

          <div className="viewer-actions">
            <div className="toggle-row" role="group" aria-label="Score view mode">
              <button
                type="button"
                className={viewerMode === "rendered" ? "tab-button active" : "tab-button"}
                onClick={() => setViewerMode("rendered")}
              >
                Rendered score
              </button>
              {isScanUpload ? (
                <button
                  type="button"
                  className={viewerMode === "original" ? "tab-button active" : "tab-button"}
                  disabled={!hasOriginalScan}
                  onClick={() => setViewerMode("original")}
                  title={hasOriginalScan ? "View the original uploaded scan" : "Re-upload this score to save the original scan"}
                >
                  Original scan
                </button>
              ) : null}
              <button
                type="button"
                className={viewerMode === "metadata" ? "tab-button active" : "tab-button"}
                onClick={() => setViewerMode("metadata")}
              >
                MusicXML metadata
              </button>
            </div>
            <button type="button" className="secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {isScanUpload && !hasOriginalScan ? (
          <p className="status-line">
            This scan was saved before original uploads were kept. Re-upload the PDF or image to enable original scan view.
          </p>
        ) : null}
        {message && <p className="status-line">{message}</p>}
        {viewerMode === "rendered" ? (
          <div ref={containerRef} className="viewer-notation-host" />
        ) : viewerMode === "original" ? (
          <OriginalUploadView song={song} objectUrl={originalUrl} />
        ) : (
          <MetadataView metadata={metadata} message={metadataMessage} />
        )}
      </section>
    </div>
  );
}

function MetadataView({ metadata, message }: { metadata: MusicXmlMetadata | null; message: string }) {
  if (message) {
    return <div className="empty-library">{message}</div>;
  }

  if (!metadata) {
    return <div className="empty-library">No MusicXML metadata loaded.</div>;
  }

  return (
    <div className="metadata-panel">
      <section>
        <h3>Detected Title</h3>
        <pre>{metadata.title ?? "No title detected"}</pre>
      </section>
      <section>
        <h3>MusicXML Credits</h3>
        <pre>{metadata.credits.length ? metadata.credits.join("\n") : "No credits found"}</pre>
      </section>
      <section>
        <h3>Parts</h3>
        <pre>{JSON.stringify(metadata.parts, null, 2)}</pre>
      </section>
      <section>
        <h3>RapidOCR Hints</h3>
        <pre>{rapidOcrHintText(metadata)}</pre>
      </section>
    </div>
  );
}

function rapidOcrHintText(metadata: MusicXmlMetadata): string {
  if (metadata.omrHints && Object.keys(metadata.omrHints).length > 0) {
    return JSON.stringify(metadata.omrHints, null, 2);
  }

  return "No useful RapidOCR hints were saved for this extraction.";
}

function OriginalUploadView({ song, objectUrl }: { song: UploadedSong; objectUrl: string | null }) {
  if (!objectUrl) {
    return <div className="empty-library">Original upload is not available for this saved score.</div>;
  }

  if (isPdf(song)) {
    return <iframe className="original-frame" title={song.originalFileName} src={objectUrl} />;
  }

  return <img className="original-scan" src={objectUrl} alt={song.originalFileName} />;
}

async function renderViewerScore(container: HTMLElement, sourceBlob: Blob): Promise<OpenSheetMusicDisplay> {
  const { xmlText } = await readMusicXmlFile(sourceBlob);
  const osmd = new OpenSheetMusicDisplay(container, {
    autoResize: true,
    backend: "svg",
    drawTitle: true,
    drawPartNames: true,
    drawPartAbbreviations: true,
  });

  await osmd.load(xmlText);
  osmd.render();
  return osmd;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown renderer error";
}

function useObjectUrl(blob?: Blob): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);

  return url;
}

function readMusicXmlMetadata(xmlText: string, song: UploadedSong): MusicXmlMetadata {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const workTitle = textContent(doc.querySelector("work-title"));
  const movementTitle = textContent(doc.querySelector("movement-title"));
  return {
    title: movementTitle ?? workTitle ?? song.title,
    workTitle: workTitle ?? undefined,
    movementTitle: movementTitle ?? undefined,
    credits: Array.from(doc.querySelectorAll("credit")).flatMap((credit) =>
      Array.from(credit.querySelectorAll("credit-words"))
        .map((word) => textContent(word))
        .filter((word): word is string => Boolean(word)),
    ),
    parts: Array.from(doc.querySelectorAll("part-list score-part")).map((scorePart) => ({
      id: scorePart.getAttribute("id") ?? "",
      name: textContent(scorePart.querySelector("part-name")) ?? undefined,
      abbreviation: textContent(scorePart.querySelector("part-abbreviation")) ?? undefined,
      instruments: Array.from(scorePart.querySelectorAll("score-instrument instrument-name"))
        .map((instrument) => textContent(instrument))
        .filter((instrument): instrument is string => Boolean(instrument)),
      midiNames: Array.from(scorePart.querySelectorAll("midi-instrument midi-name"))
        .map((midiName) => textContent(midiName))
        .filter((midiName): midiName is string => Boolean(midiName)),
    })),
    omrHints: song.omrHints,
  };
}

function textContent(element: Element | null): string | null {
  const value = element?.textContent?.replace(/\s+/g, " ").trim();
  return value ? value : null;
}

function isOriginalScan(song: UploadedSong): boolean {
  return Boolean(song.originalMimeType?.startsWith("image/") || song.originalMimeType === "application/pdf" || scan_extensions.test(song.originalFileName));
}

function isPdf(song: UploadedSong): boolean {
  return song.originalMimeType === "application/pdf" || /\.pdf$/i.test(song.originalFileName);
}
