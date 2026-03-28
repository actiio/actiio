"use client";

import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { ATTACHMENT_ACCEPT, isAllowedAttachmentFile, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { SalesAsset } from "@/lib/types";
import { supabase } from "@/lib/supabase";

const SALES_ASSETS_BUCKET = process.env.NEXT_PUBLIC_SALES_ASSETS_BUCKET || "sales-assets";

function toSafeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createAsset(path: string, file: File): SalesAsset {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: file.name,
    path,
    mime_type: file.type || "application/octet-stream",
    size: file.size,
    uploaded_at: new Date().toISOString(),
  };
}

export function SalesAssetsUploader({
  userId,
  assets,
  onChange,
}: {
  userId: string | null;
  assets: SalesAsset[];
  onChange: (next: SalesAsset[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accepted = useMemo(() => ATTACHMENT_ACCEPT, []);

  async function handleUpload(fileList: FileList | null) {
    setError(null);
    if (!userId) {
      setError("Please sign in before uploading assets.");
      return;
    }
    if (!fileList || fileList.length === 0) return;

    const file = fileList[0];
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setError("File too large. Max allowed size is 15 MB.");
      return;
    }
    if (!isAllowedAttachmentFile(file)) {
      setError("Unsupported file type. Please upload a document, spreadsheet, text file, or common image.");
      return;
    }

    setUploading(true);
    try {
      const safeName = toSafeFileName(file.name);
      const path = `${userId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from(SALES_ASSETS_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      if (uploadError) {
        throw uploadError;
      }

      onChange([...assets, createAsset(path, file)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemove(assetId: string) {
    setError(null);
    const asset = assets.find((item) => item.id === assetId);
    if (!asset) return;

    const { error: removeError } = await supabase.storage.from(SALES_ASSETS_BUCKET).remove([asset.path]);
    if (removeError) {
      setError(removeError.message);
      return;
    }
    onChange(assets.filter((item) => item.id !== assetId));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl bg-gray-50/70 px-6 py-5">
        <div>
          <p className="text-sm font-semibold text-brand-body/75">
            Upload catalogs, brochures, pricing sheets, or case studies for future follow-ups.
          </p>
          <p className="mt-2 max-w-2xl text-xs text-brand-body/65">
            Tip: include keywords in file names (e.g. brochure, pricing, case-study) so AI can suggest the right asset.
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={accepted}
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files)}
          />
          <Button type="button" variant="outline" className="rounded-full px-5 font-bold" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? "Uploading..." : "Upload Asset"}
          </Button>
        </div>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-5 py-6">
          <p className="text-sm font-medium text-brand-body/70">No assets uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {assets.map((asset) => (
            <div key={asset.id} className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-heading">{asset.name}</p>
                <p className="mt-1 text-xs text-brand-body/65">{formatSize(asset.size)}</p>
              </div>
              <Button type="button" variant="ghost" className="rounded-full text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => void handleRemove(asset.id)}>
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
