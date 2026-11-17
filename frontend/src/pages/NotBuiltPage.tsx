import { BookNav } from '@/components/layout/BookNav';
import { PageHeader, PageMain } from '@/components/layout/PageMain';

/** 還沒做的畫面（T22–T27 補上）。 */
export function NotBuiltPage({ title, inBook = false }: Readonly<{ title: string; inBook?: boolean }>) {
  return (
    <>
      {inBook && <BookNav view={title} />}
      <PageMain>
        <PageHeader title={title} meta="這個畫面還在做。" />
      </PageMain>
    </>
  );
}
