import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, GitBranch, Loader2, Share2, Sparkles, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { analysisApi } from '../api/analysis';
import type { CharacterGraphNode, CharacterGraphResponse } from '../api/analysis';
import { novelsApi } from '../api/novels';
import type { Novel } from '../api/novels';

type LayoutNode = CharacterGraphNode & {
  x: number;
  y: number;
  radius: number;
};

export default function CharacterGraphPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  const [novel, setNovel] = useState<Novel | null>(null);
  const [graph, setGraph] = useState<CharacterGraphResponse | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!Number.isFinite(novelId) || novelId <= 0) {
      setError(t('characterGraph.loadError'));
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const [novelData, graphData] = await Promise.all([
        novelsApi.get(novelId),
        analysisApi.getCharacterGraph(novelId),
      ]);
      setNovel(novelData);
      setGraph(graphData);
      setSelectedNodeId((current) => (
        current && graphData.nodes.some((node) => node.id === current)
          ? current
          : graphData.nodes[0]?.id ?? null
      ));
    } catch (err: any) {
      setError(err.message || t('characterGraph.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [novelId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const layoutNodes = useMemo(() => buildGraphLayout(graph?.nodes ?? []), [graph?.nodes]);
  const positionMap = useMemo(() => new Map(layoutNodes.map((node) => [node.id, node])), [layoutNodes]);
  const selectedNode = useMemo(
    () => layoutNodes.find((node) => node.id === selectedNodeId) ?? layoutNodes[0] ?? null,
    [layoutNodes, selectedNodeId],
  );

  const relatedEdges = useMemo(() => {
    if (!selectedNode || !graph) return [];
    return graph.edges
      .filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id)
      .sort((a, b) => b.weight - a.weight || b.mentionCount - a.mentionCount);
  }, [graph, selectedNode]);

  const relatedNodeIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedNode) return ids;
    ids.add(selectedNode.id);
    relatedEdges.forEach((edge) => {
      ids.add(edge.source);
      ids.add(edge.target);
    });
    return ids;
  }, [relatedEdges, selectedNode]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !novel || !graph) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
        <p className="text-red-400">{error || t('characterGraph.loadError')}</p>
        <Link to={novelId > 0 ? `/novel/${novelId}` : '/'} className="text-accent hover:text-accent-hover underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          {t('characterGraph.backToBook')}
        </Link>
      </div>
    );
  }

  const hasGraphData = graph.meta.hasData;

  return (
    <div className="flex-1 flex flex-col p-6 max-w-7xl mx-auto w-full gap-6">
      <Link to={`/novel/${novel.id}`} className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" />
        <span>{t('characterGraph.backToBook')}</span>
      </Link>

      <div className="glass rounded-2xl p-6 md:p-8 space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent text-sm font-semibold mb-3">
              <Share2 className="w-4 h-4" />
              <span>{t('bookDetail.characterGraphEntry')}</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-text-primary tracking-tight">{novel.title}</h1>
            <p className="text-text-secondary mt-3 max-w-3xl leading-7">{t('characterGraph.subtitle')}</p>
          </div>

          <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
            <div className="px-4 py-2 rounded-xl border border-border-color/20 bg-muted-bg/60">
              {t('characterGraph.metaChapters', {
                done: graph.meta.analyzedChapters,
                total: graph.meta.totalChapters,
              })}
            </div>
            <div className="px-4 py-2 rounded-xl border border-border-color/20 bg-muted-bg/60">
              {t('characterGraph.metaCharacters', { count: graph.meta.nodeCount })}
            </div>
            <div className="px-4 py-2 rounded-xl border border-border-color/20 bg-muted-bg/60">
              {t('characterGraph.metaRelationships', { count: graph.meta.edgeCount })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <span className={`px-3 py-1.5 rounded-full border ${graph.meta.isComplete ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'}`}>
            {graph.meta.isComplete ? t('characterGraph.metaComplete') : t('characterGraph.metaPartial')}
          </span>
          <span className={`px-3 py-1.5 rounded-full border ${graph.meta.hasOverview ? 'border-accent/30 bg-accent/10 text-accent' : 'border-border-color/20 bg-muted-bg/60 text-text-secondary'}`}>
            {graph.meta.hasOverview ? t('characterGraph.overviewHint') : t('characterGraph.partialHint')}
          </span>
          {graph.meta.generatedAt && (
            <span className="px-3 py-1.5 rounded-full border border-border-color/20 bg-muted-bg/60 text-text-secondary">
              {t('characterGraph.metaGeneratedAt', { time: new Date(graph.meta.generatedAt).toLocaleString() })}
            </span>
          )}
        </div>

        {!hasGraphData ? (
          <div className="rounded-2xl border border-dashed border-border-color/30 bg-muted-bg/50 p-8 text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-accent" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-text-primary">{t('characterGraph.empty')}</h2>
              <p className="text-text-secondary max-w-2xl mx-auto leading-7">{t('characterGraph.emptyHint')}</p>
            </div>
            <Link to={`/novel/${novel.id}`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-accent hover:bg-accent-hover text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              {t('characterGraph.openBookDetail')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
            <div className="rounded-2xl border border-border-color/20 bg-muted-bg/40 p-5 space-y-4 min-w-0">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{t('characterGraph.title')}</h2>
                  <p className="text-sm text-text-secondary mt-1">{t('characterGraph.canvasHint')}</p>
                </div>
                <div className="space-y-1 text-xs text-text-secondary">
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-accent inline-block" />{t('characterGraph.legendCore')}</div>
                  <div className="flex items-center gap-2"><span className="w-6 h-px bg-accent inline-block" />{t('characterGraph.legendRelation')}</div>
                </div>
              </div>

              <div className="aspect-[4/3] rounded-2xl border border-border-color/20 bg-[#050816]/80 overflow-hidden">
                <svg viewBox="0 0 820 620" className="w-full h-full">
                  <defs>
                    <radialGradient id="graph-core-node" cx="50%" cy="50%" r="65%">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.95" />
                      <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.95" />
                    </radialGradient>
                    <radialGradient id="graph-side-node" cx="50%" cy="50%" r="65%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.85" />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.8" />
                    </radialGradient>
                  </defs>

                  {(graph.edges || []).map((edge, index) => {
                    const source = positionMap.get(edge.source);
                    const target = positionMap.get(edge.target);
                    if (!source || !target) return null;

                    const isHighlighted = !selectedNode || edge.source === selectedNode.id || edge.target === selectedNode.id;
                    const opacity = selectedNode ? (isHighlighted ? 0.8 : 0.12) : 0.4;
                    const strokeWidth = Math.max(1.4, Math.min(5.5, 1 + edge.weight / 20));
                    const labelX = (source.x + target.x) / 2;
                    const labelY = (source.y + target.y) / 2;

                    return (
                      <g key={edge.id}>
                        <line
                          x1={source.x}
                          y1={source.y}
                          x2={target.x}
                          y2={target.y}
                          stroke={isHighlighted ? '#8b5cf6' : '#64748b'}
                          strokeOpacity={opacity}
                          strokeWidth={strokeWidth}
                        />
                        {selectedNode && isHighlighted && index < 10 && (
                          <text
                            x={labelX}
                            y={labelY - 6}
                            fill="rgba(226,232,240,0.85)"
                            fontSize="11"
                            textAnchor="middle"
                          >
                            {edge.type}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {layoutNodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id;
                    const isRelated = !selectedNode || relatedNodeIds.has(node.id);
                    const labelOpacity = isSelected || node.isCore ? 1 : 0.88;

                    return (
                      <g
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className="cursor-pointer"
                        style={{ opacity: selectedNode ? (isRelated ? 1 : 0.22) : 1 }}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={node.radius + (isSelected ? 7 : 0)}
                          fill="rgba(139,92,246,0.12)"
                          stroke={isSelected ? '#f8fafc' : 'transparent'}
                          strokeWidth={isSelected ? 2 : 0}
                        />
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={node.radius}
                          fill={node.isCore ? 'url(#graph-core-node)' : 'url(#graph-side-node)'}
                          stroke={node.isCore ? '#c4b5fd' : '#7dd3fc'}
                          strokeWidth={isSelected ? 3 : 1.5}
                        />
                        <text x={node.x} y={node.y - 3} fill="#f8fafc" fontSize={Math.max(11, Math.min(16, node.radius / 1.9))} fontWeight="700" textAnchor="middle" opacity={labelOpacity}>
                          {node.name}
                        </text>
                        <text x={node.x} y={node.y + 14} fill="rgba(241,245,249,0.9)" fontSize="10" textAnchor="middle" opacity={node.isCore || isSelected ? 0.95 : 0.65}>
                          {node.sharePercent > 0 ? `${node.sharePercent.toFixed(1)}%` : t('characterGraph.weight', { weight: node.weight.toFixed(0) })}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-3">{t('characterGraph.selectCharacter')}</p>
                <div className="flex flex-wrap gap-2">
                  {layoutNodes.map((node) => {
                    const isActive = node.id === selectedNode?.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${isActive ? 'border-accent/40 bg-accent/15 text-accent' : 'border-border-color/20 bg-card-bg/40 text-text-secondary hover:text-text-primary hover:border-border-color/40'}`}
                      >
                        {node.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border-color/20 bg-muted-bg/40 p-5 space-y-5">
              {selectedNode ? (
                <>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-text-primary">
                          <Users className="w-4 h-4 text-accent" />
                          <h2 className="text-xl font-semibold">{selectedNode.name}</h2>
                        </div>
                        <p className="text-sm text-text-secondary mt-2">{selectedNode.role || t('characterGraph.noRole')}</p>
                      </div>
                      {selectedNode.isCore && (
                        <span className="px-3 py-1 rounded-full text-xs font-semibold border border-accent/30 bg-accent/10 text-accent">
                          {t('characterGraph.coreTag')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-7 text-text-primary/90">{selectedNode.description || t('characterGraph.descriptionEmpty')}</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border-color/20 bg-card-bg/40 p-4">
                      <p className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-2">{t('characterGraph.sharePercentLabel')}</p>
                      <p className="text-lg font-semibold text-text-primary">{selectedNode.sharePercent.toFixed(2)}%</p>
                    </div>
                    <div className="rounded-xl border border-border-color/20 bg-card-bg/40 p-4">
                      <p className="text-xs uppercase tracking-wider text-text-secondary font-semibold mb-2">{t('characterGraph.chapterCoverageLabel')}</p>
                      <p className="text-lg font-semibold text-text-primary">{selectedNode.chapterCount}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border-color/20 bg-card-bg/40 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-text-primary font-semibold">
                      <Sparkles className="w-4 h-4 text-accent" />
                      {t('characterGraph.chapters')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedNode.chapters.length > 0 ? selectedNode.chapters.map((chapterIndex) => (
                        <span key={chapterIndex} className="px-3 py-1.5 rounded-full border border-border-color/20 bg-muted-bg/70 text-sm text-text-secondary">
                          {t('characterGraph.chapterIndex', { index: chapterIndex + 1 })}
                        </span>
                      )) : (
                        <span className="text-sm text-text-secondary">{t('characterGraph.relationshipsEmpty')}</span>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border-color/20 bg-card-bg/40 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-text-primary font-semibold">
                      <GitBranch className="w-4 h-4 text-accent" />
                      {t('characterGraph.relatedRelationships')}
                    </div>
                    {relatedEdges.length > 0 ? (
                      <div className="space-y-3">
                        {relatedEdges.map((edge) => {
                          const counterpart = edge.source === selectedNode.id ? edge.target : edge.source;
                          return (
                            <div key={edge.id} className="rounded-xl border border-border-color/20 bg-muted-bg/50 p-3 space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-text-primary font-medium">{selectedNode.name} · {counterpart}</p>
                                  <p className="text-sm text-text-secondary">{edge.type || t('characterGraph.relationTypeFallback')}</p>
                                </div>
                                <div className="text-right text-xs text-text-secondary space-y-1">
                                  <p>{t('characterGraph.mentions', { count: edge.mentionCount })}</p>
                                  <p>{t('characterGraph.relationshipChapterCount', { count: edge.chapterCount })}</p>
                                </div>
                              </div>
                              {edge.description && <p className="text-sm text-text-primary/90 leading-6">{edge.description}</p>}
                              {edge.chapters.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {edge.chapters.map((chapterIndex) => (
                                    <span key={`${edge.id}-${chapterIndex}`} className="px-2.5 py-1 rounded-full bg-black/15 text-xs text-text-secondary border border-border-color/20">
                                      {t('characterGraph.chapterIndex', { index: chapterIndex + 1 })}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-border-color/30 bg-muted-bg/50 px-4 py-6 text-sm text-text-secondary text-center">
                        {t('characterGraph.relationshipsEmpty')}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-dashed border-border-color/30 bg-muted-bg/50 px-4 py-8 text-sm text-text-secondary text-center">
                  {t('characterGraph.empty')}
                </div>
              )}
            </div>
          </div>
        )}

        {!graph.meta.isComplete && hasGraphData && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100 flex gap-3">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t('characterGraph.partialHint')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function buildGraphLayout(nodes: CharacterGraphNode[]): LayoutNode[] {
  if (nodes.length === 0) {
    return [];
  }

  const centerX = 410;
  const centerY = 310;
  const maxRadius = 52;
  const minRadius = 26;
  const [centerNode, ...restNodes] = nodes;
  const layout: LayoutNode[] = [
    {
      ...centerNode,
      x: centerX,
      y: centerY,
      radius: getNodeRadius(centerNode, minRadius + 12, maxRadius),
    },
  ];

  if (restNodes.length === 0) {
    return layout;
  }

  const rings = splitIntoRings(restNodes);
  rings.forEach((ring, ringIndex) => {
    const radius = 185 + ringIndex * 95;
    const angleOffset = ringIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + 0.32;
    ring.forEach((node, index) => {
      const angle = angleOffset + (index / ring.length) * Math.PI * 2;
      layout.push({
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        radius: getNodeRadius(node, minRadius, maxRadius - ringIndex * 6),
      });
    });
  });

  return layout;
}

function splitIntoRings(nodes: CharacterGraphNode[]): CharacterGraphNode[][] {
  if (nodes.length <= 8) {
    return [nodes];
  }
  if (nodes.length <= 14) {
    return [nodes.slice(0, 8), nodes.slice(8)];
  }
  return [nodes.slice(0, 8), nodes.slice(8, 14), nodes.slice(14)];
}

function getNodeRadius(node: CharacterGraphNode, minRadius: number, maxRadius: number): number {
  const score = node.sharePercent > 0 ? node.sharePercent : node.weight;
  const normalized = Math.max(0, Math.min(score / 30, 1));
  return Number((minRadius + (maxRadius - minRadius) * normalized).toFixed(2));
}
