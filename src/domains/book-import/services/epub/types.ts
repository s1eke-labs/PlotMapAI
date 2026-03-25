import type JSZip from 'jszip';

export interface ChapterImageRef {
  imageKey: string;
  blob: Blob;
}

export interface GuideReference {
  href: string;
  title: string;
}

export interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
  properties: string;
}

export interface OpfMetadata {
  author: string;
  coverId: string;
  description: string;
  tags: string[];
  title: string;
}

export interface OpfPackage {
  guideReferences: GuideReference[];
  manifest: Map<string, ManifestItem>;
  metadata: OpfMetadata;
  opfDir: string;
  opfPath: string;
  spineIds: string[];
  spineTocId: string;
  zip: JSZip;
}
