import React, { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Document {
  id: string;
  name: string;
  type: string;
  uploadedAt: string;
  url: string;
}

const DocumentManagementSystem: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const { data: documents, isLoading, isError, error, refetch } = trpc.documents.list.useQuery(
    undefined,
    { enabled: true }
  );

  const uploadMutation = trpc.documents.upload.useMutation({
    onSuccess: () => {
      toast.success('Document uploaded successfully!');
      refetch();
      setIsUploadDialogOpen(false);
      setFileToUpload(null);
    },
    onError: (err) => {
      toast.error(`Upload failed: ${err.message}`);
    },
  });

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => {
      toast.success('Document deleted successfully!');
      refetch();
      setIsDeleteDialogOpen(false);
      setDocumentToDelete(null);
    },
    onError: (err) => {
      toast.error(`Delete failed: ${err.message}`);
    },
  });

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    setPage(1); // Reset to first page on search
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setFileToUpload(event.target.files[0]);
    }
  };

  const handleUploadSubmit = () => {
    if (fileToUpload) {
      uploadMutation.mutate({ file: fileToUpload as any }); // tRPC expects File object, type assertion for simplicity
    }
  };

  const handleDeleteConfirm = () => {
    if (documentToDelete) {
      deleteMutation.mutate({ id: documentToDelete });
    }
  };

  const filteredDocuments = (documents || []).filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const paginatedDocuments = filteredDocuments.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredDocuments.length / pageSize);

  if (!isAuthenticated) {
    return <div className="p-4 text-center text-red-500">Please log in to access document management.</div>;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isError && true) {
    toast.error(`Failed to load documents: ${error?.message}`);
    return <div className="p-4 text-center text-red-500">Error loading documents. Please try again.</div>;
  }

  return (
    <div className="p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">Document Management System</CardTitle>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>Upload Document</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload New Document</DialogTitle>
                <DialogDescription>Select a file to upload to the system.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="documentFile" className="text-right">File</Label>
                  <Input id="documentFile" type="file" className="col-span-3" onChange={handleFileUpload} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleUploadSubmit} disabled={!fileToUpload || uploadMutation.isLoading}>
                  {uploadMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Upload'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search documents by name or type..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="max-w-sm"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Uploaded At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedDocuments.length > 0 ? (
                paginatedDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.name}</TableCell>
                    <TableCell>{doc.type}</TableCell>
                    <TableCell>{doc.uploadedAt}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" className="mr-2" onClick={() => window.open(doc.url, '_blank')}>View</Button>
                      <Dialog open={isDeleteDialogOpen && documentToDelete === doc.id} onOpenChange={(open) => {
                        setIsDeleteDialogOpen(open);
                        if (!open) setDocumentToDelete(null);
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="destructive" size="sm" onClick={() => setDocumentToDelete(doc.id)}>Delete</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Are you absolutely sure?</DialogTitle>
                            <DialogDescription>
                              This action cannot be undone. This will permanently delete the document.
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
                            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={deleteMutation.isLoading}>
                              {deleteMutation.isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Delete'}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">No documents found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-between items-center mt-4">
            <Button
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <span>Page {page} of {totalPages}</span>
            <Button
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentManagementSystem;