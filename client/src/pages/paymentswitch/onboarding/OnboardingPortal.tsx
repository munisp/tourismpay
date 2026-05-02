// @ts-nocheck
import { useState } from 'react';
import { useLocation } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { 
  Building2, 
  User, 
  Mail, 
  Phone, 
  Globe, 
  FileText, 
  Upload,
  ArrowRight,
  CheckCircle2,
  Loader2
} from 'lucide-react';

type ParticipantType = 'bank' | 'psp' | 'merchant' | 'fintech';

interface ApplicationForm {
  organizationName: string;
  organizationType: ParticipantType | '';
  registrationNumber: string;
  country: string;
  address: string;
  website: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactTitle: string;
  expectedVolume: string;
  useCase: string;
  agreedToTerms: boolean;
}

export default function OnboardingPortal() {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  
  const [form, setForm] = useState<ApplicationForm>({
    organizationName: '',
    organizationType: '',
    registrationNumber: '',
    country: '',
    address: '',
    website: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactTitle: '',
    expectedVolume: '',
    useCase: '',
    agreedToTerms: false,
  });

  const updateForm = (field: keyof ApplicationForm, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleNextStep = () => {
    if (currentStep === 1) {
      if (!form.organizationName || !form.organizationType || !form.country) {
        toast.error('Please fill in all required fields');
        return;
      }
    } else if (currentStep === 2) {
      if (!form.contactName || !form.contactEmail) {
        toast.error('Please fill in all required fields');
        return;
      }
    }
    setCurrentStep(prev => prev + 1);
  };

  const handlePreviousStep = () => {
    setCurrentStep(prev => prev - 1);
  };

  const submitMutation = trpc.psAdmin.submitApplication.useMutation({
    onSuccess: (data) => {
      toast.success(`Application submitted! Reference: ${data.participantId}`);
      navigate('/onboarding/integration');
    },
    onError: (err) => {
      toast.error(`Submission failed: ${err.message}`);
    },
  });
  const handleSubmit = async () => {
    if (!form.agreedToTerms) {
      toast.error('Please agree to the terms and conditions');
      return;
    }
    if (!form.organizationType) {
      toast.error('Please select an organization type');
      return;
    }
    const countryCode = form.country === 'OTHER' ? 'XX' : form.country;
    submitMutation.mutate({
      organizationName: form.organizationName,
      organizationType: form.organizationType,
      registrationNumber: form.registrationNumber || undefined,
      country: countryCode,
      address: form.address || undefined,
      website: form.website || undefined,
      contactName: form.contactName,
      contactTitle: form.contactTitle || undefined,
      contactEmail: form.contactEmail,
      contactPhone: form.contactPhone || undefined,
      monthlyVolume: form.expectedVolume || undefined,
      useCase: form.useCase || undefined,
    });
  };
  const isSubmitting = submitMutation.isPending;

  const participantTypes = [
    { value: 'bank', label: 'Bank / Financial Institution', icon: Building2 },
    { value: 'psp', label: 'Payment Service Provider', icon: Globe },
    { value: 'merchant', label: 'Merchant / Enterprise', icon: FileText },
    { value: 'fintech', label: 'Fintech Company', icon: User },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white py-12">
      <div className="container max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Participant Onboarding Application
          </h1>
          <p className="text-gray-600">
            Complete the form below to apply for network participation
          </p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            {[
              { num: 1, title: 'Organization' },
              { num: 2, title: 'Contact' },
              { num: 3, title: 'Review' },
            ].map((step, index) => (
              <div key={step.num} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                    currentStep >= step.num
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-300 text-gray-400'
                  }`}
                >
                  {currentStep > step.num ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    step.num
                  )}
                </div>
                <div className={`ml-2 text-sm font-medium ${
                  currentStep >= step.num ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {step.title}
                </div>
                {index < 2 && (
                  <div
                    className={`w-16 h-0.5 mx-4 ${
                      currentStep > step.num ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step 1: Organization Details */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Organization Details
              </CardTitle>
              <CardDescription>
                Tell us about your organization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name *</Label>
                <Input
                  id="orgName"
                  placeholder="Enter your organization name"
                  value={form.organizationName}
                  onChange={(e) => updateForm('organizationName', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Organization Type *</Label>
                <div className="grid grid-cols-2 gap-3">
                  {participantTypes.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => updateForm('organizationType', type.value)}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-colors ${
                        form.organizationType === type.value
                          ? 'border-blue-600 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <type.icon className={`w-5 h-5 ${
                        form.organizationType === type.value ? 'text-blue-600' : 'text-gray-400'
                      }`} />
                      <span className={`text-sm font-medium ${
                        form.organizationType === type.value ? 'text-blue-600' : 'text-gray-700'
                      }`}>
                        {type.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="regNumber">Registration Number</Label>
                  <Input
                    id="regNumber"
                    placeholder="Company registration number"
                    value={form.registrationNumber}
                    onChange={(e) => updateForm('registrationNumber', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Select
                    value={form.country}
                    onValueChange={(value) => updateForm('country', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NG">Nigeria</SelectItem>
                      <SelectItem value="GH">Ghana</SelectItem>
                      <SelectItem value="KE">Kenya</SelectItem>
                      <SelectItem value="ZA">South Africa</SelectItem>
                      <SelectItem value="US">United States</SelectItem>
                      <SelectItem value="GB">United Kingdom</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Business Address</Label>
                <Textarea
                  id="address"
                  placeholder="Enter your business address"
                  value={form.address}
                  onChange={(e) => updateForm('address', e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  type="url"
                  placeholder="https://www.example.com"
                  value={form.website}
                  onChange={(e) => updateForm('website', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Contact Information */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Contact Information
              </CardTitle>
              <CardDescription>
                Provide details for the primary contact person
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Full Name *</Label>
                  <Input
                    id="contactName"
                    placeholder="John Doe"
                    value={form.contactName}
                    onChange={(e) => updateForm('contactName', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactTitle">Job Title</Label>
                  <Input
                    id="contactTitle"
                    placeholder="CTO, Head of Payments, etc."
                    value={form.contactTitle}
                    onChange={(e) => updateForm('contactTitle', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactEmail">Email Address *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="contactEmail"
                    type="email"
                    className="pl-10"
                    placeholder="john@example.com"
                    value={form.contactEmail}
                    onChange={(e) => updateForm('contactEmail', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactPhone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    id="contactPhone"
                    type="tel"
                    className="pl-10"
                    placeholder="+234 800 000 0000"
                    value={form.contactPhone}
                    onChange={(e) => updateForm('contactPhone', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expectedVolume">Expected Monthly Transaction Volume</Label>
                <Select
                  value={form.expectedVolume}
                  onValueChange={(value) => updateForm('expectedVolume', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select volume range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="<10k">Less than 10,000 transactions</SelectItem>
                    <SelectItem value="10k-100k">10,000 - 100,000 transactions</SelectItem>
                    <SelectItem value="100k-1m">100,000 - 1,000,000 transactions</SelectItem>
                    <SelectItem value=">1m">More than 1,000,000 transactions</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="useCase">Use Case Description</Label>
                <Textarea
                  id="useCase"
                  placeholder="Describe how you plan to use the payment network..."
                  value={form.useCase}
                  onChange={(e) => updateForm('useCase', e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review & Submit */}
        {currentStep === 3 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Review Your Application
              </CardTitle>
              <CardDescription>
                Please review your information before submitting
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Organization Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <span className="ml-2 text-gray-900">{form.organizationName || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Type:</span>
                      <span className="ml-2 text-gray-900">
                        {participantTypes.find(t => t.value === form.organizationType)?.label || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Country:</span>
                      <span className="ml-2 text-gray-900">{form.country || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Website:</span>
                      <span className="ml-2 text-gray-900">{form.website || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Name:</span>
                      <span className="ml-2 text-gray-900">{form.contactName || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Title:</span>
                      <span className="ml-2 text-gray-900">{form.contactTitle || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <span className="ml-2 text-gray-900">{form.contactEmail || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <span className="ml-2 text-gray-900">{form.contactPhone || '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">Business Details</h3>
                  <div className="text-sm">
                    <div className="mb-2">
                      <span className="text-gray-500">Expected Volume:</span>
                      <span className="ml-2 text-gray-900">{form.expectedVolume || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Use Case:</span>
                      <p className="mt-1 text-gray-900">{form.useCase || '-'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border rounded-lg">
                <Checkbox
                  id="terms"
                  checked={form.agreedToTerms}
                  onCheckedChange={(checked) => updateForm('agreedToTerms', checked as boolean)}
                />
                <div className="text-sm">
                  <Label htmlFor="terms" className="font-medium">
                    I agree to the Terms and Conditions
                  </Label>
                  <p className="text-gray-500 mt-1">
                    By submitting this application, I confirm that the information provided is accurate
                    and I agree to the network participation terms and conditions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={handlePreviousStep}
            disabled={currentStep === 1}
          >
            Previous
          </Button>
          
          {currentStep < 3 ? (
            <Button onClick={handleNextStep}>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !form.agreedToTerms}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Application'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
