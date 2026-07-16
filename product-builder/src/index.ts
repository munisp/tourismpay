import express from "express";
import { ProductBuilderEngine } from "./engine/builder";
import { PremiumFormulaEngine } from "./engine/premium";
import { UnderwritingRuleEngine } from "./engine/underwriting";
import { ClaimsWorkflowEngine } from "./engine/claims-workflow";

const app = express();
app.use(express.json());

const builder = new ProductBuilderEngine();
const premiumEngine = new PremiumFormulaEngine();
const underwritingEngine = new UnderwritingRuleEngine();
const claimsEngine = new ClaimsWorkflowEngine();

// Product Builder API
app.get("/api/v1/builder/templates", (_req, res) => {
  res.json({ templates: builder.getTemplates() });
});

app.post("/api/v1/builder/products", (req, res) => {
  const product = builder.createProduct(req.body);
  res.status(201).json(product);
});

app.get("/api/v1/builder/products/:id", (req, res) => {
  const product = builder.getProduct(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

app.put("/api/v1/builder/products/:id", (req, res) => {
  const product = builder.updateProduct(req.params.id, req.body);
  res.json(product);
});

app.post("/api/v1/builder/products/:id/publish", (req, res) => {
  const result = builder.publishProduct(req.params.id);
  res.json(result);
});

// Premium Formula API
app.post("/api/v1/builder/premium/calculate", (req, res) => {
  const result = premiumEngine.calculate(req.body.formula, req.body.variables);
  res.json(result);
});

// Underwriting Rules API
app.post("/api/v1/builder/underwriting/evaluate", (req, res) => {
  const result = underwritingEngine.evaluate(req.body.rules, req.body.applicant);
  res.json(result);
});

// Claims Workflow API
app.post("/api/v1/builder/claims-workflow/evaluate", (req, res) => {
  const result = claimsEngine.evaluate(req.body.workflow, req.body.claim);
  res.json(result);
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy", service: "product-builder" });
});

const port = process.env.PORT || 8096;
app.listen(port, () => {
  console.log(`Product Builder listening on port ${port}`);
});
