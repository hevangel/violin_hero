import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import { midiToNoteName } from "../game/music";
import type { ScoreNote } from "../score/types";

type ScorePreviewProps = {
  sourceBlob?: Blob;
  currentNote: ScoreNote | null;
  currentNoteIndex: number | null;
};

export function ScorePreview({ sourceBlob, currentNote, currentNoteIndex }: ScorePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const cursorIndexRef = useRef<number | null>(null);
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
    setIsRendered(false);
    if (!sourceBlob) {
      setMessage("");
      return;
    }

    setMessage("Rendering notation preview...");
    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: "svg",
      drawTitle: false,
      drawPartNames: false,
      drawPartAbbreviations: false,
      cursorsOptions: [{ type: 0, color: "#f72585", alpha: 0.55, follow: true }],
    });

    osmd
      .load(sourceBlob)
      .then(() => {
        if (!disposed) {
          osmd.render();
          osmdRef.current = osmd;
          setIsRendered(true);
          setMessage("");
        }
      })
      .catch(() => {
        if (!disposed) {
          setMessage("The game can use this score, but notation preview failed to render.");
        }
      });

    return () => {
      disposed = true;
      osmdRef.current?.cursor?.hide();
      osmdRef.current = null;
      container.innerHTML = "";
    };
  }, [sourceBlob]);

  useEffect(() => {
    const osmd = osmdRef.current;
    const container = containerRef.current;
    if (!osmd || !container || !isRendered) {
      return;
    }

    if (currentNoteIndex === null) {
      osmd.cursor?.hide();
      cursorIndexRef.current = null;
      return;
    }

    try {
      osmd.cursor.reset();
      osmd.cursor.show();
      for (let index = 0; index < currentNoteIndex; index += 1) {
        osmd.cursor.next();
      }
      osmd.cursor.update();
      scrollPreviewToCursor(container, osmd.cursor.cursorElement, currentNoteIndex);
      cursorIndexRef.current = currentNoteIndex;
    } catch {
      scrollPreviewProportionally(container, currentNoteIndex);
      cursorIndexRef.current = null;
    }
  }, [currentNoteIndex, isRendered]);

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
