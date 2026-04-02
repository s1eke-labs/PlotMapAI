import { useParams } from 'react-router-dom';

import { analyzeChapter } from '@application/use-cases/analysis';
import { appPaths } from '@app/router/paths';
import { ChapterAnalysisPanel, analysisService } from '@domains/analysis';
import {
  ReaderPageContainer,
  ReaderProvider,
  type ReaderAnalysisBridgeController,
} from '@domains/reader';

const readerAnalysisController: ReaderAnalysisBridgeController = {
  analyzeChapter,
  getChapterAnalysis: analysisService.getChapterAnalysis,
  getStatus: analysisService.getStatus,
  renderSummaryPanel: ({
    analysis,
    isAnalyzingChapter,
    isLoading,
    job,
    novelId,
    onAnalyzeChapter,
  }) => (
    <ChapterAnalysisPanel
      analysis={analysis}
      job={job}
      isLoading={isLoading}
      onAnalyzeChapter={onAnalyzeChapter}
      isAnalyzingChapter={isAnalyzingChapter}
      progressHref={appPaths.novel(novelId)}
      settingsHref={appPaths.settings()}
    />
  ),
};

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  return (
    <ReaderProvider novelId={novelId}>
      <ReaderPageContainer
        novelId={novelId}
        novelDetailHref={appPaths.novel(novelId)}
        analysisController={readerAnalysisController}
      />
    </ReaderProvider>
  );
}
