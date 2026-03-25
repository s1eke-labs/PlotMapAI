import type JSZip from 'jszip';
import { findElements, getAttribute } from './markup';
import { parseOpfMetadata } from './metadata';
import type { GuideReference, ManifestItem, OpfPackage } from './types';

export function resolveOpfPath(opfDir: string, path: string): string {
  const cleanPath = path.split('#')[0];
  if (opfDir) return `${opfDir}/${cleanPath}`;
  return cleanPath;
}

async function getOpfPath(zip: JSZip): Promise<string> {
  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) throw new Error('META-INF/container.xml not found');
  const containerXml = await containerFile.async('text');
  const rootfile = findElements(containerXml, 'rootfile')[0];
  if (!rootfile) throw new Error('No rootfile element in container.xml');
  const path = getAttribute(rootfile.attributes, 'full-path');
  if (!path) throw new Error('No full-path attribute in rootfile');
  return path;
}

function getManifest(opfXml: string): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();
  const manifestMarkup = findElements(opfXml, 'manifest')[0]?.innerContent || '';
  for (const element of findElements(manifestMarkup, 'item')) {
    const id = getAttribute(element.attributes, 'id');
    const href = getAttribute(element.attributes, 'href');
    const mediaType = getAttribute(element.attributes, 'media-type');
    const properties = getAttribute(element.attributes, 'properties');
    if (id && href) items.set(id, { id, href, mediaType, properties });
  }
  return items;
}

function getSpineData(opfXml: string): { spineIds: string[]; spineTocId: string } {
  const spine = findElements(opfXml, 'spine')[0];
  if (!spine) {
    return { spineIds: [], spineTocId: '' };
  }

  const spineIds = findElements(spine.innerContent, 'itemref')
    .map((element) => getAttribute(element.attributes, 'idref'))
    .filter(Boolean);

  return {
    spineIds,
    spineTocId: getAttribute(spine.attributes, 'toc'),
  };
}

function getGuideReferences(opfXml: string): GuideReference[] {
  const guideMarkup = findElements(opfXml, 'guide')[0]?.innerContent || '';
  return findElements(guideMarkup, 'reference')
    .map((element) => ({
      href: getAttribute(element.attributes, 'href').split('#')[0],
      title: getAttribute(element.attributes, 'title'),
    }))
    .filter((reference) => Boolean(reference.href) && Boolean(reference.title));
}

export async function loadOpfPackage(zip: JSZip): Promise<OpfPackage> {
  const opfPath = await getOpfPath(zip);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const opfFile = zip.file(opfPath);
  if (!opfFile) throw new Error(`OPF file not found: ${opfPath}`);
  const opfXml = await opfFile.async('text');
  const { spineIds, spineTocId } = getSpineData(opfXml);
  return {
    guideReferences: getGuideReferences(opfXml),
    manifest: getManifest(opfXml),
    metadata: parseOpfMetadata(opfXml),
    opfDir,
    opfPath,
    spineIds,
    spineTocId,
    zip,
  };
}
