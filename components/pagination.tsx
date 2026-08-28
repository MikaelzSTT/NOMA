import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildPageUrl, type RawSearchParams } from "@/lib/search-params";

export function Pagination({ pathname, raw, current, total }: { pathname: string; raw: RawSearchParams; current: number; total: number }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === total || Math.abs(page - current) <= 2,
  );
  return (
    <nav className="pagination" aria-label="Paginacao">
      <Link href={buildPageUrl(pathname, raw, Math.max(1, current - 1))} aria-disabled={current === 1} className="page-button"><ChevronLeft size={17} /></Link>
      {pages.map((page, index) => (
        <span key={page} className="contents">
          {index > 0 && page - pages[index - 1] > 1 && <span className="px-1 text-muted">...</span>}
          <Link href={buildPageUrl(pathname, raw, page)} aria-current={page === current ? "page" : undefined} className="page-button">{page}</Link>
        </span>
      ))}
      <Link href={buildPageUrl(pathname, raw, Math.min(total, current + 1))} aria-disabled={current === total} className="page-button"><ChevronRight size={17} /></Link>
    </nav>
  );
}
