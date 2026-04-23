import { Router } from "express";
import Integration from "../models/Integration.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

// list integrations
router.get("/", authenticate, async (req, res) => {
  try {
    const integrations = await Integration.find();
    res.json(integrations);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// upsert integration
router.post("/", authenticate, async (req, res) => {
  try {
    const { key, label, enabled, configuredBy, notes, credentials } = req.body;
    
    // Find if the integration exists
    let integration = await Integration.findOne({ key });
    
    if (integration) {
      integration.label = label !== undefined ? label : integration.label;
      integration.enabled = enabled !== undefined ? enabled : integration.enabled;
      integration.configuredBy = configuredBy !== undefined ? configuredBy : integration.configuredBy;
      integration.notes = notes !== undefined ? notes : integration.notes;
      if (credentials !== undefined) {
        if (!integration.credentials) integration.credentials = new Map();
        for (const [k, v] of Object.entries(credentials)) {
          integration.credentials.set(k, v);
        }
      }
      await integration.save();
    } else {
      integration = await Integration.create({
        key,
        label,
        enabled: enabled ?? false,
        configuredBy,
        notes,
        credentials,
      });
    }

    res.json(integration);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// toggle integration
router.put("/:key/toggle", authenticate, async (req, res) => {
  try {
    const { key } = req.params;
    const { enabled } = req.body;

    const integration = await Integration.findOne({ key });
    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    integration.enabled = enabled;
    await integration.save();

    res.json(integration);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
