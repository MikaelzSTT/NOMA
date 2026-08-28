"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Clock3, Search, X } from "lucide-react";
import { formatMoney } from "@/lib/utils";

interface Suggestion {
  title: string;
  slug: string;
  sellingPrice: number | null;
  currency: string;
  images: Array<{ url: string }>;
}

const HISTORY_KEY = "vitrineo:recent-searches";

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]").slice(0, 5);
    } catch {
      return [];
    }
  });
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (response.ok) setSuggestions(await response.json());
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function remember(value: string) {
    const next = [value.trim(), ...history.filter((item) => item !== value.trim())].slice(0, 5);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <form
        action="/buscar"
        role="search"
        className="search-shell"
        onSubmit={() => query.trim() && remember(query)}
      >
        <Search size={20} className="shrink-0 text-muted" aria-hidden="true" />
        <input
          name="q"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) setSuggestions([]);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Busque por produto, marca ou categoria"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          aria-label="Buscar produtos"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="icon-button" aria-label="Limpar busca">
            <X size={17} aria-hidden="true" />
          </button>
        )}
        <button className="search-button" type="submit">Buscar</button>
      </form>

      {open && (suggestions.length > 0 || (!query && history.length > 0)) && (
        <div className="search-popover">
          {suggestions.length > 0 ? (
            <ul>
              {suggestions.map((item) => (
                <li key={item.slug}>
                  <a
                    href={`/produto/${item.slug}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface"
                    onClick={() => remember(item.title)}
                  >
                    <span className="relative size-11 shrink-0 overflow-hidden rounded-sm bg-surface">
                      {item.images[0] && (
                        <Image src={item.images[0].url} alt="" fill sizes="44px" className="object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{item.title}</span>
                      {item.sellingPrice != null && (
                        <span className="text-xs font-bold text-brand">{formatMoney(item.sellingPrice, item.currency)}</span>
                      )}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-2">
              <p className="px-3 py-2 text-xs font-bold uppercase text-muted">Buscas recentes</p>
              {history.map((item) => (
                <a key={item} href={`/buscar?q=${encodeURIComponent(item)}`} className="flex items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-surface">
                  <Clock3 size={15} className="text-muted" aria-hidden="true" /> {item}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
