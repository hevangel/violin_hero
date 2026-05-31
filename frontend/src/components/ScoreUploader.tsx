type ScoreUploaderProps = {
  isLoading: boolean;
  status: string;
  onUpload: (file: File) => void;
};

export function ScoreUploader({ isLoading, status, onUpload }: ScoreUploaderProps) {
  return (
    <section className="panel upload-panel">
      <div>
        <p className="eyebrow">Step 1</p>
        <h2>Upload a violin score</h2>
        <p>
          Use MusicXML/MXL or MIDI for the fastest path. PDF and image files are sent to the local OMR
          backend and converted through Audiveris.
        </p>
      </div>

      <label className="file-drop">
        <input
          type="file"
          accept=".musicxml,.xml,.mxl,.mid,.midi,.pdf,.png,.jpg,.jpeg,.webp"
          disabled={isLoading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onUpload(file);
              event.currentTarget.value = "";
            }
          }}
        />
        <span>{isLoading ? "Reading score..." : "Choose score file"}</span>
      </label>

      <p className="status-line">{status}</p>
    </section>
  );
}
