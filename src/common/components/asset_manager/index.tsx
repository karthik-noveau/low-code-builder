import { useState } from 'react';
import { useDraftStore } from '../../../stores';
import { useToast } from '../toast_container';
import type { AssetSchema } from '../../../types';
import styles from './style.module.css';

interface AssetManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAsset?: (asset: AssetSchema) => void;
}

export const AssetManager = ({ isOpen, onClose, onSelectAsset }: AssetManagerProps) => {
  const { assets } = useDraftStore();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const fileCount = files.length;
    let processedCount = 0;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const newAsset: AssetSchema = {
          id: `asset-${Date.now()}-${Math.random()}`,
          name: file.name,
          data: reader.result as string,
          type: file.type.startsWith('image/') ? 'image' : 'document',
          size: file.size,
        };
        useDraftStore.getState().addAsset(newAsset);
        processedCount++;

        if (processedCount === fileCount) {
          setUploading(false);
          toast.success(`${fileCount} asset${fileCount > 1 ? 's' : ''} uploaded successfully`);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDeleteAsset = (assetId: string) => {
    useDraftStore.getState().deleteAsset(assetId);
    toast.success('Asset deleted successfully');
  };

  const handleAssetClick = (asset: AssetSchema) => {
    if (onSelectAsset) {
      onSelectAsset(asset);
      onClose();
    }
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>Asset Manager</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            Close
          </button>
        </div>

        <div className={styles.uploadSection}>
          <label htmlFor="file-upload" className={styles.uploadBtn}>
            {uploading ? 'Uploading...' : 'Upload Image'}
          </label>
          <input
            id="file-upload"
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className={styles.fileInput}
            disabled={uploading}
          />
        </div>

        <div className={styles.assetsGrid}>
          {assets.length === 0 ? (
            <p className={styles.emptyMessage}>
              No assets uploaded yet. Upload images to get started.
            </p>
          ) : (
            assets.map(asset => (
              <div
                key={asset.id}
                className={styles.assetItem}
                onClick={() => handleAssetClick(asset)}
              >
                {asset.type === 'image' ? (
                  <img
                    src={asset.data}
                    alt={asset.name}
                    className={styles.assetImage}
                  />
                ) : (
                  <div className={styles.assetPlaceholder}>File</div>
                )}
                <p className={styles.assetName}>{asset.name}</p>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleDeleteAsset(asset.id);
                  }}
                  className={styles.deleteBtn}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
