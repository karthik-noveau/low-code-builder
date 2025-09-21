import React from "react";
import useDraftStore from "../stores/useDraftStore";
import JSZip from "jszip"; // Import JSZip

const TopBar = () => {
  const {
    undo,
    redo,
    history,
    pages,
    components,
    siteConfig,
    assets,
    clearDraft,
    activePageId,
  } = useDraftStore();
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const handleFinalSave = async () => {
    const zip = new JSZip();

    // Add pages.json
    zip.file("pages.json", JSON.stringify(pages, null, 2));

    // Add components.json
    zip.file("components.json", JSON.stringify(components, null, 2));

    // Add site-config.json
    zip.file("site-config.json", JSON.stringify(siteConfig, null, 2));

    // Add assets (base64 for MVP) - currently assets array is empty
    const assetsFolder = zip.folder("assets");
    assets.forEach((asset, index) => {
      // Assuming asset has a 'name' and 'data' (base64 string) property
      assetsFolder.file(asset.name || `asset-${index}.txt`, asset.data);
    });

    // Generate and download the zip file
    zip.generateAsync({ type: "blob" }).then((content) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = "website-builder-project.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      // Clear the draft after successful download
      clearDraft();
    });
  };

  return (
    <div
      style={{
        padding: "10px",
        borderBottom: "1px solid #ccc",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <button
          onClick={undo}
          disabled={!canUndo}
          style={{ marginRight: "10px" }}
        >
          Undo
        </button>
        <button onClick={redo} disabled={!canRedo}>
          Redo
        </button>
      </div>
      <div>
        <span>Device Preview (TODO)</span>
      
        {/* New Live Preview Button */}
        <button onClick={handleFinalSave}>Final Save</button>
      </div>
    </div>
  );
};

export default TopBar;
