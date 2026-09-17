"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { GripVertical, ImageOff, LoaderCircle, Upload, X } from "lucide-react";
import {
  PRODUCT_IMAGE_ACCEPT_ATTRIBUTE,
  PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES,
  PRODUCT_IMAGE_MULTIPART_THRESHOLD_BYTES,
  PRODUCT_IMAGE_UPLOAD_ENDPOINT,
  formatProductImageBytes,
  isAcceptedProductImageType,
  productImageBlobPathname,
} from "@/lib/product-image-upload";

const maxImages = 30;

type UploadStatus = "ready" | "uploading" | "error";

interface ImageItem {
  id: string;
  url: string;
  previewUrl: string;
  status: UploadStatus;
  error?: string;
  uploadedThisSession?: boolean;
}

export function ProductImageManager({ initialImages, required = false }: { initialImages: string[]; required?: boolean }) {
  const [items, setItems] = useState<ImageItem[]>(() => initialImages.map((url) => createUrlItem(url)));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const imagesText = useMemo(() => items.filter((item) => item.status === "ready").map((item) => item.url).join("\n"), [items]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  function updateImagesText(value: string) {
    revokeLocalPreviews(items);
    setItems(value.split(/\r?\n/).map((imageUrl) => imageUrl.trim()).filter(Boolean).map(createUrlItem));
    setError("");
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const currentCount = items.length;
    const selected = Array.from(files);
    if (currentCount + selected.length > maxImages) {
      setError(`Você pode cadastrar no máximo ${maxImages} imagens por produto.`);
      return;
    }

    const validFiles: File[] = [];
    const errors: string[] = [];
    for (const file of selected) {
      if (!isAcceptedProductImageType(file.type)) {
        errors.push(`${file.name}: use JPG, JPEG, PNG ou WebP.`);
        continue;
      }
      if (file.size > PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES) {
        errors.push(`${file.name}: tamanho máximo de ${formatProductImageBytes(PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES)}.`);
        continue;
      }
      validFiles.push(file);
    }

    if (errors.length) setError(errors.join(" "));
    if (!validFiles.length) return;

    const pendingItems = validFiles.map((file) => ({
      id: crypto.randomUUID(),
      url: "",
      previewUrl: URL.createObjectURL(file),
      status: "uploading" as const,
    }));
    setItems((current) => [...current, ...pendingItems]);

    await Promise.all(pendingItems.map(async (item, index) => {
      const file = validFiles[index];
      try {
        const blob = await upload(blobPathname(file.name), file, {
          access: "public",
          contentType: file.type,
          handleUploadUrl: PRODUCT_IMAGE_UPLOAD_ENDPOINT,
          multipart: file.size > PRODUCT_IMAGE_MULTIPART_THRESHOLD_BYTES,
        });
        setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, url: blob.url, previewUrl: blob.url, status: "ready", uploadedThisSession: true } : currentItem));
        URL.revokeObjectURL(item.previewUrl);
      } catch {
        setItems((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, status: "error", error: "Não foi possível enviar esta imagem. Verifique o storage e tente novamente." } : currentItem));
      }
    }));

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeImage(id: string) {
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl.startsWith("blob:")) URL.revokeObjectURL(removed.previewUrl);
      if (removed?.uploadedThisSession && removed.url) void deleteUploadedBlob(removed.url);
      return current.filter((item) => item.id !== id);
    });
  }

  function moveImage(fromId: string, toId: string) {
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === fromId);
      const toIndex = current.findIndex((item) => item.id === toId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function moveBy(id: string, offset: number) {
    setItems((current) => {
      const index = current.findIndex((item) => item.id === id);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(nextIndex, 0, moved);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <label className="admin-field">
        Imagens por URL
        <textarea name="images" rows={6} required={required} placeholder="https://cdn.../imagem-1.jpg&#10;https://cdn.../imagem-2.jpg" value={imagesText} onChange={(event) => updateImagesText(event.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileInputRef} type="file" accept={PRODUCT_IMAGE_ACCEPT_ATTRIBUTE} multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
        <button type="button" className="button-secondary" onClick={() => fileInputRef.current?.click()}>
          <Upload size={17} /> Adicionar imagens do dispositivo
        </button>
        <p className="text-sm text-muted">JPG, JPEG, PNG ou WebP até {formatProductImageBytes(PRODUCT_IMAGE_MAX_FILE_SIZE_BYTES)} cada. Arraste para reordenar; a primeira é a principal.</p>
      </div>

      {error && <div className="admin-alert error mb-0">{error}</div>}

      {items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setDraggedId(item.id)}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (draggedId) moveImage(draggedId, item.id);
              }}
              className="overflow-hidden rounded-sm border border-border bg-white"
            >
              <div className="relative aspect-square bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded-sm bg-white/90 px-2 py-1 text-xs font-bold text-ink">
                  <GripVertical size={13} /> {index === 0 ? "Principal" : index + 1}
                </div>
                {item.status === "uploading" && <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-ink"><LoaderCircle className="mr-2 animate-spin" size={17} /> Enviando</div>}
              </div>
              {item.status === "error" && <p className="px-2 pt-2 text-xs font-semibold text-red-700">{item.error}</p>}
              <div className="grid grid-cols-3 border-t border-border text-xs font-bold text-muted">
                <button type="button" className="px-2 py-2 hover:text-ink disabled:opacity-40" disabled={index === 0} onClick={() => moveBy(item.id, -1)}>Subir</button>
                <button type="button" className="px-2 py-2 hover:text-ink disabled:opacity-40" disabled={index === items.length - 1} onClick={() => moveBy(item.id, 1)}>Descer</button>
                <button type="button" className="flex items-center justify-center gap-1 px-2 py-2 hover:text-ink" onClick={() => removeImage(item.id)}><X size={14} /> Remover</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted"><ImageOff size={16} /> Nenhuma imagem selecionada.</p>
      )}
    </div>
  );
}

function createUrlItem(url: string): ImageItem {
  return { id: crypto.randomUUID(), url, previewUrl: url, status: "ready" };
}

function revokeLocalPreviews(items: ImageItem[]) {
  for (const item of items) {
    if (item.previewUrl.startsWith("blob:")) URL.revokeObjectURL(item.previewUrl);
  }
}

function blobPathname(filename: string) {
  return productImageBlobPathname(filename);
}

async function deleteUploadedBlob(url: string) {
  try {
    await fetch("/api/admin/product-images/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    // The form state is still correct if cleanup fails; the product will not save this URL.
  }
}
