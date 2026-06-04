export const SMS_TEMPLATES: Record<string, { en: string; ha: string; yo: string; ig: string }> = {
  policy_issued: {
    en: "InsurePortal: Your {type} insurance policy {policyNumber} is now active. Coverage: N{coverage}. Expires: {expiry}. Download app: insureportal.ng/app",
    ha: "InsurePortal: Inshorar {type} {policyNumber} ya fara aiki. Kariya: N{coverage}. Ya kare: {expiry}.",
    yo: "InsurePortal: Eto iṣeduro {type} {policyNumber} ti ṣiṣẹ. Aabo: N{coverage}. Pari: {expiry}.",
    ig: "InsurePortal: Nkwekọrịta {type} {policyNumber} adịla. Nchekwa: N{coverage}. Njedebe: {expiry}.",
  },
  claim_filed: {
    en: "InsurePortal: Claim #{claimId} filed successfully. Type: {type}. Amount: N{amount}. Track at insureportal.ng/claims",
    ha: "InsurePortal: Neman biya #{claimId} ya yi nasara. Nau'i: {type}. Adadin: N{amount}.",
    yo: "InsurePortal: Ẹbẹ #{claimId} ti fi silẹ. Iru: {type}. Iye: N{amount}.",
    ig: "InsurePortal: Arịrịọ #{claimId} ezigara nke ọma. Udi: {type}. Ego: N{amount}.",
  },
  claim_approved: {
    en: "InsurePortal: Great news! Claim #{claimId} APPROVED. Payout: N{amount}. Funds will be credited within 48hrs.",
    ha: "InsurePortal: Labari mai dadi! Neman biya #{claimId} AN AMINCE. Biya: N{amount}.",
    yo: "InsurePortal: Iroyin rere! Ẹbẹ #{claimId} TI FỌWỌSI. Isanwo: N{amount}.",
    ig: "InsurePortal: Ozi ọma! Arịrịọ #{claimId} AKWADORO. Ụgwọ: N{amount}.",
  },
  claim_rejected: {
    en: "InsurePortal: Claim #{claimId} was not approved. Reason: {reason}. Call +234-800-INSURE-1 for assistance.",
    ha: "InsurePortal: Ba a amince da neman biya #{claimId} ba. Dalili: {reason}.",
    yo: "InsurePortal: Ẹbẹ #{claimId} ko gba ifọwọsi. Idi: {reason}.",
    ig: "InsurePortal: Ahapụghị arịrịọ #{claimId}. Ihe kpatara: {reason}.",
  },
  premium_due: {
    en: "InsurePortal: Premium of N{amount} due on {dueDate} for {type} policy {policyNumber}. Pay via *384*100# or insureportal.ng/pay",
    ha: "InsurePortal: Premium N{amount} zai biya a {dueDate} don {type} inshorar {policyNumber}.",
    yo: "InsurePortal: Premium N{amount} tó ní {dueDate} fun {type} eto {policyNumber}.",
    ig: "InsurePortal: Premium N{amount} kwesịrị ịkwụ na {dueDate} maka {type} nkwekọrịta {policyNumber}.",
  },
  premium_received: {
    en: "InsurePortal: Payment of N{amount} received for policy {policyNumber}. Thank you! Next due: {nextDue}.",
    ha: "InsurePortal: An karbi biya N{amount} don inshorar {policyNumber}. Nagode!",
    yo: "InsurePortal: Ìsanwó N{amount} ti gba fun eto {policyNumber}. O ṣeun!",
    ig: "InsurePortal: Anatara ụgwọ N{amount} maka nkwekọrịta {policyNumber}. Daalụ!",
  },
  renewal_reminder: {
    en: "InsurePortal: Your {type} policy {policyNumber} expires in {days} days. Renew now at insureportal.ng or dial *384*100#",
    ha: "InsurePortal: Inshorar {type} {policyNumber} zai kare cikin kwana {days}.",
    yo: "InsurePortal: Eto iṣeduro {type} {policyNumber} yóò parí ní ọjọ {days}.",
    ig: "InsurePortal: Nkwekọrịta {type} {policyNumber} ga-agwụ n'ụbọchị {days}.",
  },
  otp: {
    en: "InsurePortal: Your verification code is {code}. Valid for 10 minutes. Do not share.",
    ha: "InsurePortal: Lambar tabbatarwa ta shine {code}. Tana aiki na minti 10.",
    yo: "InsurePortal: Kóòdù ìjẹ́rìísí rẹ ni {code}. Ó wúlò fún ìṣẹ́jú 10.",
    ig: "InsurePortal: Koodu nkwenye gị bụ {code}. Ọ dị ire ruo nkeji 10.",
  },
  emergency: {
    en: "InsurePortal EMERGENCY: Incident reported at {location}. Ref: {refId}. Emergency services notified. Stay safe.",
    ha: "InsurePortal GAGGAWA: An ba da rahoton lamari a {location}. Ref: {refId}.",
    yo: "InsurePortal PÀJÁWÍRÌ: Ìṣẹ̀lẹ̀ tí a ròyìn ní {location}. Ref: {refId}.",
    ig: "InsurePortal MBEREDE: A kọrọ ihe mere na {location}. Ref: {refId}.",
  },
};

export function renderTemplate(templateKey: string, language: string, vars: Record<string, string>): string {
  const template = SMS_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown template: ${templateKey}`);
  const lang = (language in template ? language : "en") as keyof typeof template;
  let message = template[lang];
  for (const [key, value] of Object.entries(vars)) {
    message = message.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return message;
}
