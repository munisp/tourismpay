/**
 * W3C DID Resolver — Decentralized Identity resolution and verification.
 *
 * Supports:
 * - did:web (domain-based, easiest to deploy)
 * - did:key (Ed25519 public key based, no infrastructure needed)
 * - did:tourismpay (platform-specific method)
 *
 * W3C DID Core spec: https://www.w3.org/TR/did-core/
 * Verifiable Credentials: https://www.w3.org/TR/vc-data-model/
 */
import crypto from "crypto";
import { logger } from "../_core/logger";

// ─── Types (W3C DID Core) ────────────────────────────────────────────────────

export interface DIDDocument {
  "@context": string[];
  id: string;
  controller?: string;
  verificationMethod: VerificationMethod[];
  authentication: string[];
  assertionMethod?: string[];
  keyAgreement?: string[];
  service?: ServiceEndpoint[];
  created?: string;
  updated?: string;
}

interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, string>;
}

interface ServiceEndpoint {
  id: string;
  type: string;
  serviceEndpoint: string;
}

export interface VerifiableCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: string;
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: Record<string, unknown>;
  proof: {
    type: string;
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string;
  };
}

// ─── Key Generation ──────────────────────────────────────────────────────────

export function generateKeyPair(): { publicKey: string; privateKey: string; publicKeyMultibase: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pubDer = publicKey.export({ type: "spki", format: "der" });
  const privDer = privateKey.export({ type: "pkcs8", format: "der" });
  // Ed25519 public key raw bytes start at offset 12 in SPKI DER
  const rawPub = pubDer.subarray(12);
  // multibase: 'z' prefix + base58btc (we use base64url for simplicity)
  const multibase = "z" + rawPub.toString("base64url");

  return {
    publicKey: pubDer.toString("base64"),
    privateKey: privDer.toString("base64"),
    publicKeyMultibase: multibase,
  };
}

// ─── DID Methods ─────────────────────────────────────────────────────────────

/** Create a did:key DID from a public key */
export function createDidKey(publicKeyMultibase: string): DIDDocument {
  const did = `did:key:${publicKeyMultibase}`;
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed2519-2020/v1",
    ],
    id: did,
    verificationMethod: [{
      id: `${did}#${publicKeyMultibase}`,
      type: "Ed25519VerificationKey2020",
      controller: did,
      publicKeyMultibase,
    }],
    authentication: [`${did}#${publicKeyMultibase}`],
    assertionMethod: [`${did}#${publicKeyMultibase}`],
  };
}

/** Create a did:web DID for a user on the TourismPay domain */
export function createDidWeb(userId: string, domain = "tourismpay.com"): DIDDocument {
  const did = `did:web:${domain}:users:${userId}`;
  const keys = generateKeyPair();
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed2519-2020/v1",
    ],
    id: did,
    controller: `did:web:${domain}`,
    verificationMethod: [{
      id: `${did}#key-1`,
      type: "Ed25519VerificationKey2020",
      controller: did,
      publicKeyMultibase: keys.publicKeyMultibase,
    }],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`],
    service: [
      {
        id: `${did}#tourismpay-wallet`,
        type: "TourismPayWallet",
        serviceEndpoint: `https://${domain}/api/wallet/${userId}`,
      },
      {
        id: `${did}#tourismpay-profile`,
        type: "TourismPayProfile",
        serviceEndpoint: `https://${domain}/api/profile/${userId}`,
      },
    ],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

/** Create a platform-specific did:tourismpay DID */
export function createDidTourismPay(userId: string): { didDocument: DIDDocument; keyPair: { publicKey: string; privateKey: string } } {
  const keys = generateKeyPair();
  const did = `did:tourismpay:${userId}`;
  const doc: DIDDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed2519-2020/v1",
      "https://tourismpay.com/ns/did/v1",
    ],
    id: did,
    controller: "did:web:tourismpay.com",
    verificationMethod: [{
      id: `${did}#key-1`,
      type: "Ed25519VerificationKey2020",
      controller: did,
      publicKeyMultibase: keys.publicKeyMultibase,
    }],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`],
    keyAgreement: [`${did}#key-1`],
    service: [
      { id: `${did}#wallet`, type: "TourismPayWallet", serviceEndpoint: `https://api.tourismpay.com/wallet/${userId}` },
      { id: `${did}#kyc`, type: "KYCVerification", serviceEndpoint: `https://api.tourismpay.com/kyc/${userId}` },
    ],
    created: new Date().toISOString(),
  };
  return { didDocument: doc, keyPair: { publicKey: keys.publicKey, privateKey: keys.privateKey } };
}

// ─── DID Resolution ──────────────────────────────────────────────────────────

export async function resolveDid(did: string): Promise<DIDDocument | null> {
  const [, method, ...rest] = did.split(":");
  const specificId = rest.join(":");

  switch (method) {
    case "web": {
      // Resolve did:web by fetching .well-known/did.json from the domain
      const domain = specificId.split(":")[0];
      const path = specificId.includes(":") ? specificId.replace(/:/g, "/") : ".well-known";
      const url = `https://${domain}/${path}/did.json`;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return null;
        return await res.json() as DIDDocument;
      } catch (err) {
        logger.warn("[DID] Failed to resolve did:web", { did, error: err instanceof Error ? err.message : String(err) });
        return null;
      }
    }

    case "key": {
      const multibase = specificId;
      return createDidKey(multibase);
    }

    case "tourismpay": {
      // Resolve from our own DB (would be the identity router)
      logger.info("[DID] Resolving did:tourismpay locally", { specificId });
      return null; // Caller should check local DB
    }

    default:
      logger.warn("[DID] Unknown DID method", { method, did });
      return null;
  }
}

// ─── Verifiable Credentials ──────────────────────────────────────────────────

export function issueCredential(
  issuerDid: string,
  subjectDid: string,
  credentialType: string,
  claims: Record<string, unknown>,
  privateKeyBase64: string,
  expirationDate?: string,
): VerifiableCredential {
  const credId = `urn:uuid:${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const credentialWithoutProof = {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://tourismpay.com/ns/credentials/v1",
    ],
    id: credId,
    type: ["VerifiableCredential", credentialType],
    issuer: issuerDid,
    issuanceDate: now,
    ...(expirationDate ? { expirationDate } : {}),
    credentialSubject: { id: subjectDid, ...claims },
  };

  // Sign with Ed25519
  const dataToSign = JSON.stringify(credentialWithoutProof);
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const signature = crypto.sign(null, Buffer.from(dataToSign), privateKey);
  const proofValue = signature.toString("base64url");

  return {
    ...credentialWithoutProof,
    proof: {
      type: "Ed25519Signature2020",
      created: now,
      verificationMethod: `${issuerDid}#key-1`,
      proofPurpose: "assertionMethod",
      proofValue,
    },
  };
}

export function verifyCredential(credential: VerifiableCredential, publicKeyBase64: string): boolean {
  try {
    const { proof, ...credentialWithoutProof } = credential;
    const dataToVerify = JSON.stringify(credentialWithoutProof);
    const publicKey = crypto.createPublicKey({
      key: Buffer.from(publicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, Buffer.from(dataToVerify), publicKey, Buffer.from(proof.proofValue, "base64url"));
  } catch {
    return false;
  }
}
