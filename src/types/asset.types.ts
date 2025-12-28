export interface AssetSchema {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document';
  data: string; // base64 or URL
  size?: number;
  createdAt?: number;
}
