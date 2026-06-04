import React, { useState } from 'react';
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card";
import {
  Button
} from "@/components/ui/button";
import {
  Input
} from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Badge
} from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";

interface ClaimsEvidenceProps {
  claimId: string;
}

interface Evidence {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  url: string;
}

export default function ClaimsEvidence({ claimId }: ClaimsEvidenceProps) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: evidence, isLoading, isError, error } = trpc.claimsEvidence.list.useQuery({ claimId });

  const { mutate: uploadEvidence, isLoading: isUploading } = trpc.claimsEvidence.upload.useMutation({
    onSuccess: () => {
      toast.success("Evidence uploaded successfully!");
      utils.claimsEvidence.list.invalidate({ claimId });
      setIsUploadDialogOpen(false);
      setSelectedFile(null);
    },
    onError: (err) => {
      toast.error(`Failed to upload evidence: ${err.message}`);
    },
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <p>Please log in to view claims evidence.</p>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError) {
    toast.error(`Error fetching evidence: ${error?.message}`);
    return <p>Error loading claims evidence.</p>;
  }

  const handleFileUpload = () => {
    if (selectedFile) {
      // In a real application, you would convert the File object to a format
      // suitable for upload, e.g., FormData or base64 string.
      // For this example, we'll simulate the upload.
      uploadEvidence({ /* file content goes here */ }); // Assuming trpc.claimsEvidence.upload.useMutation takes the file content directly or a structured object
    } else {
      toast.error("Please select a file to upload.");
    }
  };

  const filteredEvidence = (evidence || []).filter(item =>
    item.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Claims Evidence for Claim ID: {claimId}</CardTitle>
        <CardDescription>Manage all supporting documents and media for this claim.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex justify-between items-center mb-4">
          <Input
            placeholder="Search evidence..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>Upload New Evidence</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Evidence</DialogTitle>
                <DialogDescription>
                  Upload supporting documents or media for this claim.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <Input
                  id="file"
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files ? e.target.files[0] : null)}
                />
              </div>
              <DialogFooter>
                <Button onClick={handleFileUpload} disabled={isUploading || !selectedFile}>
                  {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Upload
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File Name</TableHead>
              <TableHead>File Type</TableHead>
              <TableHead>Uploaded At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEvidence.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">
                  No evidence found.
                </TableCell>
              </TableRow>
            ) : (
              filteredEvidence.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.fileName}</TableCell>
                  <TableCell><Badge variant="secondary">{item.fileType}</Badge></TableCell>
                  <TableCell>{new Date(item.uploadedAt).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <a href={item.url} target="_blank" rel="noopener noreferrer">View</a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
