// @ts-nocheck
import { useState, useEffect } from 'react';
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
import { Loader2, CheckCircle2, XCircle, AlertCircle, Upload } from 'lucide-react';

interface TechnicalOnboardingProps {
  applicationId: number;
}

export default function TechnicalOnboarding({ applicationId }: TechnicalOnboardingProps) {
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Technical Configuration State
  const [techConfig, setTechConfig] = useState({
    primaryEndpoint: '',
    backupEndpoint: '',
    webhookUrl: '',
    ipWhitelist: [] as string[],
    transactionCapacity: 0,
    supportedFormats: [] as string[],
    protocols: [] as string[],
    characterEncoding: 'UTF-8',
    timezone: 'UTC',
    operatingHours: {},
    maintenanceWindows: {},
    settlementCutoffTime: '',
    minTransactionAmount: 0,
    maxTransactionAmount: 0,
    dailyTransactionLimit: 0,
    velocityLimit: 0,
  });

  // Security Credentials State
  const [securityCreds, setSecurityCreds] = useState({
    sslCertificate: '',
    certificateChain: '',
    oauthClientId: '',
    oauthClientSecret: '',
    jwtPublicKey: '',
    publicKey: '',
    pgpKeyId: '',
    hsmEnabled: false,
  });

  // Network Configuration State
  const [networkConfig, setNetworkConfig] = useState({
    vpnRequired: false,
    vpnType: '',
    vpnEndpoint: '',
    loadBalancerEndpoint: '',
    healthCheckUrl: '',
    timeoutSeconds: 30,
    retryPolicy: {},
    topologyDiagramUrl: '',
    firewallRulesDoc: '',
  });

  // API Keys
  const [generatedApiKey, setGeneratedApiKey] = useState('');

  // Validation states
  const [endpointTestResult, setEndpointTestResult] = useState<any>(null);
  const [certValidationResult, setCertValidationResult] = useState<any>(null);

  // Load existing data
  const { data: existingData, isLoading } = trpc.technicalOnboarding.getTechnicalOnboarding.useQuery({
    applicationId,
  });

  // Mutations
  const saveTechConfig = trpc.technicalOnboarding.saveTechnicalConfig.useMutation();
  const saveSecurityCreds = trpc.technicalOnboarding.saveSecurityCredentials.useMutation();
  const saveNetworkConfig = trpc.technicalOnboarding.saveNetworkConfig.useMutation();
  const testEndpoint = trpc.technicalOnboarding.testEndpoint.useMutation();
  const validateCert = trpc.technicalOnboarding.validateCertificate.useMutation();
  const submitForReview = trpc.technicalOnboarding.submitForReview.useMutation();

  // Load existing data when available
  useEffect(() => {
    if (existingData) {
      if (existingData.technicalConfig) {
        const tc = existingData.technicalConfig;
        setTechConfig({
          primaryEndpoint: tc.primaryEndpoint || '',
          backupEndpoint: tc.backupEndpoint || '',
          webhookUrl: tc.webhookUrl || '',
          ipWhitelist: tc.ipWhitelist ? JSON.parse(tc.ipWhitelist) : [],
          transactionCapacity: tc.transactionCapacity || 0,
          supportedFormats: tc.supportedFormats ? JSON.parse(tc.supportedFormats) : [],
          protocols: tc.protocols ? JSON.parse(tc.protocols) : [],
          characterEncoding: tc.characterEncoding || 'UTF-8',
          timezone: tc.timezone || 'UTC',
          operatingHours: tc.operatingHours ? JSON.parse(tc.operatingHours) : {},
          maintenanceWindows: tc.maintenanceWindows ? JSON.parse(tc.maintenanceWindows) : {},
          settlementCutoffTime: tc.settlementCutoffTime || '',
          minTransactionAmount: tc.minTransactionAmount || 0,
          maxTransactionAmount: tc.maxTransactionAmount || 0,
          dailyTransactionLimit: tc.dailyTransactionLimit || 0,
          velocityLimit: tc.velocityLimit || 0,
        });
      }
      if (existingData.securityCredentials) {
        const sc = existingData.securityCredentials;
        setSecurityCreds({
          sslCertificate: sc.sslCertificate || '',
          certificateChain: sc.certificateChain || '',
          oauthClientId: sc.oauthClientId || '',
          oauthClientSecret: sc.oauthClientSecret || '',
          jwtPublicKey: sc.jwtPublicKey || '',
          publicKey: sc.publicKey || '',
          pgpKeyId: sc.pgpKeyId || '',
          hsmEnabled: sc.hsmEnabled || false,
        });
        if (sc.apiKey) {
          setGeneratedApiKey(sc.apiKey);
        }
      }
      if (existingData.networkConfig) {
        const nc = existingData.networkConfig;
        setNetworkConfig({
          vpnRequired: nc.vpnRequired || false,
          vpnType: nc.vpnType || '',
          vpnEndpoint: nc.vpnEndpoint || '',
          loadBalancerEndpoint: nc.loadBalancerEndpoint || '',
          healthCheckUrl: nc.healthCheckUrl || '',
          timeoutSeconds: nc.timeoutSeconds || 30,
          retryPolicy: nc.retryPolicy ? JSON.parse(nc.retryPolicy) : {},
          topologyDiagramUrl: nc.topologyDiagramUrl || '',
          firewallRulesDoc: nc.firewallRulesDoc || '',
        });
      }
    }
  }, [existingData]);

  const handleTestEndpoint = async () => {
    if (!techConfig.primaryEndpoint) {
      toast.error('Please enter an endpoint URL');
      return;
    }
    
    try {
      const result = await testEndpoint.mutateAsync({
        endpoint: techConfig.primaryEndpoint,
      });
      setEndpointTestResult(result);
      if (result.success) {
        toast.success(`Endpoint reachable (${result.responseTime}ms)`);
      } else {
        toast.error(`Endpoint test failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Test failed: ${error.message}`);
    }
  };

  const handleValidateCertificate = async () => {
    if (!securityCreds.sslCertificate) {
      toast.error('Please enter a certificate');
      return;
    }
    
    try {
      const result = await validateCert.mutateAsync({
        certificate: securityCreds.sslCertificate,
      });
      setCertValidationResult(result);
      if (result.valid) {
        toast.success('Certificate is valid');
      } else {
        toast.error(`Certificate validation failed: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Validation failed: ${error.message}`);
    }
  };

  const handleSaveStep = async (step: number) => {
    try {
      if (step === 1) {
        await saveTechConfig.mutateAsync({
          applicationId,
          ...techConfig,
        });
        toast.success('Technical configuration saved');
      } else if (step === 2) {
        const result = await saveSecurityCreds.mutateAsync({
          applicationId,
          ...securityCreds,
        });
        if (result.apiKey) {
          setGeneratedApiKey(result.apiKey);
        }
        toast.success('Security credentials saved');
      } else if (step === 3) {
        await saveNetworkConfig.mutateAsync({
          applicationId,
          ...networkConfig,
        });
        toast.success('Network configuration saved');
      }
    } catch (error: any) {
      toast.error(`Save failed: ${error.message}`);
    }
  };

  const handleNextStep = async () => {
    await handleSaveStep(currentStep);
    setCurrentStep(currentStep + 1);
  };

  const handlePreviousStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmitForReview = async () => {
    setIsSubmitting(true);
    try {
      // Save current step first
      await handleSaveStep(currentStep);
      
      // Submit for review
      await submitForReview.mutateAsync({ applicationId });
      
      toast.success('Submitted for review successfully!');
      navigate('/onboarding/status');
    } catch (error: any) {
      toast.error(`Submission failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Technical Onboarding</h1>
        <p className="text-muted-foreground">
          Configure your technical specifications, security credentials, and network settings
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[
            { num: 1, title: 'Technical Specs' },
            { num: 2, title: 'Security' },
            { num: 3, title: 'Network' },
            { num: 4, title: 'Compliance' },
          ].map((step, index) => (
            <div key={step.num} className="flex items-center">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  currentStep >= step.num
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground text-muted-foreground'
                }`}
              >
                {currentStep > step.num ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  step.num
                )}
              </div>
              <div className="ml-2 text-sm font-medium">{step.title}</div>
              {index < 3 && (
                <div
                  className={`w-16 h-0.5 mx-4 ${
                    currentStep > step.num ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content - Continued in next part */}
      {renderStepContent()}

      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <Button
          variant="outline"
          onClick={handlePreviousStep}
          disabled={currentStep === 1}
        >
          Previous
        </Button>
        
        {currentStep < 4 ? (
          <Button onClick={handleNextStep}>
            Save & Continue
          </Button>
        ) : (
          <Button
            onClick={handleSubmitForReview}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit for Review'
            )}
          </Button>
        )}
      </div>
    </div>
  );

  function renderStepContent() {
    switch (currentStep) {
      case 1:
        return renderTechnicalSpecs();
      case 2:
        return renderSecurityCredentials();
      case 3:
        return renderNetworkConfiguration();
      case 4:
        return renderCompliance();
      default:
        return null;
    }
  }

  function renderTechnicalSpecs() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Technical Specifications</CardTitle>
          <CardDescription>
            Configure your API endpoints and system capabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* API Endpoints */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">API Endpoints</h3>
            
            <div className="space-y-2">
              <Label htmlFor="primaryEndpoint">Primary Endpoint *</Label>
              <div className="flex gap-2">
                <Input
                  id="primaryEndpoint"
                  type="url"
                  placeholder="https://api.example.com"
                  value={techConfig.primaryEndpoint}
                  onChange={(e) =>
                    setTechConfig({ ...techConfig, primaryEndpoint: e.target.value })
                  }
                />
                <Button
                  variant="outline"
                  onClick={handleTestEndpoint}
                  disabled={testEndpoint.isPending}
                >
                  {testEndpoint.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Test'
                  )}
                </Button>
              </div>
              {endpointTestResult && (
                <div className="flex items-center gap-2 text-sm">
                  {endpointTestResult.success ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">
                        Endpoint reachable ({endpointTestResult.responseTime}ms)
                      </span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span className="text-red-600">{endpointTestResult.error}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="backupEndpoint">Backup Endpoint</Label>
              <Input
                id="backupEndpoint"
                type="url"
                placeholder="https://backup-api.example.com"
                value={techConfig.backupEndpoint}
                onChange={(e) =>
                  setTechConfig({ ...techConfig, backupEndpoint: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <Input
                id="webhookUrl"
                type="url"
                placeholder="https://api.example.com/webhooks"
                value={techConfig.webhookUrl}
                onChange={(e) =>
                  setTechConfig({ ...techConfig, webhookUrl: e.target.value })
                }
              />
            </div>
          </div>

          {/* System Capabilities */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">System Capabilities</h3>
            
            <div className="space-y-2">
              <Label htmlFor="transactionCapacity">Transaction Capacity (TPS)</Label>
              <Input
                id="transactionCapacity"
                type="number"
                placeholder="1000"
                value={techConfig.transactionCapacity || ''}
                onChange={(e) =>
                  setTechConfig({
                    ...techConfig,
                    transactionCapacity: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Supported Message Formats</Label>
              <div className="flex gap-4">
                {['ISO8583', 'JSON', 'XML'].map((format) => (
                  <div key={format} className="flex items-center gap-2">
                    <Checkbox
                      id={`format-${format}`}
                      checked={techConfig.supportedFormats.includes(format)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTechConfig({
                            ...techConfig,
                            supportedFormats: [...techConfig.supportedFormats, format],
                          });
                        } else {
                          setTechConfig({
                            ...techConfig,
                            supportedFormats: techConfig.supportedFormats.filter(
                              (f) => f !== format
                            ),
                          });
                        }
                      }}
                    />
                    <Label htmlFor={`format-${format}`}>{format}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Supported Protocols</Label>
              <div className="flex gap-4">
                {['REST', 'SOAP', 'gRPC'].map((protocol) => (
                  <div key={protocol} className="flex items-center gap-2">
                    <Checkbox
                      id={`protocol-${protocol}`}
                      checked={techConfig.protocols.includes(protocol)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTechConfig({
                            ...techConfig,
                            protocols: [...techConfig.protocols, protocol],
                          });
                        } else {
                          setTechConfig({
                            ...techConfig,
                            protocols: techConfig.protocols.filter((p) => p !== protocol),
                          });
                        }
                      }}
                    />
                    <Label htmlFor={`protocol-${protocol}`}>{protocol}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Transaction Limits */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Transaction Limits</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="minAmount">Minimum Amount</Label>
                <Input
                  id="minAmount"
                  type="number"
                  placeholder="100"
                  value={techConfig.minTransactionAmount || ''}
                  onChange={(e) =>
                    setTechConfig({
                      ...techConfig,
                      minTransactionAmount: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxAmount">Maximum Amount</Label>
                <Input
                  id="maxAmount"
                  type="number"
                  placeholder="1000000"
                  value={techConfig.maxTransactionAmount || ''}
                  onChange={(e) =>
                    setTechConfig({
                      ...techConfig,
                      maxTransactionAmount: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dailyLimit">Daily Limit</Label>
                <Input
                  id="dailyLimit"
                  type="number"
                  placeholder="10000000"
                  value={techConfig.dailyTransactionLimit || ''}
                  onChange={(e) =>
                    setTechConfig({
                      ...techConfig,
                      dailyTransactionLimit: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="velocityLimit">Velocity Limit (per minute)</Label>
                <Input
                  id="velocityLimit"
                  type="number"
                  placeholder="100"
                  value={techConfig.velocityLimit || ''}
                  onChange={(e) =>
                    setTechConfig({
                      ...techConfig,
                      velocityLimit: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderSecurityCredentials() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Security Credentials</CardTitle>
          <CardDescription>
            Configure SSL certificates and authentication credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* SSL Certificate */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">SSL/TLS Certificate</h3>
            
            <div className="space-y-2">
              <Label htmlFor="sslCertificate">SSL Certificate (PEM format) *</Label>
              <Textarea
                id="sslCertificate"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                rows={8}
                value={securityCreds.sslCertificate}
                onChange={(e) =>
                  setSecurityCreds({ ...securityCreds, sslCertificate: e.target.value })
                }
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleValidateCertificate}
                disabled={validateCert.isPending}
              >
                {validateCert.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Validate Certificate
              </Button>
              {certValidationResult && (
                <div className="flex items-start gap-2 text-sm p-3 rounded-md bg-muted">
                  {certValidationResult.valid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
                      <div>
                        <div className="text-green-600 font-medium">Certificate is valid</div>
                        <div className="text-muted-foreground mt-1">
                          Issuer: {certValidationResult.issuer}
                        </div>
                        <div className="text-muted-foreground">
                          Expires: {new Date(certValidationResult.validTo).toLocaleDateString()} 
                          ({certValidationResult.daysUntilExpiry} days remaining)
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 text-red-600 mt-0.5" />
                      <div className="text-red-600">{certValidationResult.error}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">API Authentication</h3>
            
            {generatedApiKey && (
              <div className="space-y-2">
                <Label>Generated API Key</Label>
                <div className="flex gap-2">
                  <Input
                    value={generatedApiKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedApiKey);
                      toast.success('API key copied to clipboard');
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Save this API key securely. It will be used for authentication.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="oauthClientId">OAuth Client ID (Optional)</Label>
              <Input
                id="oauthClientId"
                placeholder="client_id_here"
                value={securityCreds.oauthClientId}
                onChange={(e) =>
                  setSecurityCreds({ ...securityCreds, oauthClientId: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jwtPublicKey">JWT Public Key (Optional)</Label>
              <Textarea
                id="jwtPublicKey"
                placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"
                rows={6}
                value={securityCreds.jwtPublicKey}
                onChange={(e) =>
                  setSecurityCreds({ ...securityCreds, jwtPublicKey: e.target.value })
                }
              />
            </div>
          </div>

          {/* HSM */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="hsmEnabled"
              checked={securityCreds.hsmEnabled}
              onCheckedChange={(checked) =>
                setSecurityCreds({ ...securityCreds, hsmEnabled: checked as boolean })
              }
            />
            <Label htmlFor="hsmEnabled">
              Hardware Security Module (HSM) Enabled
            </Label>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderNetworkConfiguration() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Network Configuration</CardTitle>
          <CardDescription>
            Configure VPN, load balancing, and network topology
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* VPN Configuration */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">VPN Configuration</h3>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="vpnRequired"
                checked={networkConfig.vpnRequired}
                onCheckedChange={(checked) =>
                  setNetworkConfig({ ...networkConfig, vpnRequired: checked as boolean })
                }
              />
              <Label htmlFor="vpnRequired">VPN Required</Label>
            </div>

            {networkConfig.vpnRequired && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="vpnType">VPN Type</Label>
                  <Select
                    value={networkConfig.vpnType}
                    onValueChange={(value) =>
                      setNetworkConfig({ ...networkConfig, vpnType: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select VPN type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ipsec">IPSec</SelectItem>
                      <SelectItem value="openvpn">OpenVPN</SelectItem>
                      <SelectItem value="wireguard">WireGuard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vpnEndpoint">VPN Endpoint</Label>
                  <Input
                    id="vpnEndpoint"
                    placeholder="vpn.example.com:1194"
                    value={networkConfig.vpnEndpoint}
                    onChange={(e) =>
                      setNetworkConfig({ ...networkConfig, vpnEndpoint: e.target.value })
                    }
                  />
                </div>
              </>
            )}
          </div>

          {/* Load Balancing */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Load Balancing</h3>
            
            <div className="space-y-2">
              <Label htmlFor="loadBalancerEndpoint">Load Balancer Endpoint</Label>
              <Input
                id="loadBalancerEndpoint"
                placeholder="https://lb.example.com"
                value={networkConfig.loadBalancerEndpoint}
                onChange={(e) =>
                  setNetworkConfig({
                    ...networkConfig,
                    loadBalancerEndpoint: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="healthCheckUrl">Health Check URL *</Label>
              <Input
                id="healthCheckUrl"
                placeholder="https://api.example.com/health"
                value={networkConfig.healthCheckUrl}
                onChange={(e) =>
                  setNetworkConfig({ ...networkConfig, healthCheckUrl: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeoutSeconds">Timeout (seconds)</Label>
                <Input
                  id="timeoutSeconds"
                  type="number"
                  placeholder="30"
                  value={networkConfig.timeoutSeconds}
                  onChange={(e) =>
                    setNetworkConfig({
                      ...networkConfig,
                      timeoutSeconds: parseInt(e.target.value) || 30,
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Documentation */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Network Documentation</h3>
            
            <div className="space-y-2">
              <Label htmlFor="topologyDiagram">Network Topology Diagram URL</Label>
              <Input
                id="topologyDiagram"
                placeholder="https://docs.example.com/topology.pdf"
                value={networkConfig.topologyDiagramUrl}
                onChange={(e) =>
                  setNetworkConfig({
                    ...networkConfig,
                    topologyDiagramUrl: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="firewallRules">Firewall Rules Documentation URL</Label>
              <Input
                id="firewallRules"
                placeholder="https://docs.example.com/firewall.pdf"
                value={networkConfig.firewallRulesDoc}
                onChange={(e) =>
                  setNetworkConfig({ ...networkConfig, firewallRulesDoc: e.target.value })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  function renderCompliance() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compliance & Documentation</CardTitle>
          <CardDescription>
            Upload compliance certificates and attestations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Required Compliance Documents</h3>
            
            <div className="space-y-4">
              {['PCI DSS', 'SOC 2', 'ISO 27001'].map((docType) => (
                <div key={docType} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-base font-medium">{docType} Certificate</Label>
                    <Button variant="outline" size="sm">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Upload your {docType} compliance certificate (PDF format)
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Data Residency</h3>
            
            <div className="space-y-2">
              <Label htmlFor="dataLocation">Data Storage Location</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="us">United States</SelectItem>
                  <SelectItem value="eu">European Union</SelectItem>
                  <SelectItem value="ap">Asia Pacific</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="gdprCompliant" />
              <Label htmlFor="gdprCompliant">GDPR Compliant</Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="crossBorder" />
              <Label htmlFor="crossBorder">Cross-Border Data Transfer Enabled</Label>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-blue-900 mb-1">Ready to Submit?</h4>
                <p className="text-sm text-blue-800">
                  Once you submit, your technical onboarding will be reviewed by our team. 
                  You'll be notified of the review status within 2-3 business days.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
}
