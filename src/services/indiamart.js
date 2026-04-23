import axios from "axios";
import User from "../models/User.js";
import Lead from "../models/Lead.js";

// Fetch leads from IndiaMART API
export const fetchIndiaMartLeads = async (apiKey, startTime = null) => {
  const baseUrl = "https://mapi.indiamart.com/wservce/crm/crmListing/v2/";
  let url = `${baseUrl}?glusr_crm_key=${apiKey}`;

  if (startTime) {
    // Format date for IndiaMART API (DD-MM-YYYYHH:MM:SS)
    const formatIMDate = (d) => {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const pad = (n) => n.toString().padStart(2, '0');
      return `${pad(d.getDate())}-${months[d.getMonth()]}-${d.getFullYear()}${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    url += `&start_time=${formatIMDate(startTime)}`;
  }

  const response = await axios.get(url);
  return response.data;
};

// Save leads to database, avoiding duplicates
export const saveLeads = async (leads, userId) => {
  let imported = 0;
  let skipped = 0;

  for (const lead of leads) {
    try {
      // Check for existing lead by externalId
      const existing = await Lead.findOne({ externalId: lead.UNIQUE_QUERY_ID });
      if (existing) {
        skipped++;
        continue;
      }

      // Create new lead
      await Lead.create({
        name: lead.SENDER_NAME || "Unknown",
        company: lead.SENDER_COMPANY || "",
        email: lead.SENDER_EMAIL || "",
        phone: lead.SENDER_MOBILE || "",
        source: "indiaMart",
        status: "new",
        externalId: lead.UNIQUE_QUERY_ID,
        notes: lead.QUERY_MESSAGE || "",
        tags: [lead.CITY, lead.STATE, lead.CATEGORY].filter(Boolean),
        lastActivity: new Date().toISOString(),
        createdAt: lead.QUERY_TIME ? new Date(lead.QUERY_TIME) : new Date(),
      });

      imported++;
    } catch (error) {
      console.error("Error saving lead:", lead.UNIQUE_QUERY_ID, error.message);
      skipped++;
    }
  }

  return { imported, skipped };
};

// Sync leads for a specific user
export const syncIndiaMartLeadsForUser = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user?.indiamart?.apiKey || !user.indiamart.isActive) {
      return { success: false, message: "IndiaMART not configured for this user" };
    }

    const startTime = user.indiamart.lastFetchedAt || new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours if no previous fetch

    const data = await fetchIndiaMartLeads(user.indiamart.apiKey, startTime);

    if (!data?.RESPONSE || !Array.isArray(data.RESPONSE)) {
      return { success: false, message: "Invalid response from IndiaMART API" };
    }

    const result = await saveLeads(data.RESPONSE, userId);

    // Update last fetched timestamp
    await User.findByIdAndUpdate(userId, {
      "indiamart.lastFetchedAt": new Date()
    });

    return {
      success: true,
      imported: result.imported,
      skipped: result.skipped,
      totalProcessed: data.RESPONSE.length
    };

  } catch (error) {
    console.error("IndiaMART sync error for user", userId, ":", error.message);
    return { success: false, message: error.message };
  }
};

// Sync leads for all users with IndiaMART configured
export const syncAllIndiaMartLeads = async () => {
  console.log("🔄 Starting IndiaMART lead sync for all users...");

  const users = await User.find({ "indiamart.apiKey": { $exists: true }, "indiamart.isActive": true });

  let totalImported = 0;
  let totalSkipped = 0;
  let userResults = [];

  for (const user of users) {
    const result = await syncIndiaMartLeadsForUser(user._id);
    if (result.success) {
      totalImported += result.imported;
      totalSkipped += result.skipped;
      userResults.push({
        userId: user._id,
        email: user.email,
        imported: result.imported,
        skipped: result.skipped
      });
    }
  }

  console.log(`✅ IndiaMART sync complete: ${totalImported} imported, ${totalSkipped} skipped`);
  return { totalImported, totalSkipped, userResults };
};