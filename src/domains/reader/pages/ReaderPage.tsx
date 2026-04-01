import { useParams } from 'react-router-dom';

import ReaderPageContainer from './reader-page/ReaderPageContainer';
import { ReaderPageProvider } from './reader-page/ReaderPageContext';

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>();
  const novelId = Number(id);

  return (
    <ReaderPageProvider novelId={novelId}>
      <ReaderPageContainer />
    </ReaderPageProvider>
  );
}
