import { useEffect, useRef, useState } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";

type ScorePreviewProps = {
  sourceBlob?: Blob;
};

export function ScorePreview({ sourceBlob }: ScorePreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [message, setMessage] = useState("Upload MusicXML/MXL to see notation preview.");

  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = "";
    if (!sourceBlob) {
      setMessage("MIDI files can still drive the game, but notation preview needs MusicXML/MXL.");
      return;
    }

    setMessage("Rendering notation preview...");
    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: "svg",
      drawTitle: false,
    });

    osmd
      .load(sourceBlob)
      .then(() => {
        if (!disposed) {
          osmd.render();
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
      container.innerHTML = "";
    };
  }, [sourceBlob]);

  return (
    <section className="panel score-preview">
      <p className="eyebrow">Score preview</p>
      {message && <p className="status-line">{message}</p>}
      <div ref={containerRef} className="notation-host" />
    </section>
  );
}
