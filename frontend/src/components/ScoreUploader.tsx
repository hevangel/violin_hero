import { useState } from "react";

type ScoreUploaderProps = {
  isLoading: boolean;
  status: string;
  onUpload: (file: File) => void;
};

export function ScoreUploader({ isLoading, status, onUpload }: ScoreUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  function uploadFirstFile(files: FileList | null) {
    const file = files?.[0];
    if (file && !isLoading) {
      onUpload(file);
    }
  }

  return (
    <section className="panel upload-panel">
      <div>
        <h2>Upload a violin score</h2>
        <p>
          Use MusicXML/MXL or MIDI for the fastest path. PDF and image files are sent to the local OMR
          backend and converted through Audiveris.
        </p>
      </div>

      <label
        className={isDragging ? "file-drop dragging" : "file-drop"}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          uploadFirstFile(event.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept=".musicxml,.xml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg,.webp"
          disabled={isLoading}
          onChange={(event) => {
            uploadFirstFile(event.target.files);
            event.currentTarget.value = "";
          }}
        />
        <span>{isLoading ? "Reading score..." : isDragging ? "Drop score file here" : "Choose or drop score file"}</span>
      </label>

      <p className="status-line">{status}</p>
    </section>
  );
}
