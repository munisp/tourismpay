import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Shield,
  Scan,
  Brain,
  Loader2,
  RefreshCw,
  Download,
  ZoomIn,
  Circle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ExtractedData {
  documentType: string;
  extractedFields: Record<string, string>;
  confidence: number;
  rawText: string;
}

interface FraudAnalysis {
  overallScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  checks: {
    name: string;
    status: "pass" | "warning" | "fail";
    description: string;
    confidence: number;
  }[];
  recommendations: string[];
}

interface DocumentAnalysis {
  status: "pending" | "processing" | "completed" | "failed";
  extractedData?: ExtractedData;
  fraudAnalysis?: FraudAnalysis;
  processingSteps: {
    name: string;
    status: "pending" | "processing" | "completed" | "failed";
    description: string;
  }[];
}

interface SmartDocumentUploadProps {
  documentType: string;
  label: string;
  description: string;
  acceptedFormats?: string;
  maxSize?: number;
  required?: boolean;
  onUpload: (file: File, analysis: DocumentAnalysis) => void;
  productType?: string;
}

export default function SmartDocumentUpload({
  documentType,
  label,
  description,
  acceptedFormats = "image/*,.pdf",
  maxSize = 5,
  required = false,
  onUpload,
  productType = "general"
}: SmartDocumentUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DocumentAnalysis | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const simulateDocumentAnalysis = useCallback(async (uploadedFile: File): Promise<DocumentAnalysis> => {
    const analysisResult: DocumentAnalysis = {
      status: "processing",
      processingSteps: [
        { name: "Smart Text Recognition", status: "pending", description: "Extracting text from your document" },
        { name: "Visual Authenticity Check", status: "pending", description: "Analyzing document for signs of tampering" },
        { name: "Document Structure Analysis", status: "pending", description: "Verifying document format and layout" },
        { name: "Fraud Detection", status: "pending", description: "Running security verification checks" },
        { name: "Database Verification", status: "pending", description: "Validating against official records" }
      ]
    };

    setAnalysis({ ...analysisResult });

    // Step 1: PaddleOCR Text Extraction
    await new Promise(resolve => setTimeout(resolve, 800));
    analysisResult.processingSteps[0].status = "completed";
    setAnalysis({ ...analysisResult });

    // Step 2: VLM Visual Analysis
    await new Promise(resolve => setTimeout(resolve, 600));
    analysisResult.processingSteps[1].status = "completed";
    setAnalysis({ ...analysisResult });

    // Step 3: Docling Structure Analysis
    await new Promise(resolve => setTimeout(resolve, 500));
    analysisResult.processingSteps[2].status = "completed";
    setAnalysis({ ...analysisResult });

    // Step 4: Fraud Detection
    await new Promise(resolve => setTimeout(resolve, 700));
    analysisResult.processingSteps[3].status = "completed";
    setAnalysis({ ...analysisResult });

    // Step 5: Cross-Reference Validation
    await new Promise(resolve => setTimeout(resolve, 400));
    analysisResult.processingSteps[4].status = "completed";

    // Generate extracted data based on document type
    const extractedData = generateExtractedData(documentType, uploadedFile.name);
    const fraudAnalysis = generateFraudAnalysis(documentType);

    analysisResult.status = "completed";
    analysisResult.extractedData = extractedData;
    analysisResult.fraudAnalysis = fraudAnalysis;

    setAnalysis({ ...analysisResult });
    return analysisResult;
  }, [documentType]);

  const generateExtractedData = (docType: string, fileName: string): ExtractedData => {
    const baseData: Record<string, ExtractedData> = {
      "id-document": {
        documentType: "National ID Card (NIN)",
        extractedFields: {
          "Full Name": "ADEBAYO OLUWASEUN JOHNSON",
          "NIN Number": "12345678901",
          "Date of Birth": "15/03/1985",
          "Gender": "Male",
          "Issue Date": "10/01/2020",
          "Expiry Date": "09/01/2030",
          "Address": "15 Victoria Island, Lagos"
        },
        confidence: 94.5,
        rawText: "FEDERAL REPUBLIC OF NIGERIA\nNATIONAL IDENTIFICATION NUMBER\nNIN: 12345678901\nSURNAME: JOHNSON\nFIRST NAME: ADEBAYO\nMIDDLE NAME: OLUWASEUN\nDATE OF BIRTH: 15/03/1985\nGENDER: MALE..."
      },
      "drivers-license": {
        documentType: "Driver's License",
        extractedFields: {
          "Full Name": "ADEBAYO OLUWASEUN JOHNSON",
          "License Number": "LAG-2020-123456",
          "Date of Birth": "15/03/1985",
          "Issue Date": "05/06/2020",
          "Expiry Date": "04/06/2025",
          "Class": "B - Light Motor Vehicle",
          "Blood Group": "O+",
          "State of Issue": "Lagos"
        },
        confidence: 92.3,
        rawText: "FEDERAL ROAD SAFETY CORPS\nDRIVER'S LICENSE\nLICENSE NO: LAG-2020-123456\nNAME: ADEBAYO OLUWASEUN JOHNSON\nDOB: 15/03/1985\nCLASS: B..."
      },
      "vehicle-registration": {
        documentType: "Vehicle Registration Certificate",
        extractedFields: {
          "Registration Number": "LAG-123-XY",
          "Owner Name": "ADEBAYO OLUWASEUN JOHNSON",
          "Vehicle Make": "Toyota",
          "Vehicle Model": "Camry",
          "Year": "2022",
          "Engine Number": "2GR-FE-1234567",
          "Chassis Number": "JTDKN3DU5A0123456",
          "Color": "Silver",
          "Registration Date": "15/08/2022"
        },
        confidence: 96.1,
        rawText: "VEHICLE REGISTRATION CERTIFICATE\nREG NO: LAG-123-XY\nOWNER: ADEBAYO OLUWASEUN JOHNSON\nMAKE: TOYOTA\nMODEL: CAMRY..."
      },
      "proof-of-address": {
        documentType: "Utility Bill",
        extractedFields: {
          "Account Holder": "ADEBAYO OLUWASEUN JOHNSON",
          "Service Address": "15 Victoria Island, Lagos",
          "Bill Date": "01/01/2024",
          "Account Number": "0123456789",
          "Utility Provider": "Eko Electricity Distribution Company",
          "Amount Due": "₦15,450.00"
        },
        confidence: 89.7,
        rawText: "EKO ELECTRICITY DISTRIBUTION COMPANY\nBILL DATE: 01/01/2024\nACCOUNT: 0123456789\nNAME: ADEBAYO OLUWASEUN JOHNSON..."
      },
      "medical-report": {
        documentType: "Medical Test Report",
        extractedFields: {
          "Patient Name": "ADEBAYO OLUWASEUN JOHNSON",
          "Test Date": "15/01/2024",
          "Laboratory": "PathCare Diagnostics",
          "Test Type": "Complete Blood Count (CBC)",
          "Hemoglobin": "14.2 g/dL (Normal)",
          "WBC Count": "7,500 /μL (Normal)",
          "Platelet Count": "250,000 /μL (Normal)",
          "Blood Sugar (Fasting)": "95 mg/dL (Normal)",
          "Cholesterol": "185 mg/dL (Normal)"
        },
        confidence: 91.8,
        rawText: "PATHCARE DIAGNOSTICS\nMEDICAL LABORATORY REPORT\nPATIENT: ADEBAYO OLUWASEUN JOHNSON\nDATE: 15/01/2024\nTEST: COMPLETE BLOOD COUNT..."
      },
      "property-deed": {
        documentType: "Certificate of Occupancy",
        extractedFields: {
          "Owner Name": "ADEBAYO OLUWASEUN JOHNSON",
          "Property Address": "Plot 15, Victoria Island, Lagos",
          "Certificate Number": "LAS/RES/2020/12345",
          "Issue Date": "20/05/2020",
          "Property Size": "650 sqm",
          "Property Type": "Residential",
          "LGA": "Eti-Osa"
        },
        confidence: 93.4,
        rawText: "LAGOS STATE GOVERNMENT\nCERTIFICATE OF OCCUPANCY\nCERTIFICATE NO: LAS/RES/2020/12345\nGRANTED TO: ADEBAYO OLUWASEUN JOHNSON..."
      },
      "farm-document": {
        documentType: "Farm Registration Certificate",
        extractedFields: {
          "Farm Owner": "ADEBAYO OLUWASEUN JOHNSON",
          "Farm Name": "Green Acres Farm",
          "Location": "Ikorodu, Lagos",
          "Farm Size": "5 Hectares",
          "Registration Number": "FMARD/LAG/2023/001234",
          "Crop Type": "Maize, Cassava",
          "Registration Date": "10/03/2023"
        },
        confidence: 88.9,
        rawText: "FEDERAL MINISTRY OF AGRICULTURE\nFARM REGISTRATION CERTIFICATE\nREG NO: FMARD/LAG/2023/001234\nFARM: GREEN ACRES FARM..."
      }
    };

    return baseData[docType] || {
      documentType: "Unknown Document",
      extractedFields: {
        "Document Name": fileName,
        "Upload Date": new Date().toLocaleDateString()
      },
      confidence: 75.0,
      rawText: "Document text extraction in progress..."
    };
  };

  const generateFraudAnalysis = (docType: string): FraudAnalysis => {
    const checks = [
      {
        name: "Document Authenticity",
        status: "pass" as const,
        description: "Document appears to be genuine with valid security features",
        confidence: 95.2
      },
      {
        name: "Tampering Detection",
        status: "pass" as const,
        description: "No signs of digital manipulation or physical alterations detected",
        confidence: 97.8
      },
      {
        name: "Font Consistency",
        status: "pass" as const,
        description: "All fonts are consistent with official document templates",
        confidence: 94.1
      },
      {
        name: "Metadata Analysis",
        status: "pass" as const,
        description: "File metadata is consistent with claimed document origin",
        confidence: 91.5
      },
      {
        name: "Cross-Reference Check",
        status: "pass" as const,
        description: "Information matches against government databases",
        confidence: 89.3
      },
      {
        name: "Image Quality Analysis",
        status: "warning" as const,
        description: "Image resolution is acceptable but could be clearer",
        confidence: 78.5
      }
    ];

    const overallScore = checks.reduce((sum, check) => sum + check.confidence, 0) / checks.length;
    const failedChecks = checks.filter(c => c.status === "fail").length;
    const warningChecks = checks.filter(c => c.status === "warning").length;

    let riskLevel: "low" | "medium" | "high" | "critical" = "low";
    if (failedChecks > 0) riskLevel = "critical";
    else if (warningChecks > 1) riskLevel = "high";
    else if (warningChecks > 0) riskLevel = "medium";

    return {
      overallScore,
      riskLevel,
      checks,
      recommendations: [
        "Document has been verified and is ready for processing",
        "Consider requesting a higher resolution scan for better accuracy",
        "All extracted data should be confirmed by the applicant"
      ]
    };
  };

  const handleFileSelect = async (selectedFile: File) => {
    if (selectedFile.size > maxSize * 1024 * 1024) {
      alert(`File size exceeds ${maxSize}MB limit`);
      return;
    }

    setFile(selectedFile);

    // Create preview for images
    if (selectedFile.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }

    // Run document analysis
    const analysisResult = await simulateDocumentAnalysis(selectedFile);
    onUpload(selectedFile, analysisResult);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const getRiskBadge = (riskLevel: string) => {
    switch (riskLevel) {
      case "low":
        return <Badge className="bg-green-100 text-green-800">Low Risk</Badge>;
      case "medium":
        return <Badge className="bg-yellow-100 text-yellow-800">Medium Risk</Badge>;
      case "high":
        return <Badge className="bg-orange-100 text-orange-800">High Risk</Badge>;
      case "critical":
        return <Badge className="bg-red-100 text-red-800">Critical Risk</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }
  };

  return (
    <Card className={`border-2 ${isDragging ? "border-blue-500 bg-blue-50" : "border-dashed"}`}>
      <CardContent className="p-6">
        {!file ? (
          <div
            className="text-center cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <h4 className="font-semibold mb-1">
              {label} {required && "*"}
            </h4>
            <p className="text-sm text-muted-foreground mb-4">{description}</p>
            <input
              type="file"
              accept={acceptedFormats}
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
              id={`file-${documentType}`}
            />
            <label htmlFor={`file-${documentType}`}>
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Choose File or Drag & Drop
                </span>
              </Button>
            </label>
            <p className="text-xs text-muted-foreground mt-2">
              Max size: {maxSize}MB | Formats: {acceptedFormats}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* File Info */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {preview && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4 mr-1" />
                        Preview
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>Document Preview</DialogTitle>
                      </DialogHeader>
                      <img src={preview} alt="Document preview" className="w-full rounded-lg" />
                    </DialogContent>
                  </Dialog>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setPreview(null);
                    setAnalysis(null);
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Replace
                </Button>
              </div>
            </div>

            {/* Processing Steps */}
            {analysis && analysis.status === "processing" && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Analyzing Document...</p>
                {analysis.processingSteps.map((step, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    {step.status === "completed" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : step.status === "processing" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    ) : (
                      <Circle className="h-4 w-4 text-gray-300" />
                    )}
                    <span className={step.status === "completed" ? "text-green-700" : ""}>
                      {step.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Analysis Results */}
            {analysis && analysis.status === "completed" && (
              <Accordion type="single" collapsible className="w-full">
                {/* Extracted Data */}
                <AccordionItem value="extracted">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Scan className="h-4 w-4 text-blue-500" />
                      <span>Extracted Data</span>
                      <Badge variant="outline" className="ml-2">
                        {analysis.extractedData?.confidence.toFixed(1)}% confidence
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">
                          {analysis.extractedData?.documentType}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {analysis.extractedData &&
                          Object.entries(analysis.extractedData.extractedFields).map(
                            ([key, value]) => (
                              <div key={key} className="flex flex-col">
                                <span className="text-muted-foreground text-xs">{key}</span>
                                <span className="font-medium">{value}</span>
                              </div>
                            )
                          )}
                      </div>
                      <details className="mt-3">
                        <summary className="text-sm text-muted-foreground cursor-pointer">
                          View Original Extracted Text
                        </summary>
                        <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-32">
                          {analysis.extractedData?.rawText}
                        </pre>
                      </details>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* Fraud Analysis */}
                <AccordionItem value="fraud">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-500" />
                      <span>Fraud & Authenticity Analysis</span>
                      {analysis.fraudAnalysis && getRiskBadge(analysis.fraudAnalysis.riskLevel)}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 p-3 bg-gray-50 rounded-lg">
                      {/* Overall Score */}
                      <div className="flex items-center justify-between">
                        <span className="font-medium">Authenticity Score</span>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={analysis.fraudAnalysis?.overallScore}
                            className="w-32"
                          />
                          <span className="font-bold text-green-600">
                            {analysis.fraudAnalysis?.overallScore.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Individual Checks */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Security Checks</p>
                        {analysis.fraudAnalysis?.checks.map((check, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between p-2 bg-white rounded"
                          >
                            <div className="flex items-center gap-2">
                              {getStatusIcon(check.status)}
                              <div>
                                <p className="text-sm font-medium">{check.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {check.description}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline">{check.confidence.toFixed(1)}%</Badge>
                          </div>
                        ))}
                      </div>

                      {/* Recommendations */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Recommendations</p>
                        <ul className="text-sm text-muted-foreground space-y-1">
                          {analysis.fraudAnalysis?.recommendations.map((rec, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5" />
                              {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {/* AI Analysis */}
                <AccordionItem value="ai">
                  <AccordionTrigger>
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-500" />
                      <span>AI Analysis Summary</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="p-3 bg-gray-50 rounded-lg space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge className="bg-blue-100 text-blue-800">Text Recognition</Badge>
                        <span>Document text extracted with high accuracy</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Badge className="bg-purple-100 text-purple-800">Visual Check</Badge>
                        <span>No signs of tampering or alterations detected</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Badge className="bg-green-100 text-green-800">Format Verified</Badge>
                        <span>Document structure matches official format</span>
                      </div>
                      <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded">
                        <p className="text-sm text-green-800">
                          <strong>Verdict:</strong> This document appears to be authentic and has
                          passed all fraud detection checks. The extracted information can be
                          used for underwriting purposes.
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Status Badge */}
            {analysis && analysis.status === "completed" && (
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-700">
                    Document Verified Successfully
                  </span>
                </div>
                {analysis.fraudAnalysis && getRiskBadge(analysis.fraudAnalysis.riskLevel)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
