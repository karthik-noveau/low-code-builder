import type { TemplateId } from "../src/studio/model";
export interface Site {
  pk: string;
  sk: string;
  id: string;
  owner: string;
  name: string;
  template?: TemplateId;
  version: number;
  createdAt: string;
  updatedAt: string;
  checksum?: string;
  draftKey?: string;
  status:
    "draft" | "queued" | "publishing" | "published" | "unpublished" | "failed";
  job?: Job;
  lockedUntil?: number;
  lastPublishAt?: number;
  error?: string;
  publishedRelease?: string;
  publishedAt?: string;
  primaryDomain?: string;
  domainUrl?: string;
}
export interface Job {
  id: string;
  owner: string;
  siteId: string;
  action: "publish" | "rollback" | "unpublish";
  draftKey?: string;
  version: number;
  releaseId?: string;
  createdAt: number;
}
export interface Release {
  pk: string;
  sk: string;
  id: string;
  owner: string;
  siteId: string;
  version: number;
  createdAt: string;
  files: string[];
  compilerVersion?: number;
  commerceChecksum?: string;
}
export function publicSite(site: Site, origin: string) {
  return {
    id: site.id,
    name: site.name,
    template: site.template,
    version: site.version,
    checksum: site.checksum,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
    status: site.status,
    error: site.error,
    publishedRelease: site.publishedRelease,
    publishedAt: site.publishedAt,
    primaryDomain: site.primaryDomain,
    defaultUrl: site.publishedRelease
      ? `${origin}/sites/${site.id}/`
      : undefined,
    url: site.publishedRelease
      ? site.domainUrl || `${origin}/sites/${site.id}/`
      : undefined,
  };
}
