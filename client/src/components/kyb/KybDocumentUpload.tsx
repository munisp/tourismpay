import { useState, useRef, useCallback } from "react";
import {
  Upload, FileText, CheckCircle, XCircle, Clock, Trash2, Eye, Loader2, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────

type DocumentType =
  | "certificate_of_incorporation"
  | "business_license"
  | "tax_certificate"
  | "director_id"
  | "proof_of_address"
  | "bank_statement"
  | "audited_accounts"
  | "ownership_structure"
  | "regulatory_approval"
  | "other";

type UploadState = "idle" | "uploading" | "success" | "error";

interface LocalUpload {
  documentType: DocumentType;
  fileName: string;
  fileSizeBytes: number;
  state: UploadState;
  progress: number;
  error?: string;
  uploadedDocId?: number;
  fileUrl?: string;
}

interface Props {
  applicationId: number;
  establishmentId: number;
  establishmentType?: string;
  onDocumentsChanged?: (count: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g. "data:application/pdf;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function statusIcon(state: UploadState) {
  switch (state) {
    case "uploading": return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    case "success": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "error": return <XCircle className="w-4 h-4 text-red-400" />;
    default: return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KybDocumentUpload({ applicationId, establishmentId, establishmentType, onDocumentsChanged }: Props) {
  const [uploads, setUploads] = useState<Record<DocumentType, LocalUpload | null>>({} as any);
  const [dragOver, setDragOver] = useState<DocumentType | null>(null);
  const fileInputRefs = useRef<Record<DocumentType, HTMLInputElement | null>>({} as any);

  // Fetch document types from backend — pass establishment type for type-specific docs
  const { data: docTypes } = trpc.kybDocuments.documentTypes.useQuery(
    { establishmentType: establishmentType ?? "other" },
    { staleTime: 5 * 60 * 1000 }
  );

  // Fetch already-uploaded documents for this application
  const { data: existingDocs, refetch: refetchDocs } = trpc.kybDocuments.listByApplication.useQuery(
    { applicationId },
    { enabled: applicationId > 0 }
  );

  const uploadMutation = trpc.kybDocuments.upload.useMutation();
  const deleteMutation = trpc.kybDocuments.delete.useMutation();

  const handleFileSelect = useCallback(
    async (docType: DocumentType, file: File) => {
      // Validate MIME type
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error("Invalid file type", {
          description: "Accepted: PDF, JPEG, PNG, WEBP, TIFF, DOC, DOCX",
        });
        return;
      }

      // Validate size
      if (file.size > MAX_SIZE) {
        toast.error("File too large", { description: "Maximum file size is 10 MB." });
        return;
      }

      // Set uploading state
      setUploads((prev) => ({
        ...prev,
        [docType]: {
          documentType: docType,
          fileName: file.name,
          fileSizeBytes: file.size,
          state: "uploading",
          progress: 10,
        },
      }));

      try {
        // Simulate progress while encoding
        setUploads((prev) => ({ ...prev, [docType]: { ...prev[docType]!, progress: 30 } }));
        const fileDataBase64 = await fileToBase64(file);

        setUploads((prev) => ({ ...prev, [docType]: { ...prev[docType]!, progress: 60 } }));

        const result = await uploadMutation.mutateAsync({
          applicationId,
          establishmentId,
          documentType: docType,
          fileName: file.name,
          mimeType: file.type,
          fileSizeBytes: file.size,
          fileDataBase64,
        });

        setUploads((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType]!,
            state: "success",
            progress: 100,
            uploadedDocId: result?.id,
            fileUrl: result?.fileUrl,
          },
        }));

        toast.success("Document uploaded", { description: file.name });
        refetchDocs();
        onDocumentsChanged?.(Object.values(uploads).filter((u) => u?.state === "success").length + 1);
      } catch (err: any) {
        setUploads((prev) => ({
          ...prev,
          [docType]: {
            ...prev[docType]!,
            state: "error",
            progress: 0,
            error: err?.message ?? "Upload failed",
          },
        }));
        toast.error("Upload failed", { description: err?.message ?? "Please try again." });
      }
    },
    [applicationId, establishmentId, uploadMutation, uploads, refetchDocs, onDocumentsChanged]
  );

  const handleDrop = useCallback(
    (docType: DocumentType, e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(docType, file);
    },
    [handleFileSelect]
  );

  const handleDelete = async (docId: number, docType: DocumentType) => {
    try {
      await deleteMutation.mutateAsync({ documentId: docId });
      setUploads((prev) => ({ ...prev, [docType]: null }));
      toast.success("Document removed");
      refetchDocs();
    } catch (err: any) {
      toast.error("Delete failed", { description: err?.message });
    }
  };

  const resetUpload = (docType: DocumentType) => {
    setUploads((prev) => ({ ...prev, [docType]: null }));
  };

  if (!docTypes) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading document requirements...
      </div>
    );
  }

  // Merge existing DB docs with local upload state
  type ExistingDoc = NonNullable<typeof existingDocs>[number];
  const existingByType: Record<string, ExistingDoc> = {};
  (existingDocs ?? []).forEach((d) => {
    existingByType[d.documentType] = d;
  });

  const requiredDocs = docTypes.filter((d) => d.required);
  const optionalDocs = docTypes.filter((d) => !d.required);
  const uploadedRequiredCount = requiredDocs.filter(
    (d) => existingByType[d.value] || uploads[d.value as DocumentType]?.state === "success"
  ).length;

  return (
    <div className="space-y-4">
      {/* Progress summary */}
      <div className="p-3 rounded-md bg-white/3 border border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">Required Documents</span>
          <span className="text-xs font-mono text-primary">
            {uploadedRequiredCount}/{requiredDocs.length} uploaded
          </span>
        </div>
        <Progress
          value={(uploadedRequiredCount / requiredDocs.length) * 100}
          className="h-1.5"
        />
        {uploadedRequiredCount === requiredDocs.length && (
          <p className="text-[10px] text-emerald-400 mt-1.5 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> All required documents uploaded
          </p>
        )}
      </div>

      {/* Required documents */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">
          Required Documents
        </p>
        <div className="space-y-2">
          {requiredDocs.map((docType) => (
            <DocumentRow
              key={docType.value}
              docType={docType}
              existing={existingByType[docType.value]}
              upload={uploads[docType.value as DocumentType]}
              isDragOver={dragOver === docType.value}
              fileInputRef={(el) => { fileInputRefs.current[docType.value as DocumentType] = el; }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(docType.value as DocumentType); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(docType.value as DocumentType, e)}
              onFileChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(docType.value as DocumentType, file);
                e.target.value = "";
              }}
              onClickUpload={() => fileInputRefs.current[docType.value as DocumentType]?.click()}
              onDelete={(docId) => handleDelete(docId, docType.value as DocumentType)}
              onReset={() => resetUpload(docType.value as DocumentType)}
            />
          ))}
        </div>
      </div>

      {/* Optional documents */}
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">
          Optional Documents
        </p>
        <div className="space-y-2">
          {optionalDocs.map((docType) => (
            <DocumentRow
              key={docType.value}
              docType={docType}
              existing={existingByType[docType.value]}
              upload={uploads[docType.value as DocumentType]}
              isDragOver={dragOver === docType.value}
              fileInputRef={(el) => { fileInputRefs.current[docType.value as DocumentType] = el; }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(docType.value as DocumentType); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(docType.value as DocumentType, e)}
              onFileChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(docType.value as DocumentType, file);
                e.target.value = "";
              }}
              onClickUpload={() => fileInputRefs.current[docType.value as DocumentType]?.click()}
              onDelete={(docId) => handleDelete(docId, docType.value as DocumentType)}
              onReset={() => resetUpload(docType.value as DocumentType)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DocumentRow sub-component ────────────────────────────────────────────────

interface DocumentRowProps {
  docType: { value: string; label: string; required: boolean };
  existing?: { id: number; fileName: string; fileUrl: string; status: string; fileSizeBytes: number | null; documentType: string } | null;
  upload?: LocalUpload | null;
  isDragOver: boolean;
  fileInputRef: (el: HTMLInputElement | null) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClickUpload: () => void;
  onDelete: (docId: number) => void;
  onReset: () => void;
}

function DocumentRow({
  docType,
  existing,
  upload,
  isDragOver,
  fileInputRef,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileChange,
  onClickUpload,
  onDelete,
  onReset,
}: DocumentRowProps) {
  const hasExisting = !!existing;
  const isUploading = upload?.state === "uploading";
  const isSuccess = upload?.state === "success";
  const isError = upload?.state === "error";

  const statusBadge = () => {
    if (hasExisting) {
      const color =
        existing!.status === "verified"
          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
          : existing!.status === "rejected"
          ? "bg-red-500/20 text-red-400 border-red-500/30"
          : "bg-amber-500/20 text-amber-400 border-amber-500/30";
      return (
        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono uppercase ${color}`}>
          {existing!.status}
        </span>
      );
    }
    if (isSuccess) return <span className="text-[9px] px-1.5 py-0.5 rounded border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 font-mono uppercase">Uploaded</span>;
    if (isError) return <span className="text-[9px] px-1.5 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30 font-mono uppercase">Error</span>;
    return null;
  };

  return (
    <div
      className={`relative flex items-center gap-3 p-3 rounded-md border transition-all ${
        isDragOver
          ? "border-primary bg-primary/10"
          : hasExisting || isSuccess
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isError
          ? "border-red-500/30 bg-red-500/5"
          : "border-dashed border-border bg-white/3 hover:border-border/80"
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff,.doc,.docx"
        onChange={onFileChange}
      />

      {/* Icon */}
      <div className="flex-shrink-0">
        {hasExisting || isSuccess ? (
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-red-400" />
        ) : isUploading ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
        ) : (
          <FileText className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Label + file info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-foreground truncate">{docType.label}</span>
          {docType.required && (
            <span className="text-[9px] text-red-400 font-mono">REQUIRED</span>
          )}
          {statusBadge()}
        </div>
        {hasExisting && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {existing!.fileName}
            {existing!.fileSizeBytes ? ` · ${formatBytes(existing!.fileSizeBytes)}` : ""}
          </p>
        )}
        {upload && !hasExisting && (
          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
            {upload.fileName} · {formatBytes(upload.fileSizeBytes)}
          </p>
        )}
        {isUploading && (
          <Progress value={upload?.progress ?? 0} className="h-1 mt-1.5 w-32" />
        )}
        {isError && (
          <p className="text-[10px] text-red-400 mt-0.5">{upload?.error}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {hasExisting && (
          <>
            <a href={existing!.fileUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                <Eye className="w-3 h-3" />
              </Button>
            </a>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
              onClick={() => onDelete(existing!.id)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </>
        )}
        {isSuccess && !hasExisting && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
            onClick={onReset}
            title="Remove"
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        )}
        {isError && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px] text-muted-foreground hover:text-foreground px-2"
            onClick={onReset}
          >
            Retry
          </Button>
        )}
        {!hasExisting && !isSuccess && !isUploading && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] border-border bg-white/5 px-2"
            onClick={onClickUpload}
          >
            <Upload className="w-3 h-3 mr-1" />
            {isDragOver ? "Drop here" : "Upload"}
          </Button>
        )}
      </div>
    </div>
  );
}
