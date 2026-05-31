import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { midiToNoteName } from "../game/music";
import { readMusicXmlFile } from "../score/musicxml";
import { scoreNotesToMusicXmlPreview } from "../score/musicxmlExport";
import type { ScoreNote } from "../score/types";

type ScorePreviewProps = {
  title?: string;
  sourceBlob?: Blob;
  notes: ScoreNote[];
  currentNote: ScoreNote | null;
  currentNoteIndex: number | null;
};

export function ScorePreview({ title = "Violin preview", sourceBlob, notes, currentNote, currentNoteIndex }: ScorePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorIndexRef = useRef<number | null>(null);
  const generatedCursorStepsRef = useRef<Map<string, number> | null>(null);
  const [message, setMessage] = useState("");
  const [isRendered, setIsRendered] = useState(false);

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    osmdRef.current = null;
    cursorIndexRef.current = null;
    generatedCursorStepsRef.current = null;
    setIsRendered(false);
    if (!sourceBlob) {
      setMessage("");
      return;
    }

    setMessage("Rendering notation preview...");
    renderPreview(container, sourceBlob)
      .then((osmd) => {
        if (!disposed) {
          osmdRef.current = osmd;
          setIsRendered(true);
          setMessage("");
        }
      })
      .catch((error) => {
        console.error("Notation preview failed to render from extracted MusicXML.", error);
        if (disposed || notes.length === 0) {
          if (!disposed) {
            setMessage(`Notation preview failed to render: ${errorMessage(error)}`);
          }
          return;
        }

        const fallbackPreview = scoreNotesToMusicXmlPreview(title, notes);
        generatedCursorStepsRef.current = fallbackPreview.cursorStepsByNoteId;
        container.innerHTML = "";
        renderPreview(container, fallbackPreview.blob)
          .then((osmd) => {
            if (!disposed) {
              osmdRef.current = osmd;
              setIsRendered(true);
              setMessage("Showing a simplified violin-only preview because the extracted notation could not render.");
            }
          })
          .catch((fallbackError) => {
            console.error("Fallback notation preview failed to render.", fallbackError);
            if (!disposed) {
              setMessage(`Notation preview failed to render: ${errorMessage(error)}`);
            }
          });
      });

    return () => {
      disposed = true;
      osmdRef.current?.cursor?.hide();
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [notes, sourceBlob, title]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const container = containerRef.current;
    if (!osmd || !container || !isRendered) {
      return;
    }

    if (currentNoteIndex === null || !currentNote) {
      osmd.cursor?.hide();
      cursorIndexRef.current = null;
      return;
    }

    const targetCursorStep = cursorStepForNote(currentNote, currentNoteIndex, generatedCursorStepsRef.current);
    try {
      osmd.cursor.reset();
      osmd.cursor.show();
      for (let index = 0; index < targetCursorStep; index += 1) {
        osmd.cursor.next();
      }
      osmd.cursor.update();
      scrollPreviewToCursor(container, osmd.cursor.cursorElement, targetCursorStep);
      cursorIndexRef.current = targetCursorStep;
    } catch {
      scrollPreviewProportionally(container, targetCursorStep);
      cursorIndexRef.current = null;
    }
  }, [currentNote, currentNoteIndex, isRendered]);

  return (
    <section className="panel score-preview">
      <div className="score-preview-header">
        <p className="eyebrow">Score preview</p>
        <div className="current-note-pill">
          {currentNote ? `Current note: ${midiToNoteName(currentNote.pitchMidi)}` : "No current note"}
        </div>
      </div>
      {message && <p className="status-line">{message}</p>}
      <div ref={containerRef} className="notation-host" />
    </section>
  );
}

async function renderPreview(container: HTMLElement, sourceBlob: Blob): Promise<OpenSheetMusicDisplay> {
  const { xmlText } = await readMusicXmlFile(sourceBlob);
  const osmd = new OpenSheetMusicDisplay(container, {
    autoResize: true,
    backend: "svg",
    drawTitle: false,
    drawPartNames: false,
    drawPartAbbreviations: false,
    cursorsOptions: [{ type: 0, color: "#f72585", alpha: 0.55, follow: true }],
  });

  await osmd.load(xmlText);
  osmd.render();
  return osmd;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown renderer error";
}

function cursorStepForNote(
  note: ScoreNote,
  fallbackNoteIndex: number,
  generatedCursorStepsByNoteId: Map<string, number> | null,
): number {
  return generatedCursorStepsByNoteId?.get(note.id) ?? note.cursorStep ?? fallbackNoteIndex;
}

function scrollPreviewToCursor(container: HTMLElement, cursorElement: HTMLElement | null, currentNoteIndex: number) {
  if (!cursorElement) {
    scrollPreviewProportionally(container, currentNoteIndex);
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const cursorRect = cursorElement.getBoundingClientRect();
  const nextLeft = container.scrollLeft + cursorRect.left - containerRect.left - container.clientWidth * 0.35;
  const nextTop = container.scrollTop + cursorRect.top - containerRect.top - container.clientHeight * 0.45;

  container.scrollTo({
    left: Math.max(0, nextLeft),
    top: Math.max(0, nextTop),
    behavior: "smooth",
  });
}

function scrollPreviewProportionally(container: HTMLElement, currentNoteIndex: number) {
  const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const progress = Math.min(1, currentNoteIndex / 64);

  container.scrollTo({
    left: maxScrollLeft * progress,
    top: maxScrollTop * progress,
    behavior: "smooth",
  });
}
