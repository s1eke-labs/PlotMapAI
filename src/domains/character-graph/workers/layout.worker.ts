import { registerWorkerTaskHandlers } from '@infra/workers';
import type { GraphLayoutPayload } from './layoutClient';
import { buildSpaciousLayout } from '../utils/characterGraphLayout';

registerWorkerTaskHandlers({
  'graph-layout': async (payload, emitProgress, signal) => {
    const request = payload as GraphLayoutPayload;
    return buildSpaciousLayout(request.nodes, request.edges, {
      signal,
      onProgress: (progress) => emitProgress({ progress, stage: 'layout' }),
    });
  },
});
